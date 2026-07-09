# Customizing

Two layers. The **skill** is one file of instructions: `skill/SKILL.md` (installed at
`~/.claude/skills/bundleferry/SKILL.md`) — edit it to change agent behavior, no build needed.
The **engine** is TypeScript under `src/`, compiled with `npm run build`. Run `npm test`
after any engine change.

## Add or remove a migration rule

Migration rules live in `src/plan.ts`, split in two:

- `SOURCE_UNWIND` — per-source, target-agnostic steps ("how to leave webpack"). Each entry
  has `green` / `yellow` / `red` string arrays. A source with no entry falls back to a
  generic unwind, so there are no dead matrix cells.
- `TARGET_ARRIVE` — per-target caveats ("what arriving at Rspack costs you"), same three arrays.

Project-scanning checks live in `sharedChecks()` (JSX-in-`.js`, `process.env`, leftover
PostCSS) and `tsChecks()` (tsconfig path aliases, the "transpiles but does not type-check"
reminder). Each pushes a `Step` — `{ tier, id, msg, fix? }`.

## Add a bundler

Add the name to `SourceBundler` (or `TargetBundler`) in `src/types.ts`, then add a rule to
the `BUNDLERS` array in `src/detect.ts`. Rules are scored, highest wins:
`inBuild +4`, `hasConfig +3`, `inScript +2`, `indirect +2`, `hasDep +1` — so a build-script
match outranks a bare dependency. Order matters for ties; framework-coupled bundlers
(metro, craco, cra) sit first.

Be careful with `deps`: a package name that belongs to a *different* product is a false
positive. The npm package `turbo` is Turborepo (a task runner), not Turbopack, so Turbopack
is matched only by its build script.

## Tune the strictness

The rendering-mode gate lives in `detectRenderMode()` in `src/detect.ts` — add frameworks or
SSR-entry hints there. Anything returning `ssr` / `ssg` is **routed**, not migrated. To change
how strict the gate is, move an item between the `green` / `yellow` / `red` arrays in
`src/plan.ts`; red-tier items make the CLI exit non-zero.

## Scope

By default it plans the whole project directory you point it at. `bundleferry --detect <dir>` runs detection only; `bundleferry --size <old> <new>` compares two build outputs.

## Project-specific rules

Use `--project` install to commit a tuned `./.claude/skills/bundleferry/SKILL.md` so
your team shares the same behavior.
