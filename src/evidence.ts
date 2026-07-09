// evidence.ts — the ONLY file in bundleferry that touches the network.
//
// Two live, keyless sources:
//   OpenSSF Scorecard  GET  https://api.securityscorecards.dev/projects/github.com/<org>/<repo>
//   OSV               POST  https://api.osv.dev/v1/query
//
// Three rules this file exists to enforce:
//   1. It NEVER throws. Degradation is a value (`{ok:false, reason}`), so a
//      network outage can never be mistaken for a security finding.
//   2. It NEVER synthesizes a number. A score is copied verbatim or absent.
//   3. Everything impure arrives through `EvidenceEnv`, so `npm test` opens no
//      socket and touches no cache directory.

import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import type { AdviseOptions, DegradeReason, EvidenceResult } from './types.js';

const SCORECARD_BASE = 'https://api.securityscorecards.dev/projects/github.com';
const OSV_URL = 'https://api.osv.dev/v1/query';
const TTL_MS = 24 * 60 * 60 * 1000; // Scorecard refreshes daily; OSV moves slowly.

/** The injection seam. Tests pass a stub fetch and `cacheDir: null`. */
export interface EvidenceEnv {
  fetch: typeof fetch;
  now: () => number;
  cacheDir: string | null;
  timeoutMs: number;
}

export function defaultEnv(): EvidenceEnv {
  const base = process.env['XDG_CACHE_HOME'] ?? path.join(os.homedir(), '.cache');
  return { fetch: globalThis.fetch, now: () => Date.now(), cacheDir: path.join(base, 'bundleferry'), timeoutMs: 8000 };
}

// ---------------------------------------------------------------------------
// cache — best-effort. A read-only home or a corrupt entry must never crash us.
// ---------------------------------------------------------------------------

function cachePath(env: EvidenceEnv, key: string): string | null {
  if (!env.cacheDir) return null;
  return path.join(env.cacheDir, `${key.replace(/[^\w.-]/g, '_')}.json`);
}

function cacheRead(env: EvidenceEnv, key: string, opts: AdviseOptions): EvidenceResult | null {
  if (opts.noCache || opts.refresh) return null;
  const p = cachePath(env, key);
  if (!p) return null;
  try {
    const { fetchedAt, result } = JSON.parse(fs.readFileSync(p, 'utf8')) as { fetchedAt: number; result: EvidenceResult };
    if (typeof fetchedAt !== 'number' || env.now() - fetchedAt > TTL_MS) return null;
    return { ...result, fetchedAt: new Date(fetchedAt).toISOString() };
  } catch {
    return null; // missing or corrupt — treat as a miss
  }
}

function cacheWrite(env: EvidenceEnv, key: string, result: EvidenceResult, opts: AdviseOptions): void {
  if (opts.noCache) return;
  const p = cachePath(env, key);
  if (!p) return;
  try {
    fs.mkdirSync(path.dirname(p), { recursive: true });
    fs.writeFileSync(p, JSON.stringify({ fetchedAt: env.now(), result }));
  } catch {
    /* best-effort: a read-only home is not an error */
  }
}

// ---------------------------------------------------------------------------
// fetch wrapper — turns every failure mode into a DegradeReason, never a throw.
// ---------------------------------------------------------------------------

interface Fetched {
  status: number;
  body: unknown;
}

