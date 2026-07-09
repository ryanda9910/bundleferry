// detect.ts — figure out which bundler a project uses, its rendering mode, and its
// TypeScript posture. Deterministic, dependency-free. Reads package.json (deps + scripts)
// and globs config files. Precedence matters: scripts are the strongest signal.

import * as fs from 'node:fs';
import * as path from 'node:path';
import type { DetectResult, PackageJson, RenderMode, SourceBundler, TsInfo } from './types.js';

function readJSON(p: string): PackageJson | null {
  try { return JSON.parse(fs.readFileSync(p, 'utf8')) as PackageJson; } catch { return null; }
}
function exists(dir: string, ...names: string[]): boolean {
  return names.some((n) => fs.existsSync(path.join(dir, n)));
}

interface BundlerRule {
  name: SourceBundler;
  configs: string[];
  deps: string[];
  script: RegExp;
  pkgField?: (pkg: PackageJson) => boolean;
  weak?: boolean;
}

// Ordered — first strong match is the primary bundler. All-ecosystem coverage.
// Precedence: framework-coupled + RN-specific first (metro/turbopack), then the rest.
const BUNDLERS: BundlerRule[] = [
  { name: 'metro', configs: ['metro.config.js', 'metro.config.cjs'], deps: ['metro', 'react-native', '@react-native/metro-config', 'expo'], script: /\b(metro|react-native|expo)\b/ },
  { name: 'craco', configs: ['craco.config.js', 'craco.config.cjs'], deps: ['@craco/craco'], script: /\bcraco\b/ },
  { name: 'cra', configs: [], deps: ['react-scripts'], script: /\breact-scripts\b/ },
  // Turbopack is Next's bundler when dev/build run with --turbo(pack). It ships INSIDE Next
  // and has no standalone dep — the npm package `turbo` is Turborepo, a task runner, so it
  // must never be a signal here (a plain Turborepo monorepo is not a Turbopack project).
  { name: 'turbopack', configs: [], deps: [], script: /\bnext\s+(dev|build)\b[^&|]*--turbo(pack)?\b/ },
  { name: 'next', configs: ['next.config.js', 'next.config.mjs', 'next.config.ts'], deps: ['next'], script: /\bnext\b/ },
  { name: 'rspack', configs: ['rspack.config.js', 'rspack.config.ts', 'rspack.config.mjs'], deps: ['@rspack/core', '@rspack/cli'], script: /\brspack\b/ },
  { name: 'vite', configs: ['vite.config.js', 'vite.config.ts', 'vite.config.mjs'], deps: ['vite'], script: /\bvite\b/ },
  { name: 'snowpack', configs: ['snowpack.config.js', 'snowpack.config.mjs'], deps: ['snowpack'], script: /\bsnowpack\b/ },
  { name: 'parcel', configs: ['.parcelrc'], deps: ['parcel', 'parcel-bundler'], script: /\bparcel\b/, pkgField: (p) => !!(p.source || p.targets) },
  { name: 'webpack', configs: ['webpack.config.js', 'webpack.config.cjs', 'webpack.config.ts'], deps: ['webpack', 'webpack-cli'], script: /\bwebpack\b/ },
  // Bun's own bundler: `bun build` in a script, or a build script that runs `bun`.
  { name: 'bun', configs: ['bunfig.toml'], deps: [], script: /\bbun\s+build\b|\bbun\b/, weak: true },
  { name: 'gulp', configs: ['gulpfile.js', 'gulpfile.mjs', 'gulpfile.babel.js'], deps: ['gulp'], script: /\bgulp\b/, weak: true },
  { name: 'rollup', configs: ['rollup.config.js', 'rollup.config.mjs', 'rollup.config.ts'], deps: ['rollup'], script: /\brollup\b/, weak: true },
  { name: 'browserify', configs: [], deps: ['browserify'], script: /\bbrowserify\b/, weak: true },
  { name: 'esbuild', configs: ['esbuild.config.js', 'esbuild.config.mjs', 'esbuild.config.ts'], deps: ['esbuild'], script: /\besbuild\b/, weak: true },
];

