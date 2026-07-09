// advise.ts — recommend a bundler, UI library and rendering mode, and report the
// build tool's security posture.
//
// The shape is the loop-designer method compiled into data:
//
//   propose()  MAKER     — deterministic rules -> Claim[], each born with provenance
//   verify()   VERIFIER  — independent grader; re-resolves provenance against the
//                          ACTUAL adapter output and the allowlists it owns
//   runAdvise() LOOP     — maker -> verifier -> repair, bounded, fail-safe deny
//
// The verifier never reads the maker's prose and never trusts `provenance` at
// face value. A claim asserting a score the adapter never returned is rejected.
// That is what makes "never invent a number" enforceable instead of a promise.

import type {
  AdviseOptions,
  AdvisePlan,
  Claim,
  DetectResult,
  EvidenceResult,
  SecurityPosture,
  SourceBundler,
} from './types.js';
import type { EvidenceEnv } from './evidence.js';
import { osv, scorecard } from './evidence.js';

const MAX_ITER = 3;

/**
 * Bundler -> GitHub slug. Every slug verified to resolve (2026-07-09).
 * rspack, bun and rolldown have NO Scorecard entry — that is reported as
 * "no number exists", never as a zero.
 */
export const BUNDLER_REPO: Partial<Record<SourceBundler, string>> = {
  vite: 'vitejs/vite',
  webpack: 'webpack/webpack',
  esbuild: 'evanw/esbuild',
  rollup: 'rollup/rollup',
  parcel: 'parcel-bundler/parcel',
  rspack: 'web-infra-dev/rspack',
  bun: 'oven-sh/bun',
  metro: 'facebook/metro',
  next: 'vercel/next.js',
};

/**
 * The npm package to ask OSV about. Kept complete on purpose: a bundler missing
 * from here would be silently skipped, and a security check that quietly does
 * not run is worse than one that reports "unknown". `bun` really does carry 2
 * advisories and `@rspack/core` 1, so omitting them hid real findings.
 */
export const BUNDLER_PKG: Partial<Record<SourceBundler, string>> = {
  vite: 'vite',
  webpack: 'webpack',
  esbuild: 'esbuild',
  rollup: 'rollup',
  parcel: 'parcel',
  rspack: '@rspack/core',
  cra: 'react-scripts',
  craco: '@craco/craco',
  bun: 'bun',
  snowpack: 'snowpack',
  gulp: 'gulp',
  browserify: 'browserify',
  metro: 'metro',
  next: 'next',
};

/** Frozen rule ids. A `source:'rule'` claim citing anything else is rejected. */
export const RULE_IDS = new Set([
  'rule:csr-default-vite',
  'rule:keep-webpack-semantics-rspack',
  'rule:library-not-app-bundler',
  'rule:render-mode-route',
  'rule:rn-metro-official',
  'rule:no-scorecard-data',
  'rule:evidence-degraded',
  'rule:ui-lib-criteria',
  'rule:no-number-exists',
]);

/**
 * Benchmark repos verified alive (2026-07-09). `google/tools-benchmark` is
 * deliberately ABSENT — it does not exist (HTTP 404), so any claim citing it is
 * auto-rejected by the verifier. TechEmpower is frozen (archived 2026-03-24) and
 * may only be cited with an "archived" marker in the message.
 */
export const BENCHMARK_ALLOWLIST = new Set([
  'github.com/krausest/js-framework-benchmark',
  'github.com/rstackjs/build-tools-performance',
  'github.com/farm-fe/performance-compare',
  'github.com/callstack/repack',
  'techempower.com/benchmarks',
]);

const ARCHIVED_SOURCES = new Set(['techempower.com/benchmarks']);

// ---------------------------------------------------------------------------
// evidence gathering
// ---------------------------------------------------------------------------

/**
 * Narrow a package.json range to a concrete version OSV will accept.
 * `^15.0.0` -> `15.0.0`. OSV rejects ranges outright (returns `{}`), and
 * querying with NO version returns every advisory ever filed, so the declared
 * floor is the closest honest approximation of what is installed.
 * Returns null when the spec is not a plain version (workspace:, git URL, ...).
 */
export function pinVersion(spec: string | undefined): string | null {
  if (!spec) return null;
  const m = /^[~^>=<\s]*(\d+\.\d+\.\d+(?:-[\w.]+)?)/.exec(spec.trim());
  return m?.[1] ?? null;
}

