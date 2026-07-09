import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { detect } from './detect.js';
import { BENCHMARK_ALLOWLIST, pinVersion, propose, runAdvise, verify } from './advise.js';
import type { EvidenceEnv } from './evidence.js';
import type { AdviseOptions, Claim, PackageJson, SecurityPosture } from './types.js';

const OPTS: AdviseOptions = { offline: false, noCache: true, refresh: false };

function fixture(pkg: PackageJson, files: Record<string, string> = {}): string {
  const d = fs.mkdtempSync(path.join(os.tmpdir(), 'bfadv-'));
  fs.writeFileSync(path.join(d, 'package.json'), JSON.stringify(pkg));
  for (const [f, c] of Object.entries(files)) {
    const full = path.join(d, f);
    fs.mkdirSync(path.dirname(full), { recursive: true });
    fs.writeFileSync(full, c);
  }
  return d;
}

function env(fetchImpl: unknown): EvidenceEnv {
  return { fetch: fetchImpl as typeof fetch, now: () => 1_000_000, cacheDir: null, timeoutMs: 2000 };
}

function res(status: number, body: unknown): unknown {
  return { status, ok: status >= 200 && status < 300, json: async () => body };
}

/** Routes scorecard vs osv by URL so one stub serves both adapters. */
function stub(sc: unknown, adv: unknown) {
  return async (url: string) => (url.includes('securityscorecards') ? res(...(sc as [number, unknown])) : res(...(adv as [number, unknown])));
}

const SCORED: SecurityPosture = {
  scorecard: { ok: true, url: 'https://api.securityscorecards.dev/projects/github.com/vitejs/vite', score: 6.8 },
  osv: { ok: true, url: 'https://api.osv.dev/v1/query', advisories: [{ id: 'GHSA-real', summary: 's' }] },
};
const NO_DATA: SecurityPosture = { scorecard: { ok: false, url: 'u', reason: 'no-data' }, osv: null };

// --------------------------------------------------------------------------
// The verifier must be able to FAIL. A grader that only ever passes is theater.
// --------------------------------------------------------------------------

test('verifier REJECTS a hallucinated Scorecard score', () => {
  const c: Claim = {
    tier: 'green', id: 'x', msg: 'Scorecard: 9.9/10', score: 9.9,
    provenance: { source: 'openssf-scorecard', citation: SCORED.scorecard!.url, url: SCORED.scorecard!.url },
  };
  const r = verify(c, SCORED);
  assert.equal(r.verified, false);
  assert.equal(r.tier, 'red'); // downgraded, never dropped
  assert.match(r.verifierNote!, /does not match the source \(6\.8\)/);
  assert.match(r.msg, /^UNVERIFIED/);
});

test('verifier REJECTS a claim citing google/tools-benchmark (it does not exist)', () => {
  assert.equal(BENCHMARK_ALLOWLIST.has('github.com/google/tools-benchmark'), false);
  const c: Claim = {
    tier: 'green', id: 'y', msg: 'fastest per benchmark',
    provenance: { source: 'benchmark-repo', citation: 'github.com/google/tools-benchmark' },
  };
  const r = verify(c, SCORED);
  assert.equal(r.verified, false);
  assert.match(r.verifierNote!, /not a verified source/);
});

test('verifier REJECTS an invented advisory id', () => {
  const c: Claim = {
    tier: 'red', id: 'z', msg: 'advisory', advisoryIds: ['GHSA-0000-0000-0000'],
    provenance: { source: 'osv', citation: SCORED.osv!.url, url: SCORED.osv!.url },
  };
  const r = verify(c, SCORED);
  assert.equal(r.verified, false);
  assert.match(r.verifierNote!, /does not exist in the source/);
});

test('verifier REJECTS a score when the adapter returned no data', () => {
  const c: Claim = {
    tier: 'green', id: 'w', msg: 'Scorecard: 7.0', score: 7.0,
    provenance: { source: 'openssf-scorecard', citation: 'u', url: 'u' },
  };
  const r = verify(c, NO_DATA);
  assert.equal(r.verified, false);
  assert.match(r.verifierNote!, /returned no score/);
});

