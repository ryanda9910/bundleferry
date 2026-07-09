# Real runs

bundleferry planned + migrated four real public GitHub repos — one per source bundler —
to Vite, and every migrated build went green. These are the actual outputs, not mockups.
Reproduce: clone the source repo, run `node scripts/bundleferry.js <dir>` for the plan,
then `node scripts/bundleferry.js --size <old-dist> <new-dist>` for the honest delta.

The four fixtures (all MIT, CSR apps/libs):
- webpack — [twa-dev/webpack-boilerplate](https://github.com/twa-dev/webpack-boilerplate)
- CRA — [kevinshen56714/create-react-phaser3-app](https://github.com/kevinshen56714/create-react-phaser3-app)
- Rollup — [yamafaktory/babel-react-rollup-starter](https://github.com/yamafaktory/babel-react-rollup-starter)
- Parcel — [alokVerma749/foody-monk](https://github.com/alokVerma749/foody-monk)

---

## Case 1 — Rollup → Vite: the plan predicted the exact gotcha

bundleferry on the Rollup starter said (verbatim):
```
bundleferry — rollup-starter
  bundler: rollup   render: csr (client-rendered SPA (no SSR framework/entry detected))

  Migration plan: Rollup → Vite
  green:
    • input -> build.rollupOptions.input; output/external map directly (Vite IS Rollup for build)
    • drop @rollup/plugin-node-resolve + commonjs (built into Vite)
    • @rollup/plugin-alias -> resolve.alias; @rollup/plugin-replace -> define
  yellow:
    • babel presets (react/es2015) -> @vitejs/plugin-react
    • 1 .js file(s) contain JSX — Vite parses JSX only from .jsx/.tsx
      fix: rename them to .jsx, OR set esbuild.loader ".js"->"jsx" in vite.config (confirm which)
  red:
    • bespoke Rollup output plugins with no browser-app equivalent
2 red-tier item(s) — do not say "done" until each is decided (they never auto-fix).
```
Notable: the yellow "JSX in .js" flag is exactly what broke the real migration — the
Vite build failed with `Expression expected` on `<DummyComponent />` in `src/index.js`
until it was renamed `.jsx`. bundleferry named the fix before the build was even run.

---

## Case 2 — webpack → Vite: "migrate what's used, not every config line"

The webpack config declared CSS-Modules loaders, `@svgr/webpack`, stylelint + eslint
webpack plugins — but the actual `src` imports only react + one component. bundleferry's
plan lists those as yellow ("drop them") rather than treating the config as gospel. The
real migration confirmed it: dropping every loader still built green.

Real gotcha hit + caught: a leftover `postcss.config.cjs` required `autoprefixer` (a
dropped dep) → Vite auto-loads any `postcss.config.*` → `MODULE_NOT_FOUND`. bundleferry
flags leftover PostCSS config as its own step (green when orphaned, yellow when Tailwind
is actually used).

Size (verbatim): `52.2 KB gzip -> 52.6 KB gzip (+0.8%, larger)` — parity.

---

## Case 3 — CRA → Vite: the Phaser game

Standard CRA (react-scripts 5). green plan: `react-scripts`→`@vitejs/plugin-react`,
`public/index.html`→root with `%PUBLIC_URL%/`→`/` + injected module script. Built green.

Size (verbatim): `319.5 KB gzip -> 336.0 KB gzip (+5.2%, larger)`.

---

## Case 4 — Parcel → Vite: the only bundle that got smaller (and why)

Parcel app with Redux, router, Tailwind, 23 JS files with JSX, and `React.lazy()` routes.
bundleferry flagged all three real gotchas up front: JSX-in-.js (×15 detected), the
Tailwind PostCSS config (correctly as *used*, not orphaned), and Parcel's HTML-first
entry already matching Vite. Built green after re-adding Tailwind + renaming its config
to `.cjs`.

Size (verbatim): `138.8 KB gzip -> 126.5 KB gzip (-8.8%, smaller)`.

Notable — the honest lesson across all four: **"Vite is smaller" is usually false.** Three
of four got *larger* (React version bumps + older minifiers were tighter on small apps).
Parcel won only because the app used `React.lazy()` and Vite honored the code-splitting
Parcel had flattened into one blob. bundleferry reports the real gzip total-transfer
delta, not the "Vite always wins" myth.

---

## Case 5 — SSR is routed, not converted (the fail-safe)

bundleferry on a Next.js project said (verbatim):
```
bundleferry — ssr-test
  bundler: next   render: ssr (Next.js (SSR/SSG framework))

  STOP: Next.js (SSR/SSG framework). Migrating rendering strategy is architectural, not a bundler swap.
  Recommended routes:
    → Keep webpack/Next semantics + Rust speed -> Rspack or Turbopack
    → Full SSR -> a Vite meta-framework (or stay on Next/Nuxt/Remix)
    → Only if you truly want CSR: drop SSR and migrate the SPA to Vite (loses per-route SSR/SSG)

ROUTE — do not say "done": this needs an architectural choice, not an auto-migration.
```
Notable: it exits non-zero and refuses to plan a false-green SSR→SPA conversion — the
red-tier fail-safe. Auto-converting here would silently drop per-route SSR/SSG.
