# Changelog

All notable changes to bundleferry are documented here.

## [0.2.0] — 2026-07-09

Multi-target, TypeScript-first rewrite.

### Added
- **Multi-target migrations.** Pick the target: Vite, Rspack, esbuild, tsup, Rolldown, or
  Parcel (`--target <name>`, `--list-targets`). Each source×target pair gets its own
  tiered plan — e.g. webpack→Rspack keeps webpack semantics; a browser SPA→tsup is flagged
  red ("not an app bundler").
- **Wider source detection.** Adds esbuild, Snowpack, Gulp, Browserify, CRACO on top of
  webpack / CRA / Rollup / Parcel.
- **TypeScript posture detection + steps.** Reports whether the project is TS (tsconfig,
  `.ts/.tsx` count, path aliases) and adds TS-specific plan steps (tsconfig paths →
  target alias, `vite-env.d.ts`, and the "the bundler transpiles TS but does NOT
  type-check — keep `tsc --noEmit`" reminder).

### Changed
- **Rewritten in TypeScript.** `src/*.ts` compiled to `dist/` with emitted `.d.ts` — the
  engine ships fully typed. Public API via `import { detect, plan, measure } from "bundleferry"`.
- CLI moved to `dist/cli.js` (`node dist/cli.js` / `npx bundleferry`).
- README/SKILL clarified: bundleferry **plans + measures**; it does not silently rewrite
  the repo (the mechanical green steps you apply and build to verify).

## [0.1.0] — 2026-07-09

First release.

### Added
- The skill (`skill/SKILL.md`) — Detects the current bundler + rendering mode, plans the migration to Vite in three tiers (green auto, yellow confirm, red human punch-list), routes SSR/SSG away, and refuses done while a red-tier blocker is open..
- One-line installers (`install.sh`, `install.ps1`); multi-harness.
- Docs (`docs/`), real runs (`CASES.md`), i18n (EN / ID / zh-CN), key-free demo.
- MIT license, CONTRIBUTING, commitlint config + CI + opt-in hook.

[0.1.0]: https://github.com/ryanda9910/bundleferry/releases/tag/v0.1.0