test('verifier REJECTS an unknown rule id and a rule carrying a number', () => {
  assert.equal(verify({ tier: 'green', id: 'a', msg: 'm', provenance: { source: 'rule', citation: 'rule:invented' } }, SCORED).verified, false);
  assert.equal(verify({ tier: 'green', id: 'b', msg: 'm', score: 3, provenance: { source: 'rule', citation: 'rule:csr-default-vite' } }, SCORED).verified, false);
});

test('verifier REJECTS an archived source cited without an archived marker', () => {
  const bare: Claim = { tier: 'green', id: 'c', msg: 'Go is fastest', provenance: { source: 'benchmark-repo', citation: 'techempower.com/benchmarks' } };
  assert.equal(verify(bare, SCORED).verified, false);
  const marked: Claim = { ...bare, msg: 'per TechEmpower (archived 2026-03)' };
  assert.equal(verify(marked, SCORED).verified, true);
});

test('verifier ACCEPTS claims whose provenance resolves', () => {
  const score: Claim = { tier: 'green', id: 'd', msg: '6.8', score: 6.8, provenance: { source: 'openssf-scorecard', citation: SCORED.scorecard!.url, url: SCORED.scorecard!.url } };
  assert.equal(verify(score, SCORED).verified, true);
  const adv: Claim = { tier: 'red', id: 'e', msg: 'a', advisoryIds: ['GHSA-real'], provenance: { source: 'osv', citation: SCORED.osv!.url, url: SCORED.osv!.url } };
  assert.equal(verify(adv, SCORED).verified, true);
  const rule: Claim = { tier: 'green', id: 'f', msg: 'm', provenance: { source: 'rule', citation: 'rule:csr-default-vite' } };
  assert.equal(verify(rule, SCORED).verified, true);
});

test('verifier does not double-prefix a claim it rejects twice', () => {
  const c: Claim = { tier: 'green', id: 'g', msg: 'bad', score: 9.9, provenance: { source: 'openssf-scorecard', citation: SCORED.scorecard!.url, url: SCORED.scorecard!.url } };
  const twice = verify(verify(c, SCORED), SCORED);
  assert.equal((twice.msg.match(/UNVERIFIED/g) ?? []).length, 1);
});

// --------------------------------------------------------------------------
// The honesty invariant
// --------------------------------------------------------------------------

test('no claim carries a number when the source has none', () => {
  const d = detect(fixture({ devDependencies: { '@rspack/core': '1' }, scripts: { build: 'rspack build' } }, { 'rspack.config.js': '' }));
  for (const c of propose(d, NO_DATA)) assert.equal(c.score, undefined);
});

test('a missing Scorecard reports "no data", not a zero', () => {
  const d = detect(fixture({ devDependencies: { '@rspack/core': '1' }, scripts: { build: 'rspack build' } }, { 'rspack.config.js': '' }));
  const claims = propose(d, NO_DATA);
  assert.ok(claims.some((c) => /no data exists/.test(c.msg)));
});

test('an unmapped bundler SAYS its security check did not run', () => {
  // Silently skipping a security check is the failure this tool exists to stop.
  const d = detect(fixture({ devDependencies: { gulp: '4' }, scripts: { build: 'gulp' } }, { 'gulpfile.js': '' }));
  const claims = propose(d, { scorecard: null, osv: null });
  assert.ok(claims.some((c) => /Scorecard: not checked/.test(c.msg)));
  assert.ok(claims.some((c) => /OSV advisories: not checked/.test(c.msg)));
});

test('unpinned OSV results are labelled as NOT scoped to the install', () => {
  const d = detect(fixture({ dependencies: { vite: '*' }, scripts: { build: 'vite build' } }, { 'vite.config.js': '' }));
  const claims = propose(d, SCORED); // no pinnedVersion
  const osvClaim = claims.find((c) => c.id === 'osv');
  assert.ok(osvClaim, 'expected an osv claim');
  assert.match(osvClaim.msg, /NOT scoped to what you have installed/);
});

