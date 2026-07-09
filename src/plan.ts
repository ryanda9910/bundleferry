// plan.ts — build a tiered migration plan from a detected SOURCE bundler to a chosen
// TARGET bundler (Vite, Rspack, esbuild, tsup, Rolldown, Parcel). SSR/SSG is routed away.
//   green = mechanical/auto-safe · yellow = transform + confirm · red = human punch-list.
// Rules distilled from real webpack/CRA/Rollup/Parcel migrations (see CASES.md), plus the
// per-target caveats each destination bundler adds.

import * as fs from 'node:fs';
import * as path from 'node:path';
import type { DetectResult, MigratePlan, Plan, SourceBundler, Step, TargetBundler, TsInfo } from './types.js';

const TARGET_LABELS: Record<TargetBundler, string> = {
  vite: 'Vite', rspack: 'Rspack', esbuild: 'esbuild', tsup: 'tsup', rolldown: 'Rolldown', parcel: 'Parcel',
};

export const TARGETS: TargetBundler[] = ['vite', 'rspack', 'esbuild', 'tsup', 'rolldown', 'parcel'];

function has(dir: string, rel: string): boolean { return fs.existsSync(path.join(dir, rel)); }

function grepDir(dir: string, re: RegExp, exts: string[]): number {
  let count = 0;
  const walk = (d: string, depth: number): void => {
    if (depth > 6) return;
    let entries: fs.Dirent[];
    try { entries = fs.readdirSync(d, { withFileTypes: true }); } catch { return; }
    for (const e of entries) {
      if (e.name === 'node_modules' || e.name.startsWith('.git')) continue;
      const full = path.join(d, e.name);
      if (e.isDirectory()) walk(full, depth + 1);
      else if (exts.some((x) => e.name.endsWith(x))) {
        try { if (re.test(fs.readFileSync(full, 'utf8'))) count++; } catch { /* skip */ }
      }
    }
  };
  walk(dir, 0);
  return count;
}

// ---- what each SOURCE bundler contributes to unwind, target-agnostic ----
const SOURCE_UNWIND: Record<string, { label: string; green: string[]; yellow: string[]; red: string[] }> = {
  webpack: {
    label: 'webpack',
    green: ['output.path/publicPath → the target\'s outDir/base', 'resolve.alias + devServer.{port,proxy} → the target\'s equivalents', 'babel-loader → the target\'s native TS/JSX transform (drop babel toolchain)'],
    yellow: ['optimization.splitChunks → target chunking model (verify output)', 'DefinePlugin → target define/env', 'css/style/mini-css loaders → native CSS; @svgr/webpack → an svgr plugin'],
    red: ['custom loaders with no target equivalent', 'require.context / dynamic require(variable)', 'Module Federation / target:node / worker chains'],
  },
  cra: {
    label: 'Create React App',
    green: ['react-scripts → the target + its React plugin; rewrite start/build scripts', 'public/index.html → an HTML entry; %PUBLIC_URL%/ → /'],
    yellow: ['JSX-in-.js → rename .jsx', 'REACT_APP_* → the target\'s env convention', 'CRA SVG ReactComponent → an svgr plugin'],
    red: ['jest → the target\'s test runner', 'ejected or react-app-rewired custom webpack'],
  },
  rollup: {
    label: 'Rollup',
    green: ['input/output/external map directly (many targets wrap Rollup)', 'drop @rollup/plugin-node-resolve + commonjs where the target builds them in'],
    yellow: ['babel presets → the target\'s React/TS transform', 'dev-server plugins → the target\'s built-in dev server'],
    red: ['bespoke Rollup output plugins with no app-target equivalent', 'multi-output library builds (a lib target like tsup/Rolldown may fit better)'],
  },
  parcel: {
    label: 'Parcel',
    green: ['.parcelrc transformers → the target\'s native transforms', 'HTML-first entry already matches HTML-first targets; targets.distDir/publicUrl → outDir/base'],
    yellow: ['Tailwind/PostCSS: re-add deps + config → .cjs under type:module', 'process.env → the target\'s env convention'],
    red: ['custom .parcelrc optimizers/reporters/namers', 'Parcel macros / automatic install'],
  },
  esbuild: {
    label: 'esbuild',
    green: ['define/alias/target/external map almost 1:1 (many targets embed esbuild)', 'loader map → native/plugin handling'],
    yellow: ['a hand-written build script → the target\'s config file', 'splitting → the target\'s code-split model'],
    red: ['custom esbuild plugins with no target equivalent'],
  },
  craco: {
    label: 'CRACO',
    green: ['craco webpack.alias → the target\'s resolve.alias', 'craco style (CSS Modules / PostCSS / Sass) → the target\'s native CSS', 'craco devServer → the target\'s server config'],
    yellow: ['craco.configure custom webpack → target plugins (case by case)', 'craco babel overrides → the target\'s React/TS transform', 'CRA underneath still applies (index.html move, JSX-in-.js, REACT_APP_ env)'],
    red: ['craco plugins that wrap webpack internals with no equivalent', 'react-app-rewired hacks'],
  },
  snowpack: {
    label: 'Snowpack',
    green: ['mount → the target\'s root/publicDir', 'alias → resolve.alias', 'buildOptions.out → the target\'s outDir', 'Snowpack is ESM-first, so the module graph already suits Vite/Rollup targets'],
    yellow: ['snowpack plugins (@snowpack/plugin-react-refresh, etc.) → target plugins', 'SNOWPACK_PUBLIC_ env vars → the target\'s env convention', 'import.meta.env already used by Snowpack → maps cleanly to Vite'],
    red: ['Snowpack is unmaintained (archived 2022) — some plugins have no successor and must be reimplemented'],
  },
  gulp: {
    label: 'Gulp',
    green: ['src/dest globs → the target\'s entry/outDir (only the bundling task, not the whole pipeline)'],
    yellow: ['gulp-babel/gulp-sass/gulp-uglify steps → the target\'s built-in transform + minify', 'gulp-concat → the bundler\'s own bundling (drop manual concat)'],
    red: ['Gulp is a TASK RUNNER, not a bundler — image/sprite/copy/lint/deploy tasks do NOT map to a bundler and must stay in a task runner or move to npm scripts. Only the JS/CSS bundling step migrates; treat the rest as a separate decision.'],
  },
  browserify: {
    label: 'Browserify',
    green: ['entry (b.add / main) → the target\'s entry', 'output bundle → the target\'s outDir'],
    yellow: ['babelify / other transforms → the target\'s native transform', 'CommonJS source is fine for Rollup/Vite targets but confirm no dynamic require()', 'node core shims (browserify auto-polyfilled) → add a node-polyfills plugin if the code needs them'],
    red: ['Browserify-specific transforms with no modern equivalent', 'heavy reliance on node core in the browser (browserify hid this) — surfaces as externalized-module errors'],
  },
};