export async function gatherEvidence(
  detected: DetectResult,
  env: EvidenceEnv,
  opts: AdviseOptions,
): Promise<SecurityPosture> {
  const bundler = detected.bundler;
  if (!bundler) return { scorecard: null, osv: null };

  const repo = BUNDLER_REPO[bundler];
  const pkg = BUNDLER_PKG[bundler];

  const deps = { ...detected.pkg.dependencies, ...detected.pkg.devDependencies };
  const version = pkg ? (pinVersion(deps[pkg]) ?? undefined) : undefined;

  const [sc, ad] = await Promise.all([
    repo ? scorecard(repo, env, opts) : Promise.resolve(null),
    pkg ? osv(pkg, env, opts, version) : Promise.resolve(null),
  ]);
  return { scorecard: sc, osv: ad, ...(version ? { pinnedVersion: version } : {}) };
}

// ---------------------------------------------------------------------------
// MAKER — deterministic rules. Every claim is born with provenance.
// ---------------------------------------------------------------------------

function degradeMsg(what: string, r: EvidenceResult): string {
  if (r.reason === 'no-data') return `${what}: no data exists for this project — no number to report`;
  if (r.reason === 'offline') return `${what}: unknown — skipped, running offline`;
  if (r.reason === 'timeout') return `${what}: unknown — the source timed out`;
  return `${what}: unknown — could not reach the source`;
}