test('pinned OSV results name the version they are scoped to', () => {
  const d = detect(fixture({ dependencies: { vite: '^5.4.0' }, scripts: { build: 'vite build' } }, { 'vite.config.js': '' }));
  const claims = propose(d, { ...SCORED, pinnedVersion: '5.4.0' });
  const osvClaim = claims.find((c) => c.id === 'osv');
  assert.match(osvClaim!.msg, /affecting the declared version 5\.4\.0/);
});

// --------------------------------------------------------------------------
// pinVersion
// --------------------------------------------------------------------------

test('pinVersion narrows a range to its floor, and rejects non-versions', () => {
  assert.equal(pinVersion('^15.0.0'), '15.0.0');
  assert.equal(pinVersion('~5.4.2'), '5.4.2');
  assert.equal(pinVersion('>=1.2.3'), '1.2.3');
  assert.equal(pinVersion('^19.0.0-rc.1'), '19.0.0-rc.1');
  assert.equal(pinVersion('workspace:*'), null);
  assert.equal(pinVersion('*'), null);
  assert.equal(pinVersion(undefined), null);
});

// --------------------------------------------------------------------------
// The routing gates
// --------------------------------------------------------------------------

test('React Native / Expo names Re.Pack and warns it leaves official Expo', async () => {
  const d = detect(fixture({ dependencies: { expo: '51', 'react-native': '0.74' }, scripts: { start: 'expo start' } }));
  const a = await runAdvise(d, env(stub([404, null], [200, { vulns: [] }])), OPTS);
  const rn = a.claims.find((c) => c.id === 'rn-metro');
  assert.ok(rn, 'expected an rn-metro claim');
  assert.equal(rn.tier, 'red');
  assert.match(rn.fix!, /Re\.Pack/);
  assert.match(rn.fix!, /leaves the officially supported Expo/);
  assert.equal(a.redGate, true);
  // DOM-throughput advice is meaningless for React Native.
  assert.equal(a.claims.some((c) => c.id === 'ui-lib'), false);
});

test('an SSR project routes and gates red', async () => {
  const d = detect(fixture({ dependencies: { next: '15' }, scripts: { build: 'next build' } }));
  const a = await runAdvise(d, env(stub([404, null], [200, { vulns: [] }])), OPTS);
  assert.ok(a.claims.some((c) => c.id === 'render-route' && c.tier === 'red'));
  assert.equal(a.redGate, true);
});

test('a CSR project is advised toward Vite and gates green', async () => {
  const d = detect(fixture({ devDependencies: { webpack: '5' }, scripts: { build: 'webpack' } }));
  const a = await runAdvise(d, env(stub([200, { score: 5.6, date: '2026-07-06' }], [200, { vulns: [] }])), OPTS);
  assert.ok(a.claims.some((c) => c.id === 'pick-vite' && c.tier === 'green'));
  assert.ok(a.claims.some((c) => c.id === 'pick-rspack')); // webpack semantics
  assert.equal(a.redGate, false);
  assert.equal(a.claims.every((c) => c.verified), true);
});

test('runAdvise degrades offline without inventing anything, and does not gate red', async () => {
  const d = detect(fixture({ devDependencies: { vite: '5' }, scripts: { build: 'vite build' } }, { 'vite.config.js': '' }));
  let called = false;
  const e = env(() => { called = true; throw new Error('must not be called'); });
  const a = await runAdvise(d, e, { ...OPTS, offline: true });
  assert.equal(called, false);
  assert.equal(a.degraded, true);
  assert.equal(a.redGate, false); // offline alone must not fail CI
  assert.equal(a.claims.every((c) => c.score === undefined), true);
  assert.ok(a.claims.some((c) => /running offline/.test(c.msg)));
});

test('a live advisory gates red', async () => {
  const d = detect(fixture({ devDependencies: { vite: '^5.4.0' }, scripts: { build: 'vite build' } }, { 'vite.config.js': '' }));
  const a = await runAdvise(d, env(stub([200, { score: 6.8 }], [200, { vulns: [{ id: 'GHSA-xyz', summary: 's' }] }])), OPTS);
  const osvClaim = a.claims.find((c) => c.id === 'osv');
  assert.equal(osvClaim?.tier, 'red');
  assert.equal(a.redGate, true);
  assert.equal(osvClaim?.verified, true);
});
