# Usage

## When it runs

- **Automatically** when you are asked to migrate a bundler, switch build tools, or fix a build a dependency upgrade broke.
- **On demand** via `/bundleferry`.

## What it looks at

package.json (deps + scripts), the bundler config file, and a shallow scan of `src` for JSX-in-.js, process.env usage, and leftover PostCSS/Tailwind config. It plans; it does not rewrite source blindly.

## The output

```
bundleferry — ./my-app
  bundler: parcel   render: csr
  Migration plan: Parcel → Vite
    green:  • .parcelrc transformers → @vitejs/plugin-react (native)
    yellow: • 15 .js files contain JSX → rename .jsx or set esbuild loader
    red:    • custom .parcelrc optimizers with no Vite equivalent
2 red-tier item(s) — do not say "done" until each is decided.
```

`bundler`/`render` = what was detected (render mode is the up-front gate). **green** = mechanical, safe to apply. **yellow** = transform but confirm (behavior may shift). **red** = never auto-fix; decide each. The closing line refuses "done" while a red item or an auto-converted SSR project is open. `bundleferry --size <old> <new>` prints the honest gzip total-transfer delta.

## The rule

Do not say "done" while a red-tier blocker is unaddressed, while an SSR/SSG project has been auto-converted instead of routed, or while the new build is not verified green.
