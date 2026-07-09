'use strict';
// plan.js — given a detected project, emit a migration plan to Vite (or a ROUTE-AWAY
// verdict for SSR/SSG). Each step is tagged by tier:
//   green  = mechanical, safe to auto-apply
//   yellow = transform but confirm (behavior may shift)
//   red    = do NOT auto-fix; surface in the punch-list for a human
// Rules distilled from real webpack/CRA/Rollup/Parcel -> Vite migrations (see CASES.md).

const fs = require('fs');
const path = require('path');

function has(dir, rel) { return fs.existsSync(path.join(dir, rel)); }
function grepDir(dir, re, exts) {
  // shallow recursive grep for a pattern; returns matching file count (bounded)
  let count = 0;
  const walk = (d, depth) => {
    if (depth > 6) return;
    let entries;
    try { entries = fs.readdirSync(d, { withFileTypes: true }); } catch { return; }
    for (const e of entries) {
      if (e.name === 'node_modules' || e.name.startsWith('.git')) continue;
      const full = path.join(d, e.name);
      if (e.isDirectory()) walk(full, depth + 1);
      else if (exts.some((x) => e.name.endsWith(x))) {
        try { if (re.test(fs.readFileSync(full, 'utf8'))) count++; } catch {}
      }
    }
  };
  walk(dir, 0);
  return count;
}

// Cross-bundler shared checks (run for every source bundler).
function sharedChecks(dir) {
  const steps = [];
  const src = has(dir, 'src') ? path.join(dir, 'src') : dir;

  // JSX inside .js files — Vite/esbuild only parses JSX from .jsx/.tsx.
  const jsxInJs = grepDir(src, /<[A-Z][\w]*[\s/>]|<\/[A-Z]/, ['.js']);
  if (jsxInJs > 0) {
    steps.push({
      tier: 'yellow', id: 'jsx-in-js',
      msg: `${jsxInJs} .js file(s) contain JSX — Vite parses JSX only from .jsx/.tsx`,
      fix: 'rename them to .jsx, OR set esbuild.loader ".js"->"jsx" in vite.config (confirm which)',
    });
  }

  // process.env usage — must become import.meta.env.VITE_* (silent undefined otherwise).
  const envUse = grepDir(src, /process\.env\.[A-Z]/, ['.js', '.jsx', '.ts', '.tsx']);
  if (envUse > 0) {
    steps.push({
      tier: 'yellow', id: 'env-rewrite',
      msg: `${envUse} file(s) read process.env.* — non-VITE_ vars become undefined in Vite`,
      fix: 'rename .env keys to VITE_*, rewrite process.env.X -> import.meta.env.VITE_X (confirm each)',
    });
  }

  // Leftover PostCSS config that may reference dropped deps (tailwind/autoprefixer).
  ['postcss.config.js', 'postcss.config.cjs', '.postcssrc', '.postcssrc.json'].forEach((f) => {
    if (has(dir, f)) {
      const usesTailwind = grepDir(src, /@tailwind|@apply/, ['.css', '.scss']) > 0 || has(dir, 'tailwind.config.js') || has(dir, 'tailwind.config.cjs');
      steps.push({
        tier: usesTailwind ? 'yellow' : 'green', id: 'postcss-config',
        msg: `${f} present — Vite auto-loads it${usesTailwind ? ' and Tailwind IS used' : ' but no CSS/@tailwind detected (likely orphaned)'}`,
        fix: usesTailwind
          ? 'keep PostCSS: re-add tailwindcss/postcss/autoprefixer as devDeps; rename tailwind.config.js -> .cjs under type:module'
          : 'remove the orphaned PostCSS config (nothing imports CSS through it)',
      });
    }
  });

  return steps;
}

