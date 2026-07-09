---
name: bundleferry
description: >-
  Ferry a JS project across bundlers (webpack, CRA, Rollup, Parcel → Vite) without sinking the build.
  Triggers automatically when you are asked to migrate a bundler, switch build tools, or fix a build that
  a dependency upgrade suddenly broke (or on /bundleferry). A migration is never fully mechanical — env
  rewrites, JSX-in-.js, custom loaders, and SSR each hide a decision — so bundleferry detects the current
  bundler and rendering mode, plans the move in three tiers (green auto-safe, yellow confirm, red human
  punch-list), routes SSR/SSG away instead of blindly converting it, verifies the new build goes green, and
  refuses to say "done" while a red-tier blocker is unaddressed.
---

# bundleferry — ferry your project across bundlers without sinking

Migrating a bundler looks like a config swap and isn't. The config translates ~80% of
the way; the last 20% — `process.env`→`import.meta.env`, JSX inside `.js` files, a
leftover PostCSS config, custom webpack loaders, SSR — is where every real migration
stalls, silently, with a green build that behaves wrong. bundleferry is the deckhand:
it maps the mechanical part, flags the judgment part, and never lets you call the
crossing done while the boat's still taking on water.

## When to run

- **On demand** when the user asks to migrate/switch bundlers, or types `/bundleferry`.
- **Automatically** when a dependency upgrade broke the build and the fix is a
  bundler/config-level change.

## The rendering-mode gate (first, always)

Before planning anything, check the rendering mode. **CSR (SPA) → Vite is the safe path.**
**SSR/SSG is architectural, not a bundler swap** — a Next/Nuxt/Astro/Remix app or a custom
SSR entry gets STOPPED and routed, not converted:
- keep the framework's semantics + Rust speed → **Rspack / Turbopack**
- a static site → **Astro** (Vite under the hood)
- full SSR → a Vite meta-framework, or stay put

Auto-converting SSR to a Vite SPA silently drops per-route SSR/SSG. Refuse it.

## The three tiers

1. **green** — mechanical, safe to apply: `outDir`/`base`/`alias`/`server` mapping, drop
   node-resolve/commonjs (Vite built-in), `react-scripts`/babel-loader → `@vitejs/plugin-react`,
   move the entry HTML to a root `index.html` with `<script type=module>`.
2. **yellow** — transform but confirm: JSX-in-`.js` (rename `.jsx` or esbuild loader),
   `process.env`→`import.meta.env.VITE_*` (+ `.env` key rename), Tailwind/PostCSS re-add +
   `.cjs` under `type:module`, `splitChunks`→auto vendor-split (verify), SVGR + `?react`.
3. **red** — never auto-fix, surface as a punch-list: custom loaders with no Vite plugin,
   `require.context`/dynamic `require`, Node built-ins in browser code, Module Federation,
   workers, jest→vitest, and **any SSR/SSG change**.

## What it looks at

`package.json` (deps + scripts), the bundler config file, and a shallow scan of `src`
for JSX-in-`.js`, `process.env` usage, and leftover PostCSS/Tailwind config. It does not
rewrite source blindly — it plans, then the mechanical green steps apply, yellow steps
confirm, red steps wait for you.

## Verify before done

After the green/yellow steps, run the build. A migration is only finished when the new
build goes **green** AND every red-tier item has an explicit decision. Compare bundle
size honestly: **gzip total-transfer**, not raw and not per-file (chunk counts differ
across bundlers). "Vite is smaller" is often false — report the real delta.

## The hard rule

Do not say "done" on a bundler migration while a red-tier blocker is unaddressed, while
an SSR/SSG project has been auto-converted instead of routed, or while the new build is
not verified green.

## Output format

```
bundleferry — <dir>
  bundler: <name>   render: <csr|ssr|ssg> (<why>)
  Migration plan: <from> → Vite
    green:  • <mechanical step>
    yellow: • <transform> → fix: <how>
    red:    • <blocker to decide>
<closing line: what must be decided before this crossing is done>
```

Be terse. Real signal only.