export function propose(detected: DetectResult, posture: SecurityPosture): Claim[] {
  const claims: Claim[] = [];
  const { bundler, render, typescript } = detected;

  const isNative = bundler === 'metro';

  // --- React Native / Expo: route, but name the real alternative -------------
  if (isNative) {
    claims.push({
      tier: 'red',
      id: 'rn-metro',
      msg: 'React Native / Expo: Metro is the only officially supported bundler — this is not a web bundler swap',
      fix: 'Re.Pack (webpack/Rspack for RN) is the one real alternative, but adopting it leaves the officially supported Expo configuration',
      provenance: { source: 'benchmark-repo', citation: 'github.com/callstack/repack' },
    });
  } else if (render.mode === 'ssr' || render.mode === 'ssg') {
    // --- rendering mode: the same gate plan() applies ------------------------
    claims.push({
      tier: 'red',
      id: 'render-route',
      msg: `${render.reason} — rendering strategy is architectural, not a bundler choice`,
      fix: 'keep the framework (or move to Rspack/Turbopack for speed); do not convert to a CSR SPA',
      provenance: { source: 'rule', citation: 'rule:render-mode-route' },
    });
  }

  // --- bundler pick (CSR only; SSR already routed) ---------------------------
  if (render.mode === 'csr') {
    if (bundler !== 'vite') {
      claims.push({
        tier: 'green',
        id: 'pick-vite',
        msg: 'Vite is the safe default for a client-rendered SPA',
        provenance: { source: 'rule', citation: 'rule:csr-default-vite' },
      });
    }
    if (bundler === 'webpack' || bundler === 'craco') {
      claims.push({
        tier: 'yellow',
        id: 'pick-rspack',
        msg: 'Rspack keeps webpack semantics (custom loaders, Module Federation) with Rust speed',
        fix: 'prefer it over Vite when you depend on webpack-specific plugins',
        provenance: { source: 'rule', citation: 'rule:keep-webpack-semantics-rspack' },
      });
    }
  }

  // --- UI library: criteria + a live citation. No ranking, no invented score --
  // Only for the web: js-framework-benchmark measures DOM throughput, which
  // says nothing about a React Native project.
  if (!isNative) {
    claims.push({
      tier: 'green',
      id: 'ui-lib',
      msg: 'UI library: no single "best" — decide on render throughput, bundle size, and team familiarity',
      fix: 'compare on js-framework-benchmark (pin the commit; it forbids virtualization, so it measures raw DOM throughput, not real apps)',
      provenance: { source: 'benchmark-repo', citation: 'github.com/krausest/js-framework-benchmark' },
    });
  }

  // --- security posture: verbatim numbers, or an honest "no number" ----------
  if (bundler && !posture.scorecard) {
    claims.push({
      tier: 'green',
      id: 'scorecard-unmapped',
      msg: `OpenSSF Scorecard: not checked — no repository is mapped for "${bundler}"`,
      provenance: { source: 'rule', citation: 'rule:no-scorecard-data' },
    });
  }

  if (posture.scorecard) {
    const sc = posture.scorecard;
    if (sc.ok && typeof sc.score === 'number') {
      claims.push({
        tier: sc.score < 5 ? 'yellow' : 'green',
        id: 'scorecard',
        msg: `OpenSSF Scorecard for the current bundler: ${sc.score}/10`,
        score: sc.score,
        provenance: {
          source: 'openssf-scorecard',
          citation: sc.url,
          url: sc.url,
          ...(sc.reportedAt ? { reportedAt: sc.reportedAt } : {}),
          ...(sc.version ? { version: sc.version } : {}),
          ...(sc.fetchedAt ? { fetchedAt: sc.fetchedAt } : {}),
        },
      });
    } else {
      claims.push({
        tier: 'green',
        id: 'scorecard-none',
        msg: degradeMsg('OpenSSF Scorecard', sc),
        provenance: {
          source: 'rule',
          citation: sc.reason === 'no-data' ? 'rule:no-scorecard-data' : 'rule:evidence-degraded',
        },
      });
    }
  }

  // A bundler with no OSV package mapping must SAY so. Silently running no
  // security check is the failure mode this whole tool exists to prevent.
  if (bundler && !posture.osv) {
    claims.push({
      tier: 'green',
      id: 'osv-unmapped',
      msg: `OSV advisories: not checked — no npm package is mapped for "${bundler}"`,
      provenance: { source: 'rule', citation: 'rule:no-number-exists' },
    });
  }

  if (posture.osv) {
    const ad = posture.osv;
    if (ad.ok && ad.advisories) {
      const pinned = posture.pinnedVersion;
      const ids = ad.advisories.map((a) => a.id);
      if (ids.length > 0) {
        // Say exactly what was asked. Unpinned means "every advisory ever filed
        // against this package", most of which are long fixed — never present
        // that as if it described the installed version.
        const scope = pinned
          ? `affecting the declared version ${pinned}`
          : 'ever filed against this package (no version resolved, so this is NOT scoped to what you have installed)';
        const shown = ids.slice(0, 6).join(', ');
        const more = ids.length > 6 ? `, +${ids.length - 6} more` : '';
        claims.push({
          tier: 'red',
          id: 'osv',
          msg: `${ids.length} OSV advisory(ies) ${scope}: ${shown}${more}`,
          fix: pinned
            ? 'confirm your lockfile version, then upgrade past the affected range'
            : 'pin the bundler version, then re-run to scope this to your install',
          advisoryIds: ids,
          provenance: { source: 'osv', citation: ad.url, url: ad.url, ...(ad.fetchedAt ? { fetchedAt: ad.fetchedAt } : {}) },
        });
      } else {
        claims.push({
          tier: 'green',
          id: 'osv-clean',
          msg: pinned
            ? `OSV: no known advisories affecting the declared version ${pinned}`
            : 'OSV: no known advisories for this bundler package',
          provenance: { source: 'osv', citation: ad.url, url: ad.url },
        });
      }
    } else {
      claims.push({
        tier: 'green',
        id: 'osv-degraded',
        msg: degradeMsg('OSV advisories', ad),
        provenance: { source: 'rule', citation: 'rule:evidence-degraded' },
      });
    }
  }

  // --- TypeScript posture ----------------------------------------------------
  if (typescript.isTypeScript) {
    claims.push({
      tier: 'green',
      id: 'ts-typecheck',
      msg: 'every bundler here transpiles TypeScript but does NOT type-check it',
      fix: 'keep a separate `tsc --noEmit` step in CI',
      provenance: { source: 'rule', citation: 'rule:no-number-exists' },
    });
  }

  return claims;
}

// ---------------------------------------------------------------------------
// VERIFIER — independent. Re-resolves provenance against real adapter output.
// ---------------------------------------------------------------------------

function reject(c: Claim, why: string): Claim {
  return {
    ...c,
    tier: 'red',
    verified: false,
    verifierNote: why,
    msg: c.msg.startsWith('UNVERIFIED') ? c.msg : `UNVERIFIED — do not act on this: ${c.msg}`,
  };
}

