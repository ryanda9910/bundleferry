// Public API barrel for bundleferry.
export { detect } from './detect.js';
export { plan, TARGETS, targetLabel } from './plan.js';
export { measure, compare, findOutDir, fmt } from './size.js';
export type {
  SourceBundler, TargetBundler, RenderMode, Tier, Step,
  DetectResult, Plan, RoutePlan, MigratePlan, TsInfo, PackageJson,
} from './types.js';