async function get(env: EvidenceEnv, url: string, init?: RequestInit): Promise<Fetched | DegradeReason> {
  const ctl = new AbortController();
  let timer: ReturnType<typeof setTimeout> | undefined;

  // The timeout is enforced HERE, by racing, rather than delegated to the
  // fetch implementation. A fetch that ignores `signal` must not be able to
  // hang the CLI forever.
  const timeout = new Promise<DegradeReason>((resolve) => {
    timer = setTimeout(() => {
      ctl.abort();
      resolve('timeout');
    }, env.timeoutMs);
  });

  const attempt = (async (): Promise<Fetched | DegradeReason> => {
    try {
      const res = await env.fetch(url, { ...init, signal: ctl.signal });
      if (res.status === 404) return { status: 404, body: null };
      if (!res.ok) return 'unreachable';
      return { status: res.status, body: await res.json() };
    } catch (e) {
      return (e as Error)?.name === 'AbortError' ? 'timeout' : 'unreachable';
    }
  })();

  try {
    return await Promise.race([attempt, timeout]);
  } finally {
    clearTimeout(timer);
  }
}

// ---------------------------------------------------------------------------
// adapters
// ---------------------------------------------------------------------------

/**
 * OpenSSF Scorecard for a `org/repo` slug.
 *
 * A 404 means the project has never been scanned — that is `no-data`, NOT a
 * zero. Real example: web-infra-dev/rspack, oven-sh/bun and rolldown/rolldown
 * all return 404 today, so 3 of 9 bundlers have no number at all.
 */
export async function scorecard(repo: string, env: EvidenceEnv, opts: AdviseOptions): Promise<EvidenceResult> {
  const url = `${SCORECARD_BASE}/${repo}`;
  const cached = cacheRead(env, `scorecard:${repo}`, opts);
  if (cached) return cached;
  if (opts.offline) return { ok: false, url, reason: 'offline' };

  const got = await get(env, url);
  if (typeof got === 'string') return { ok: false, url, reason: got };
  if (got.status === 404 || got.body === null) return { ok: false, url, reason: 'no-data' };

  const b = got.body as { score?: unknown; date?: unknown; scorecard?: { version?: unknown } };
  if (typeof b.score !== 'number') return { ok: false, url, reason: 'no-data' };

  const result: EvidenceResult = {
    ok: true,
    url,
    score: b.score, // verbatim. never rescaled, never composited.
    ...(typeof b.date === 'string' ? { reportedAt: b.date } : {}),
    ...(typeof b.scorecard?.version === 'string' ? { version: b.scorecard.version } : {}),
  };
  cacheWrite(env, `scorecard:${repo}`, result, opts);
  return result;
}

/**
 * OSV advisories for an npm package.
 *
 * An empty `vulns` array is a CLEAN result, not a degraded one — "we asked and
 * there are none" is a real answer and must not be reported as unknown.
 */
export async function osv(
  pkgName: string,
  env: EvidenceEnv,
  opts: AdviseOptions,
  version?: string,
): Promise<EvidenceResult> {
  const key = version ? `osv:${pkgName}@${version}` : `osv:${pkgName}`;
  const cached = cacheRead(env, key, opts);
  if (cached) return cached;
  if (opts.offline) return { ok: false, url: OSV_URL, reason: 'offline' };

  // Without a version OSV returns EVERY advisory ever filed against the package
  // (55 for `next`), including long-fixed ones — reporting that as "your
  // advisories" would badly over-claim. With a concrete version it returns only
  // the ones affecting it (25 for next@15.0.0). OSV rejects ranges, so a range
  // is narrowed to its floor and the caller is told that is what happened.
  const got = await get(env, OSV_URL, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ package: { name: pkgName, ecosystem: 'npm' }, ...(version ? { version } : {}) }),
  });
  if (typeof got === 'string') return { ok: false, url: OSV_URL, reason: got };
  if (got.body === null) return { ok: false, url: OSV_URL, reason: 'no-data' };

  const vulns = (got.body as { vulns?: Array<{ id?: unknown; summary?: unknown }> }).vulns ?? [];
  const result: EvidenceResult = {
    ok: true,
    url: OSV_URL,
    advisories: vulns
      .filter((v) => typeof v.id === 'string')
      .map((v) => ({ id: v.id as string, summary: typeof v.summary === 'string' ? v.summary : '' })),
  };
  cacheWrite(env, key, result, opts);
  return result;
}