export function verify(c: Claim, posture: SecurityPosture): Claim {
  const p = c.provenance;
  if (!p || !p.citation) return reject(c, 'no citation');

  switch (p.source) {
    case 'rule': {
      if (!RULE_IDS.has(p.citation)) return reject(c, `unknown rule id "${p.citation}"`);
      if (typeof c.score === 'number') return reject(c, 'a rule may not carry a numeric score');
      return { ...c, verified: true };
    }

    case 'openssf-scorecard': {
      const sc = posture.scorecard;
      // The anti-hallucination check: the number must byte-match the adapter.
      if (!sc || !sc.ok || typeof sc.score !== 'number') {
        return reject(c, 'cites Scorecard, but the adapter returned no score');
      }
      if (c.score !== sc.score) {
        return reject(c, `score ${String(c.score)} does not match the source (${sc.score})`);
      }
      if (p.url !== sc.url) return reject(c, 'cited url does not match the source');
      return { ...c, verified: true };
    }

    case 'osv': {
      const ad = posture.osv;
      if (!ad || !ad.ok || !ad.advisories) return reject(c, 'cites OSV, but the adapter returned nothing');
      const known = new Set(ad.advisories.map((a) => a.id));
      for (const id of c.advisoryIds ?? []) {
        if (!known.has(id)) return reject(c, `advisory ${id} does not exist in the source`);
      }
      if (typeof c.score === 'number') return reject(c, 'OSV yields advisories, not a score');
      return { ...c, verified: true };
    }

    case 'benchmark-repo': {
      if (!BENCHMARK_ALLOWLIST.has(p.citation)) return reject(c, `benchmark "${p.citation}" is not a verified source`);
      if (ARCHIVED_SOURCES.has(p.citation) && !/archiv/i.test(c.msg)) {
        return reject(c, 'archived source cited without an "archived" marker');
      }
      if (typeof c.score === 'number') return reject(c, 'benchmark numbers require a pinned commit, not a bare score');
      return { ...c, verified: true };
    }

    default:
      return reject(c, 'unknown provenance source');
  }
}

/**
 * Repair pass. Only ever REMOVES an unsupportable assertion; it never invents a
 * replacement. If a claim cannot be repaired it stays rejected and downgraded.
 */
function repair(rejected: Claim[], posture: SecurityPosture): Claim[] | null {
  const out: Claim[] = [];
  let changed = false;

  for (const c of rejected) {
    const sc = posture.scorecard;
    if (c.provenance.source === 'openssf-scorecard' && (!sc || !sc.ok)) {
      // Drop the unsupportable number; keep the honest "no data" statement.
      out.push({
        tier: 'green',
        id: 'scorecard-none',
        msg: degradeMsg('OpenSSF Scorecard', sc ?? { ok: false, url: '', reason: 'no-data' }),
        provenance: { source: 'rule', citation: sc?.reason === 'no-data' ? 'rule:no-scorecard-data' : 'rule:evidence-degraded' },
      });
      changed = true;
    } else {
      // Not repairable. Carry it forward still rejected — never silently dropped.
      out.push(c);
    }
  }

  return changed ? out : null;
}

// ---------------------------------------------------------------------------
// LOOP
// ---------------------------------------------------------------------------

export async function runAdvise(
  detected: DetectResult,
  env: EvidenceEnv,
  opts: AdviseOptions,
): Promise<AdvisePlan> {
  const posture = await gatherEvidence(detected, env, opts);
  let claims = propose(detected, posture);
  let graded: Claim[] = [];

  for (let i = 0; i < MAX_ITER; i++) {
    graded = claims.map((c) => verify(c, posture));
    const rejected = graded.filter((c) => !c.verified);
    if (rejected.length === 0) break;

    const repaired = repair(rejected, posture);
    if (!repaired) break; // cannot repair: keep them downgraded (deny, never guess)
    claims = [...graded.filter((c) => c.verified), ...repaired];
  }

  const degraded = [posture.scorecard, posture.osv].some((r) => r !== null && !r.ok);
  // A red claim gates whether it is a real verified blocker (SSR route, a live
  // advisory) or a claim the verifier rejected. Both mean "do not say done".
  const redGate = graded.some((c) => c.tier === 'red');

  return { route: false, kind: 'advise', claims: graded, posture, redGate, degraded };
}
