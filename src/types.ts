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
