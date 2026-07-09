// Public API barrel for bundleferry.
export { detect } from './detect.js';
export { plan, TARGETS, targetLabel } from './plan.js';
export { measure, compare, findOutDir, fmt } from './size.js';
export { runAdvise, propose, verify, gatherEvidence, BUNDLER_REPO, RULE_IDS, BENCHMARK_ALLOWLIST } from './advise.js';
export { scorecard, osv, defaultEnv } from './evidence.js';
export type { EvidenceEnv } from './evidence.js';
export type {
  SourceBundler, TargetBundler, RenderMode, Tier, Step,
  DetectResult, Plan, RoutePlan, MigratePlan, TsInfo, PackageJson,
  EvidenceSource, Provenance, Claim, DegradeReason, EvidenceResult,
  SecurityPosture, AdviseOptions, AdvisePlan,
} from './types.js';
