# Customizing

bundleferry is one file of instructions: `skill/SKILL.md` (installed at
`~/.claude/skills/bundleferry/SKILL.md`). Edit it to change behavior — no build, no code.

## Add or remove behavior

Edit `lib/plan.js` — each source bundler has `green`/`yellow`/`red` arrays. Add a rule to the right tier (e.g. a new yellow transform), or add a detected check in `sharedChecks()` (like the JSX-in-.js / PostCSS scanners).

## Tune the strictness

The rendering-mode gate lives in `lib/detect.js` (`detectRenderMode`) — add frameworks or SSR-entry hints there. Tier assignments live in `lib/plan.js`; move an item between green/yellow/red to change how strict the gate is.

## Scope

By default it plans the whole project directory you point it at. `bundleferry --detect <dir>` runs detection only; `bundleferry --size <old> <new>` compares two build outputs.

## Project-specific rules

Use `--project` install to commit a tuned `./.claude/skills/bundleferry/SKILL.md` so
your team shares the same behavior.