// ---- what each TARGET bundler needs on arrival (target-specific caveats) ----
const TARGET_ARRIVE: Record<TargetBundler, { green: string[]; yellow: string[]; red: string[] }> = {
  vite: {
    green: ['add vite + the framework plugin; scripts → vite/vite build/vite preview', 'move entry to root index.html with <script type=module>'],
    yellow: ['env vars need the VITE_ prefix (non-VITE_ vars become undefined) — see the detected env step below if any'],
    red: ['SSR/SSG needs the Vite SSR API or a meta-framework (not a config key)'],
  },
  rspack: {
    green: ['rspack.config.js is webpack-shaped — most webpack config + loaders map directly', 'best target when you keep webpack semantics (Module Federation, custom loaders)'],
    yellow: ['a few webpack plugins need their Rspack-compatible version', 'DefinePlugin/env carry over with minor changes'],
    red: ['plugins that reach into webpack internals with no Rspack port'],
  },
  esbuild: {
    green: ['tiny build script or esbuild.config; define/alias/target/loader are first-class', 'fastest builds, great for simple apps/libs'],
    yellow: ['no built-in dev server with HMR like Vite (esbuild serve is basic)', 'CSS-Modules / advanced CSS needs plugins'],
    red: ['esbuild does not do everything Rollup/Vite plugins do — rich plugin ecosystems do not transfer'],
  },
  tsup: {
    green: ['tsup.config.ts; great for LIBRARIES — dual ESM/CJS + .d.ts out of the box', 'wraps esbuild; entry/format/dts are one-liners'],
    yellow: ['tsup is library-oriented — an app (HTML entry, dev server) is the wrong fit'],
    red: ['not an app bundler — do not target tsup for a browser SPA'],
  },
  rolldown: {
    green: ['Rollup-compatible config; Rolldown is the Rust Rollup successor (drop-in-ish)', 'good when you already have a Rollup config'],
    yellow: ['Rolldown is young — some Rollup plugins are not yet supported', 'Vite is migrating to Rolldown internally; check plugin coverage'],
    red: ['pre-1.0 stability — verify your plugin set before committing'],
  },
  parcel: {
    green: ['zero-config: often just point Parcel at index.html', 'good when you want minimal config'],
    yellow: ['custom pipeline needs a .parcelrc', 'env is inlined without a prefix (differs from Vite)'],
    red: ['fewer escape hatches than Vite/webpack for exotic setups'],
  },
};

