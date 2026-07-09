import { test } from 'node:test';
import assert from 'node:assert/strict';
import { osv, scorecard } from './evidence.js';
import type { EvidenceEnv } from './evidence.js';
import type { AdviseOptions } from './types.js';

const OPTS: AdviseOptions = { offline: false, noCache: true, refresh: false };

/** An env with a stubbed fetch and NO cache dir — no test may touch the network. */
function env(fetchImpl: unknown, over: Partial<EvidenceEnv> = {}): EvidenceEnv {
  return {
    fetch: fetchImpl as typeof fetch,
    now: () => 1_000_000,
    cacheDir: null,
    timeoutMs: 2000,
    ...over,
  };
}

function res(status: number, body: unknown): unknown {
  return { status, ok: status >= 200 && status < 300, json: async () => body };
}

test('scorecard: a 200 yields the score verbatim, never rescaled', async () => {
  const e = env(async () => res(200, { score: 6.8, date: '2026-07-06', scorecard: { version: 'v5.5.1' } }));
  const r = await scorecard('vitejs/vite', e, OPTS);
  assert.equal(r.ok, true);
  assert.equal(r.score, 6.8); // exactly what the source said
  assert.equal(r.reportedAt, '2026-07-06');
  assert.equal(r.version, 'v5.5.1');
});

test('scorecard: a 404 is no-data, never a zero score', async () => {
  const e = env(async () => res(404, null));
  const r = await scorecard('web-infra-dev/rspack', e, OPTS);
  assert.equal(r.ok, false);
  assert.equal(r.reason, 'no-data');
  assert.equal(r.score, undefined); // the real rspack/bun/rolldown case
});

test('scorecard: a body without a numeric score is no-data', async () => {
  const e = env(async () => res(200, { date: '2026-07-06' }));
  const r = await scorecard('a/b', e, OPTS);
  assert.equal(r.ok, false);
  assert.equal(r.reason, 'no-data');
});

test('evidence: a throwing fetch degrades to unreachable, never throws', async () => {
  const e = env(async () => { throw new Error('ENOTFOUND'); });
  const r = await scorecard('a/b', e, OPTS);
  assert.equal(r.ok, false);
  assert.equal(r.reason, 'unreachable');
});

test('evidence: a hanging fetch degrades to timeout (the adapter enforces it)', async () => {
  // A fetch that ignores `signal` must not be able to hang the CLI forever.
  const e = env(() => new Promise(() => {}), { timeoutMs: 30 });
  const r = await scorecard('a/b', e, OPTS);
  assert.equal(r.ok, false);
  assert.equal(r.reason, 'timeout');
});

test('evidence: --offline short-circuits before fetch is ever called', async () => {
  let called = false;
  const e = env(() => { called = true; throw new Error('must not be called'); });
  const r = await scorecard('vitejs/vite', e, { ...OPTS, offline: true });
  assert.equal(called, false);
  assert.equal(r.ok, false);
  assert.equal(r.reason, 'offline');
});

test('osv: advisory ids come through verbatim', async () => {
  const e = env(async () => res(200, { vulns: [{ id: 'GHSA-aaaa', summary: 's1' }, { id: 'GHSA-bbbb', summary: 's2' }] }));
  const r = await osv('esbuild', e, OPTS);
  assert.equal(r.ok, true);
  assert.deepEqual(r.advisories?.map((a) => a.id), ['GHSA-aaaa', 'GHSA-bbbb']);
});

test('osv: an empty vulns list is CLEAN, not degraded', async () => {
  const e = env(async () => res(200, {}));
  const r = await osv('vite', e, OPTS);
  assert.equal(r.ok, true); // "we asked, there are none" is a real answer
  assert.deepEqual(r.advisories, []);
});

test('osv: a version is forwarded so the query is scoped to it', async () => {
  let sentBody = '';
  const e = env(async (_u: string, init: { body: string }) => { sentBody = init.body; return res(200, { vulns: [] }); });
  await osv('next', e, OPTS, '15.0.0');
  // Unscoped, OSV returns every advisory ever filed (55 for `next`) rather than
  // the 25 affecting this version — the query MUST carry the version.
  assert.match(sentBody, /"version":"15\.0\.0"/);
  assert.match(sentBody, /"ecosystem":"npm"/);
});

test('osv: with no version the query omits it (and the caller must say so)', async () => {
  let sentBody = '';
  const e = env(async (_u: string, init: { body: string }) => { sentBody = init.body; return res(200, { vulns: [] }); });
  await osv('next', e, OPTS);
  assert.doesNotMatch(sentBody, /"version"/);
});
