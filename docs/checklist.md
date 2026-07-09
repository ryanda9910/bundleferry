# Reference

What bundleferry does, in detail. Mirrors `skill/SKILL.md`.



## Rendering-mode gate (first)

```
bundler: next   render: ssr → STOP + route to Rspack/Astro/meta-framework
```
**Fix:** route SSR/SSG away — never auto-convert to a Vite SPA (drops per-route SSR/SSG).

## The three tiers

- **green** — mechanical: outDir/base/alias/server mapping, drop node-resolve/commonjs, react-scripts/babel-loader → @vitejs/plugin-react, entry HTML → root index.html.
- **yellow** — confirm: JSX-in-.js (rename .jsx), process.env → import.meta.env.VITE_*, Tailwind/PostCSS re-add + .cjs, splitChunks → auto vendor-split, SVGR + ?react.
- **red** — punch-list: custom loaders, require.context/dynamic require, Node builtins in browser, Module Federation, workers, jest → vitest, any SSR/SSG change.

## Honest bundle-size

Measure gzip total-transfer, not raw and not per-file. "Vite is smaller" is often false — report the real delta with `bundleferry --size`.

...

---

bundleferry reports real signal only — if it's fine, it isn't flagged.