function sharedChecks(dir: string, target: TargetBundler): Step[] {
  const steps: Step[] = [];
  const src = has(dir, 'src') ? path.join(dir, 'src') : dir;

  const jsxInJs = grepDir(src, /<[A-Z][\w]*[\s/>]|<\/[A-Z]/, ['.js']);
  if (jsxInJs > 0 && (target === 'vite' || target === 'esbuild' || target === 'rolldown' || target === 'tsup')) {
    steps.push({ tier: 'yellow', id: 'jsx-in-js', msg: `${jsxInJs} .js file(s) contain JSX — esbuild-based targets parse JSX only from .jsx/.tsx`, fix: 'rename to .jsx, OR set an esbuild ".js"→"jsx" loader (confirm which)' });
  }
  const envUse = grepDir(src, /process\.env\.[A-Z]/, ['.js', '.jsx', '.ts', '.tsx']);
  if (envUse > 0 && target === 'vite') {
    steps.push({ tier: 'yellow', id: 'env-rewrite', msg: `${envUse} file(s) read process.env.* — non-VITE_ vars become undefined in Vite`, fix: 'rename .env keys to VITE_*, rewrite process.env.X → import.meta.env.VITE_X (confirm each)' });
  }
  for (const f of ['postcss.config.js', 'postcss.config.cjs', '.postcssrc', '.postcssrc.json']) {
    if (has(dir, f)) {
      const usesTailwind = grepDir(src, /@tailwind|@apply/, ['.css', '.scss']) > 0 || has(dir, 'tailwind.config.js') || has(dir, 'tailwind.config.cjs');
      steps.push({
        tier: usesTailwind ? 'yellow' : 'green', id: 'postcss-config',
        msg: `${f} present — most targets auto-load it${usesTailwind ? ' and Tailwind IS used' : ' but no CSS/@tailwind detected (likely orphaned)'}`,
        fix: usesTailwind ? 'keep it: re-add tailwindcss/postcss/autoprefixer as devDeps; rename config → .cjs under type:module' : 'remove the orphaned PostCSS config',
      });
    }
  }
  return steps;
}

function tsChecks(ts: TsInfo, target: TargetBundler): Step[] {
  if (!ts.isTypeScript) return [];
  const steps: Step[] = [];
  if (ts.hasPathAliases) {
    steps.push({
      tier: 'yellow', id: 'ts-paths',
      msg: 'tsconfig has path aliases — the target does not read tsconfig paths by itself',
      fix: target === 'vite' ? 'add vite-tsconfig-paths, or mirror paths in resolve.alias' : 'mirror the tsconfig paths in the target\'s alias config',
    });
  }
  if (target === 'vite') {
    steps.push({ tier: 'green', id: 'ts-env', msg: 'add src/vite-env.d.ts (/// <reference types="vite/client" />) so import.meta.env is typed' });
  }
  steps.push({ tier: 'green', id: 'ts-transpile', msg: `${ts.tsxCount} .ts/.tsx file(s) — the target transpiles TS but does NOT type-check` , fix: 'keep a separate "tsc --noEmit" step in CI/build; the bundler only strips types' });
  return steps;
}

export function plan(detected: DetectResult, dir: string, target: TargetBundler): Plan {
  const { bundler, render } = detected;

  if (render.mode === 'ssr' || render.mode === 'ssg') {
    return {
      route: true,
      verdict: `STOP: ${render.reason}. Migrating rendering strategy is architectural, not a bundler swap.`,
      options: [
        'Keep the framework semantics + Rust speed → Rspack or Turbopack',
        render.mode === 'ssg' ? 'Static site → Astro (Vite under the hood, SSG/hybrid)' : 'Full SSR → a Vite meta-framework, or stay on Next/Nuxt/Remix/SvelteKit',
        'Only if you truly want CSR: drop SSR and migrate the SPA (loses per-route SSR/SSG)',
      ],
    };
  }

  if (!bundler) return { route: false, from: 'unknown', to: target, steps: [], note: 'No known bundler detected.' } as MigratePlan;
  if (bundler === (target as unknown as SourceBundler)) return { route: false, from: TARGET_LABELS[target], to: target, steps: [], alreadyThere: true, note: `Already on ${TARGET_LABELS[target]}.` } as MigratePlan;

  const arrive = TARGET_ARRIVE[target];
  // Every detected source gets at least a generic unwind so the matrix has no dead cells.
  const unwind = SOURCE_UNWIND[bundler] ?? {
    label: bundler,
    green: ['map the entry/output/alias config to the target\'s equivalents'],
    yellow: ['translate this bundler\'s plugins/transforms to the target\'s'],
    red: [`${bundler}-specific features with no direct target equivalent — verify each by hand`],
  };

  const steps: Step[] = [];
  for (const g of arrive.green) steps.push({ tier: 'green', id: 'arrive', msg: g });
  for (const g of unwind.green) steps.push({ tier: 'green', id: 'unwind', msg: g });
  for (const y of arrive.yellow) steps.push({ tier: 'yellow', id: 'arrive', msg: y });
  for (const y of unwind.yellow) steps.push({ tier: 'yellow', id: 'unwind', msg: y });
  for (const r of arrive.red) steps.push({ tier: 'red', id: 'arrive', msg: r });
  for (const r of unwind.red) steps.push({ tier: 'red', id: 'unwind', msg: r });
  steps.push(...tsChecks(detected.typescript, target));
  steps.push(...sharedChecks(dir, target));

  return { route: false, from: unwind.label, to: target, steps };
}

export function targetLabel(t: TargetBundler): string { return TARGET_LABELS[t]; }