const SOURCES = {
  webpack: {
    label: 'webpack',
    green: [
      'output.path -> build.outDir; output.publicPath -> base',
      'resolve.alias -> resolve.alias; devServer.{port,proxy,https} -> server.*',
      'babel-loader (ts/tsx) -> @vitejs/plugin-react; drop babel toolchain',
      'move entry HTML (HtmlWebpackPlugin template) to root index.html with <script type=module>',
    ],
    yellow: [
      'optimization.splitChunks -> Vite auto vendor-split (verify chunk output; manualChunks if custom)',
      'DefinePlugin -> define (but prefer moving env to import.meta.env)',
      'css/style/mini-css loaders -> Vite native CSS (drop them); @svgr/webpack -> vite-plugin-svgr',
    ],
    red: [
      'custom loaders with no Vite plugin equivalent',
      'require.context / dynamic require(variable) -> import.meta.glob (HMR + literal-only caveats)',
      'target:node / Module Federation / worker chains',
    ],
  },
  cra: {
    label: 'Create React App',
    green: [
      'react-scripts -> @vitejs/plugin-react; scripts start/build/test -> vite/vite build/(vitest)',
      'public/index.html -> root index.html; %PUBLIC_URL%/ -> / ; inject <script type=module src=/src/index.*>',
      'CSS imports work natively; static assets served from public/',
    ],
    yellow: [
      'JSX-in-.js -> rename .jsx (CRA allows JSX in .js, Vite does not)',
      'REACT_APP_* -> VITE_* + process.env -> import.meta.env; NODE_ENV -> import.meta.env.MODE',
      'CRA SVG ReactComponent import -> vite-plugin-svgr + ?react',
    ],
    red: [
      'jest -> vitest test migration (config + globals differ)',
      'react-app-rewired/craco custom webpack that has no Vite equivalent',
      'ejected CRA configs',
    ],
  },
  rollup: {
    label: 'Rollup',
    green: [
      'input -> build.rollupOptions.input; output/external map directly (Vite IS Rollup for build)',
      'drop @rollup/plugin-node-resolve + commonjs (built into Vite)',
      '@rollup/plugin-alias -> resolve.alias; @rollup/plugin-replace -> define',
    ],
    yellow: [
      'babel presets (react/es2015) -> @vitejs/plugin-react',
      'dev-server plugins (serve/livereload) -> Vite built-in dev server',
      'very old React (16/17) render API -> createRoot on a bump to 18 (if you upgrade)',
    ],
    red: [
      'bespoke Rollup output plugins with no browser-app equivalent',
      'multi-output library builds (keep Rollup or use build.lib carefully)',
    ],
  },
  parcel: {
    label: 'Parcel',
    green: [
      '.parcelrc transformers -> @vitejs/plugin-react (native)',
      'index.html entry is already HTML-first with <script type=module> = Vite convention (little to move)',
      'targets.distDir -> build.outDir; targets.publicUrl -> base',
    ],
    yellow: [
      'JSX-in-.js (Parcel allows it) -> esbuild loader .js->jsx or rename',
      'Tailwind/PostCSS: re-add deps + rename config to .cjs under type:module',
      'process.env -> import.meta.env (Parcel inlines process.env without a prefix)',
    ],
    red: [
      'custom .parcelrc optimizers/reporters/namers with no Vite equivalent',
      'Parcel-specific macros or its automatic install feature',
    ],
  },
};

function plan(detected, dir) {
  const { bundler, render } = detected;

  // Up-front gate: SSR/SSG is architectural — route away, do not auto-convert.
  if (render.mode === 'ssr' || render.mode === 'ssg') {
    return {
      route: true,
      verdict: `STOP: ${render.reason}. Migrating rendering strategy is architectural, not a bundler swap.`,
      options: [
        'Keep webpack/Next semantics + Rust speed -> Rspack or Turbopack',
        render.mode === 'ssg'
          ? 'Static site -> Astro (uses Vite under the hood, SSG/hybrid)'
          : 'Full SSR -> a Vite meta-framework (or stay on Next/Nuxt/Remix)',
        'Only if you truly want CSR: drop SSR and migrate the SPA to Vite (loses per-route SSR/SSG)',
      ],
    };
  }

  if (!bundler || bundler === 'vite') {
    return { route: false, alreadyVite: bundler === 'vite', steps: [], note: bundler === 'vite' ? 'Already on Vite.' : 'No known bundler detected.' };
  }

  const s = SOURCES[bundler];
  if (!s) return { route: false, steps: [], note: `No plan yet for source bundler: ${bundler}` };

  const steps = [];
  for (const g of s.green) steps.push({ tier: 'green', id: 'map', msg: g });
  for (const y of s.yellow) steps.push({ tier: 'yellow', id: 'map', msg: y });
  for (const r of s.red) steps.push({ tier: 'red', id: 'map', msg: r });
  // add project-specific detected checks (jsx-in-js, env, postcss) on top of the generic map
  steps.push(...sharedChecks(dir));

  return { route: false, from: s.label, to: 'Vite', steps };
}

module.exports = { plan, sharedChecks };
