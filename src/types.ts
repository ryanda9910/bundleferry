// Shared types for the bundleferry engine.

/** Every bundler bundleferry can detect as a SOURCE. */
export type SourceBundler =
  | 'webpack'
  | 'cra'
  | 'craco'
  | 'rollup'
  | 'parcel'
  | 'esbuild'
  | 'browserify'
  | 'snowpack'
  | 'gulp'
  | 'vite'
  | 'rspack'
  | 'turbopack'
  | 'bun'
  | 'metro'
  | 'next';

/** Every bundler bundleferry can migrate TOWARD as a TARGET. */
export type TargetBundler = 'vite' | 'rspack' | 'esbuild' | 'tsup' | 'rolldown' | 'parcel' | 'bun';

export type RenderMode = 'csr' | 'ssr' | 'ssg';

export type Tier = 'green' | 'yellow' | 'red';

export interface Step {
  tier: Tier;
  id: string;
  msg: string;
  fix?: string;
}

export interface DetectResult {
  bundler: SourceBundler | null;
  ranked: Array<{ name: SourceBundler; score: number; hasConfig: boolean; hasDep: boolean; inScript: boolean }>;
  render: { mode: RenderMode; reason: string };
  typescript: TsInfo;
  pkg: PackageJson;
}

export interface TsInfo {
  isTypeScript: boolean;
  hasTsConfig: boolean;
  tsxCount: number;
  hasPathAliases: boolean;
  note: string;
}

export interface RoutePlan {
  route: true;
  verdict: string;
  options: string[];
}

export interface MigratePlan {
  route: false;
  from: string;
  to: TargetBundler;
  steps: Step[];
  alreadyThere?: boolean;
  note?: string;
}

export type Plan = RoutePlan | MigratePlan;

// ---------------------------------------------------------------------------
// advise mode — every claim carries provenance, and an independent verifier
// re-resolves that provenance against real adapter output. A claim asserting a
// number the adapter never returned is rejected. That is what makes "never
// invent a score" enforceable rather than aspirational.
// ---------------------------------------------------------------------------

export type EvidenceSource = 'openssf-scorecard' | 'osv' | 'benchmark-repo' | 'rule';

export interface Provenance {
  source: EvidenceSource;
  /** URL, repo slug, or the deterministic rule id. Never empty. */
  citation: string;
  /** The live URL actually queried. Absent for pure rules. */
  url?: string;
  /** The date the source itself reported (e.g. Scorecard's `date`). */
  reportedAt?: string;
  /** Scorecard's own version string. Reported verbatim, never rescaled. */
  version?: string;
  /** When we fetched or served it from cache. */
  fetchedAt?: string;
}

/** Structurally a superset of Step, so the CLI's tier renderer accepts it. */
export interface Claim {
  tier: Tier;
  id: string;
  msg: string;
  fix?: string;
  /** A numeric value copied verbatim from a source. Must match the adapter. */
  score?: number;
  /** Advisory ids asserted by this claim. Must exist in the adapter output. */
  advisoryIds?: string[];
  provenance: Provenance;
  /** Set by the verifier. Uncited or unresolved => false. */
  verified?: boolean;
  /** Why the verifier rejected or downgraded this claim. */
  verifierNote?: string;
}

export type DegradeReason = 'offline' | 'unreachable' | 'no-data' | 'timeout';

/** `ok:false` means degraded. Adapters never throw; degradation is a value. */
export interface EvidenceResult {
  ok: boolean;
  url: string;
  /** Verbatim score when the source has one. Never synthesized. */
  score?: number;
  reportedAt?: string;
  version?: string;
  reason?: DegradeReason;
  advisories?: Array<{ id: string; summary: string }>;
  fetchedAt?: string;
}

export interface SecurityPosture {
  /** null when the bundler has no known repo slug. */
  scorecard: EvidenceResult | null;
  osv: EvidenceResult | null;
  /** The concrete version OSV was queried with, when one could be resolved. */
  pinnedVersion?: string;
}

export interface AdviseOptions {
  offline: boolean;
  noCache: boolean;
  refresh: boolean;
}

export interface AdvisePlan {
  route: false;
  kind: 'advise';
  /** Verified and rejected claims both appear. Rejected ones are downgraded, never dropped. */
  claims: Claim[];
  posture: SecurityPosture;
  /** A verified red claim survived, or the verifier downgraded something. */
  redGate: boolean;
  /** Network was needed but unavailable; results are honestly incomplete. */
  degraded: boolean;
}

export interface PackageJson {
  name?: string;
  type?: string;
  dependencies?: Record<string, string>;
  devDependencies?: Record<string, string>;
  scripts?: Record<string, string>;
  source?: unknown;
  targets?: unknown;
  [k: string]: unknown;
}