// esbuild is commonly invoked from a plain `node build.js` script that imports it,
// so its literal name never appears in package.json. If the esbuild dep is present and
// the build script runs a local JS file that imports esbuild, treat it as an esbuild build.
function esbuildViaBuildScript(dir: string, pkg: PackageJson): boolean {
  const deps = { ...(pkg.dependencies ?? {}), ...(pkg.devDependencies ?? {}) };
  if (!('esbuild' in deps)) return false;
  const build = pkg.scripts?.build ?? '';
  const m = build.match(/node\s+([\w./-]+\.(?:m?js|c?js))/);
  if (!m || !m[1]) return false;
  try {
    const src = fs.readFileSync(path.join(dir, m[1]), 'utf8');
    return /require\(['"]esbuild['"]\)|from\s+['"]esbuild['"]|import\s+.*esbuild/.test(src);
  } catch { return false; }
}

function detectBundler(dir: string): { primary: SourceBundler | null; ranked: DetectResult['ranked']; pkg: PackageJson } {
  const pkg = readJSON(path.join(dir, 'package.json')) ?? {};
  const allDeps = { ...(pkg.dependencies ?? {}), ...(pkg.devDependencies ?? {}) };
  const scripts = Object.values(pkg.scripts ?? {}).join(' ');
  const buildScript = pkg.scripts?.build ?? '';

  const matches: DetectResult['ranked'] = [];
  for (const b of BUNDLERS) {
    const hasConfig = exists(dir, ...b.configs);
    const hasDep = b.deps.some((d) => d in allDeps);
    const inScript = b.script.test(scripts);
    const inBuild = b.script.test(buildScript);
    const pkgField = b.pkgField ? b.pkgField(pkg) : false;
    const indirect = b.name === 'esbuild' && esbuildViaBuildScript(dir, pkg);
    const signal = b.weak ? (hasConfig || inScript || indirect) : (hasConfig || hasDep || inScript || pkgField);
    if (signal) {
      let score = 0;
      if (inBuild) score += 4;
      if (hasConfig) score += 3;
      if (inScript) score += 2;
      if (indirect) score += 2;
      if (hasDep) score += 1;
      if (pkgField) score += 1;
      matches.push({ name: b.name, score, hasConfig, hasDep, inScript });
    }
  }
  matches.sort((a, b) => b.score - a.score);
  return { primary: matches[0]?.name ?? null, ranked: matches, pkg };
}

function detectRenderMode(dir: string, bundler: SourceBundler | null, pkg: PackageJson): { mode: RenderMode; reason: string } {
  const allDeps = { ...(pkg.dependencies ?? {}), ...(pkg.devDependencies ?? {}) };
  // React Native / Expo (Metro) is NOT a web bundler migration — flag as SSR-tier so the
  // route gate stops it (there is no "migrate Metro to Vite"; RN bundling is platform-native).
  if (bundler === 'metro' || 'react-native' in allDeps || 'expo' in allDeps) return { mode: 'ssr', reason: 'React Native / Expo (Metro — native bundler, not a web migration)' };
  if (bundler === 'turbopack' || 'next' in allDeps || bundler === 'next') return { mode: 'ssr', reason: 'Next.js / Turbopack (SSR/SSG framework)' };
  if ('nuxt' in allDeps || 'nuxt3' in allDeps) return { mode: 'ssr', reason: 'Nuxt (SSR/SSG framework)' };
  if ('astro' in allDeps) return { mode: 'ssg', reason: 'Astro (SSG/hybrid framework)' };
  if ('@remix-run/react' in allDeps || 'remix' in allDeps) return { mode: 'ssr', reason: 'Remix (SSR framework)' };
  if ('gatsby' in allDeps) return { mode: 'ssg', reason: 'Gatsby (SSG framework)' };
  if ('@sveltejs/kit' in allDeps) return { mode: 'ssr', reason: 'SvelteKit (SSR/SSG framework)' };
  const ssrHints = ['server.js', 'server.ts', 'entry-server.jsx', 'entry-server.tsx', 'src/entry-server.tsx', 'src/entry-server.ts'];
  if (ssrHints.some((f) => fs.existsSync(path.join(dir, f)))) return { mode: 'ssr', reason: 'custom SSR entry file present' };
  return { mode: 'csr', reason: 'client-rendered SPA (no SSR framework/entry detected)' };
}

function countByExt(dir: string, exts: string[], cap = 5000): number {
  let n = 0;
  const walk = (d: string, depth: number): void => {
    if (depth > 8 || n >= cap) return;
    let entries: fs.Dirent[];
    try { entries = fs.readdirSync(d, { withFileTypes: true }); } catch { return; }
    for (const e of entries) {
      if (e.name === 'node_modules' || e.name.startsWith('.git')) continue;
      const full = path.join(d, e.name);
      if (e.isDirectory()) walk(full, depth + 1);
      else if (exts.some((x) => e.name.endsWith(x))) n++;
    }
  };
  walk(dir, 0);
  return n;
}

function detectTypeScript(dir: string, pkg: PackageJson): TsInfo {
  const allDeps = { ...(pkg.dependencies ?? {}), ...(pkg.devDependencies ?? {}) };
  const hasTsConfig = exists(dir, 'tsconfig.json');
  const hasTsDep = 'typescript' in allDeps;
  const src = fs.existsSync(path.join(dir, 'src')) ? path.join(dir, 'src') : dir;
  const tsxCount = countByExt(src, ['.ts', '.tsx', '.mts', '.cts']);
  let hasPathAliases = false;
  if (hasTsConfig) {
    try {
      const tsc = JSON.parse(fs.readFileSync(path.join(dir, 'tsconfig.json'), 'utf8')) as { compilerOptions?: { paths?: unknown } };
      hasPathAliases = !!tsc.compilerOptions?.paths;
    } catch { /* tsconfig may have comments; treat as no aliases */ }
  }
  const isTypeScript = hasTsConfig || hasTsDep || tsxCount > 0;
  const note = isTypeScript
    ? `TypeScript project (${tsxCount} .ts/.tsx file(s)${hasTsConfig ? ', tsconfig.json' : ''}${hasPathAliases ? ', path aliases' : ''})`
    : 'plain JavaScript (no TypeScript detected)';
  return { isTypeScript, hasTsConfig, tsxCount, hasPathAliases, note };
}

export function detect(dir: string): DetectResult {
  const { primary, ranked, pkg } = detectBundler(dir);
  const render = detectRenderMode(dir, primary, pkg);
  const typescript = detectTypeScript(dir, pkg);
  return { bundler: primary, ranked, render, typescript, pkg };
}
