# Changelog

All notable changes to bundleferry are documented here.

## [0.4.0] — 2026-07-09

`--advise`: recommend a bundler, and never report a number the source did not produce.

### Added
- **`bundleferry --advise <dir>`** — recommends a bundler, UI library and rendering mode, and
  reports the build tool's security posture from **OpenSSF Scorecard** and **OSV** (both live,
  keyless APIs). Flags: `--offline`, `--no-cache`, `--refresh`.
- **A maker/verifier loop.** `propose()` emits `Claim`s, each carrying mandatory `provenance`.
  An **independent** `verify()` re-resolves that provenance against what the adapter actually
  returned. A claim asserting a score the source never produced is rejected, forced to red, and
  printed as `UNVERIFIED — do not act on this`. Rejected claims are downgraded, never dropped.
  The gate is real: **7 tests fail** if the verifier ever stops rejecting (proven by mutation).
- **`src/evidence.ts`** — the only file that touches the network. Never throws: degradation is a
  value (`offline` / `unreachable` / `no-data` / `timeout`). 24h file cache, best-effort writes,
  and an `EvidenceEnv` injection seam so **no test opens a socket**. The timeout is enforced by
  racing rather than delegated, so a `fetch` that ignores `signal` cannot hang the CLI.
- **React Native / Expo advice.** Still routed, never auto-migrated, but it now names
  [Re.Pack](https://github.com/callstack/repack) as the one real non-Metro path and warns that
  adopting it leaves the officially supported Expo configuration.
- **29 more tests** (25 → **54**).

### The honesty rules, each enforced by a test
- **No number exists → say so.** 3 of 9 bundler repos (rspack, bun, rolldown) have no Scorecard
  entry. They report `no data exists`, never a zero.
- **Scope the advisories.** Querying OSV without a version returns every advisory ever filed
  (55 for `next`), most long fixed. The declared version is pinned (25 for `next@15.0.0`); when it
  cannot be resolved, the output says the result is *not* scoped to the install.
- **Never skip a check silently.** A bundler with no mapped repo/package reports `not checked`
  rather than passing quietly — a security check that silently does not run is the worst outcome.
  (This one was a real bug: `bun`'s 2 advisories and `@rspack/core`'s 1 were being hidden.)
- **Offline is not an error.** It degrades to `unknown — could not reach the source` and exits 0.

### Deliberately out of scope
Backend stack (Go/Rust/Elixir/PHP), REST vs gRPC vs WebSocket, and algorithm optimization.
Deriving true Big-O is undecidable in general, TechEmpower is archived (frozen 2026-03-24), and
no authoritative source ranks one language against another — so bundleferry does not pretend to.
Measured at 0.06 cosine similarity against bundleferry's own domain: a different tool.

## [0.3.1] — 2026-07-09

Post-release audit. Every published claim was re-verified by running the tool, not by
reading the code — which surfaced one real detection bug and several stale docs.

### Fixed
- **Turborepo was misdetected as Turbopack.** The rule matched the npm dep `turbo`, but
  `turbo` *is* Turborepo (a task runner); Turbopack ships inside Next and has no standalone
  dep. A plain Turborepo monorepo root was reported as `bundler: turbopack`, forced to
  `render: ssr`, and refused with a Next.js SSR route + exit 1. Turbopack is now matched
  only by its build script (`next dev|build … --turbopack`), and the dep signal is gone.
- **The CLI accepted a path that does not exist**, printing a confident
  "No known bundler detected." and exiting 0. It now errors with `not a directory: <path>`
  and exits 2.
- **`docs/customizing.md` pointed at `lib/plan.js` and `lib/detect.js`** — both deleted in
  the v0.2 TypeScript rewrite. Rewritten against the real `src/` layout (`SOURCE_UNWIND`,
  `TARGET_ARRIVE`, `sharedChecks`, `tsChecks`, the `BUNDLERS` scoring weights), plus a note
  on the `turbo` false-positive class.
- **The Indonesian and Chinese READMEs still described v0.1** ("webpack, CRA, Rollup, Parcel
  → Vite"), omitting multi-target, TypeScript, and 5 of the bundlers. Both corrected.
- **The README's Sources/Targets line was stale**, missing Rspack, Vite, Bun, Metro,
  Turbopack and the Bun target.

### Added
- **4 more tests** (25 total): Turborepo-is-not-Turbopack, a Turborepo monorepo that really
  uses Vite, real `next dev --turbopack` still routing SSR, and `detect()` on an empty dir.

### Verified (no change needed)
- The 14×7 support matrix: all 98 cells exercised — 79 plan, 14 route, 5 already-there, 0 dead.
- The detector against ground truth on all 12 real fixtures (6 sources + their 6 migrated copies).
- All 6 published gzip size deltas reproduce from disk, including `31.0 KB → 44.7 KB (+44.3%)`.
- All 6 study-case repos still resolve; all 14 README-referenced local files exist.

## [0.3.0] — 2026-07-09

Full ecosystem coverage, tests, and two more real migration study cases.

### Added
- **Five more bundlers.** Sources: Rspack, Vite (migrate *away* from), Bun, Metro
  (React Native / Expo), Turbopack. Target: Bun. The matrix is now **14 sources ×
  7 targets** with no dead cells.
- **Platform/framework gate.** Metro (RN/Expo) and Turbopack are *routed away* rather
  than planned — they bundle for a platform or a framework, not a swappable web target.
- **21 tests** (`node:test`) over the honest edge cases: esbuild detected via an indirect
  `node build.js` and its false-positive guard, craco > cra precedence, RN-as-non-web,
  the no-dead-cells matrix, browser-SPA→tsup is red, TypeScript posture, PostCSS
  orphaned-vs-real, size measure/compare. `npm test` builds then runs.
- **Two more end-to-end study cases**, both built green on real public repos:
  Rspack ([tolokoban/ast-viewer](https://github.com/tolokoban/ast-viewer), −3.6% gzip,
  surfaced real tsconfig path aliases) and Bun ([begoon/rapira](https://github.com/begoon/rapira),
  −1.6% gzip, where the whole migration was a Web Worker reference `./worker.js` → `./worker.ts`).
- **Support-matrix chart** and an **About / context** section in the README.

### Fixed
- **esbuild-as-source was undetectable** in the common case (invoked via a plain
  `node build.js` that imports it, so its name never appears in package.json). Now
  detected by reading the referenced build script — guarded so a plain `node build.js`
  with no esbuild dep stays undetected.
- A detected source with no explicit rules fell through to a dead "no source rules"
  note. Every detected source now gets at least a generic unwind.
- Deepened the thin plans for Snowpack, Gulp (task-runner vs bundler), Browserify, CRACO.

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
