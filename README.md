<p align="center">
  <img src="assets/logo.svg" alt="bundleferry" width="96" height="96" />
</p>

<h1 align="center">bundleferry</h1>

<p align="center"><b>Ferry your JS/TS project across bundlers — plan a migration between any pair, without sinking the build.</b></p>

<p align="center">
  🇺🇸 English · <a href="README.id.md">🇮🇩 Bahasa Indonesia</a> · <a href="README.zh-CN.md">🇨🇳 简体中文</a>
</p>

<p align="center">
  <img alt="license" src="https://img.shields.io/badge/license-MIT-34D399" />
  <img alt="skill" src="https://img.shields.io/badge/Claude%20Code-skill-34D399" />
  <img alt="harness" src="https://img.shields.io/badge/also-Codex%20·%20Cursor%20·%20Gemini%20·%20opencode-blue" />
  <img alt="install" src="https://img.shields.io/badge/install-one%20line-34D399" />
</p>

<p align="center">
  <img src="demo.gif" alt="bundleferry demo" width="760" />
</p>

bundleferry is the deckhand for a bundler migration in Claude Code (also Codex,
Cursor, Gemini CLI, opencode). Switching bundlers looks like a config swap and isn't:
the config translates ~80% of the way, and the last 20% — `process.env`, JSX-in-`.js`,
a leftover PostCSS config, custom loaders, tsconfig paths, SSR — is where every real
migration silently stalls with a green build that behaves wrong. bundleferry detects the
bundler, rendering mode, and TypeScript posture, lets you **pick the target**, plans the
crossing in three tiers, routes SSR away instead of faking it, and won't let you call it
done while the boat's still taking on water.

**It plans + measures — it does not silently rewrite your repo.** You get a tiered,
target-aware plan and an honest size delta; the mechanical (green) steps you then apply
and build to verify. Written in TypeScript, ships typed. No runtime dependency.

**Sources:** webpack · CRA · CRACO · Rollup · Parcel · esbuild · Snowpack · Gulp · Browserify
**Targets:** Vite · Rspack · esbuild · tsup · Rolldown · Parcel  — `bundleferry <dir> --target <name>`
(pick Rspack to keep webpack semantics, tsup/Rolldown for libraries, Vite for a CSR SPA).

## Before / After

**Without bundleferry** — the agent swaps the config, the build goes green, and a
`process.env` read or a JSX-in-`.js` file silently misbehaves in production — or it
"migrates" a Next.js app to a Vite SPA and quietly drops per-route SSR:

```
$ # config swapped, build green — but no one checked the 20% that isn't mechanical
$ vite build   # ✓ built — ships broken
```

**With bundleferry** — it plans the crossing in tiers and names the exact gotchas
before you build, and STOPS on SSR instead of faking a conversion:

```
bundleferry — ./my-app
  bundler: parcel   render: csr
  Migration plan: Parcel → Vite
    green:  • .parcelrc transformers → @vitejs/plugin-react (native)
    yellow: • 15 .js files contain JSX → rename .jsx or set esbuild loader
            • .postcssrc present and Tailwind IS used → re-add deps, config → .cjs
    red:    • custom .parcelrc optimizers with no Vite equivalent
2 red-tier item(s) — do not say "done" until each is decided.
```

## End-to-end study: 6 real repos, one per bundler

Not a mockup. bundleferry planned + migrated six real public GitHub repos to Vite,
and **every migrated build went green.** Each was installed and built for real (Node 24,
Bun 1.3); the size column is the honest gzip total-transfer delta, measured by
`bundleferry --size`.

| Source bundler | Repo | Build | Size (gzip): old → Vite | Gotcha caught live |
|---|---|---|---|---|
| **Rollup** | [babel-react-rollup-starter](https://github.com/yamafaktory/babel-react-rollup-starter) | ✅ green | 31 KB → 45 KB (+44%) | JSX-in-.js → rename `.jsx` |
| **webpack** | [webpack-boilerplate](https://github.com/twa-dev/webpack-boilerplate) | ✅ green | 52 KB → 53 KB (+1%) | orphaned `postcss.config` |
| **CRA** | [create-react-phaser3-app](https://github.com/kevinshen56714/create-react-phaser3-app) | ✅ green | 320 KB → 336 KB (+5%) | `%PUBLIC_URL%` strip |
| **Parcel** | [foody-monk](https://github.com/alokVerma749/foody-monk) | ✅ green | 139 KB → **127 KB (−9%)** | JSX-in-.js ×15, real Tailwind |
| **Rspack** | [ast-viewer](https://github.com/tolokoban/ast-viewer) | ✅ green | 1.92 MB → **1.86 MB (−3.6%)** | TS path aliases (17 `.ts/.tsx`) |
| **Bun** | [rapira](https://github.com/begoon/rapira) | ✅ green | 111 KB → **109 KB (−1.6%)** | Web Worker: `./worker.js` → `./worker.ts` |

The honest headline: **"Vite is smaller" is not a rule.** Three of the first four got
*larger* (React version bumps + older minifiers were tighter on small apps); Parcel,
Rspack and Bun each shrank slightly, and only for specific reasons — Parcel because the
app used `React.lazy()` and Vite honored code-splitting Parcel had flattened. Each plan
predicted the exact gotcha the real migration then hit. Full verbatim runs in
**[CASES.md](CASES.md)**.

Two bundlers deliberately have **no** migration case: **Metro (React Native)** and
**Turbopack** — both are routed away by the render gate, because they are platform /
framework bundlers, not web-bundler swaps.

## Use it

**As a CLI** (TypeScript engine, build once):

```bash
git clone https://github.com/ryanda9910/bundleferry && cd bundleferry
npm install && npm run build

node dist/cli.js ./my-app                    # plan a migration to Vite (default)
node dist/cli.js ./my-app --target rspack    # plan to a chosen target
node dist/cli.js --list-targets              # all targets
node dist/cli.js --detect ./my-app           # bundler + render mode + TypeScript only
node dist/cli.js --size old/dist new/dist    # honest gzip total-transfer delta
```

**As a Claude Code skill** (also Codex, Cursor, Gemini CLI, opencode):

```bash
# macOS / Linux / WSL
curl -fsSL https://raw.githubusercontent.com/ryanda9910/bundleferry/main/install.sh | bash
# Windows (PowerShell)
irm https://raw.githubusercontent.com/ryanda9910/bundleferry/main/install.ps1 | iex
```

Installs the skill into every coding agent it finds. `--project` also installs into the
current repo's `.claude/`. Manual: copy [`skill/SKILL.md`](skill/SKILL.md) into your
agent's skills/rules dir (`~/.claude/skills/bundleferry/SKILL.md`).

## Support matrix

Every cell is real — `plan` = a tiered migration plan, `route` = stopped at the
rendering/platform gate (architectural, not a bundler swap), `—` = same source and
target (nothing to do). No dead cells.

| source \ target | Vite | Rspack | esbuild | tsup | Rolldown | Parcel | Bun |
|---|---|---|---|---|---|---|---|
| **webpack** | plan | plan | plan | plan | plan | plan | plan |
| **CRA** | plan | plan | plan | plan | plan | plan | plan |
| **CRACO** | plan | plan | plan | plan | plan | plan | plan |
| **Rollup** | plan | plan | plan | plan | plan | plan | plan |
| **Parcel** | plan | plan | plan | plan | plan | — | plan |
| **esbuild** | plan | plan | — | plan | plan | plan | plan |
| **Snowpack** | plan | plan | plan | plan | plan | plan | plan |
| **Gulp** | plan | plan | plan | plan | plan | plan | plan |
| **Browserify** | plan | plan | plan | plan | plan | plan | plan |
| **Rspack** | plan | — | plan | plan | plan | plan | plan |
| **Vite** | — | plan | plan | plan | plan | plan | plan |
| **Bun** | plan | plan | plan | plan | plan | plan | — |
| **Metro / RN** | route | route | route | route | route | route | route |
| **Next / Turbopack** | route | route | route | route | route | route | route |

`bundleferry <dir> --target <name>` · `--list-targets` · `--detect <dir>` · `--size <old> <new>`

## Documentation

Full docs in **[docs/](docs/)** — [usage](docs/usage.md) · [reference](docs/checklist.md) ·
[install](docs/install.md) · [customizing](docs/customizing.md) · [FAQ](docs/faq.md) ·
[real runs](CASES.md) · [contributing](CONTRIBUTING.md).

## About

**Why this exists.** "Just switch the bundler" is one of the most under-estimated tasks in
frontend work. The config translates about 80% of the way, and the remaining 20% —
`process.env` → `import.meta.env`, JSX inside `.js` files, a leftover PostCSS/Tailwind
config, custom loaders, tsconfig path aliases, and the whole SSR/SSG question — is where
migrations silently stall: the build goes green and the app misbehaves in ways no test
catches. Every tool in this space is either path-specific (CRA-only), stale, or blindly
transforms without flagging the parts that need a human. bundleferry was built to be the
honest middle: **plan the mechanical part, name the judgment part, and refuse a false green.**

**What it does — and doesn't.** bundleferry **plans and measures**; it does not silently
rewrite your repo. You point it at a project, it detects the current bundler, rendering
mode, and TypeScript posture, you pick a target, and it returns a plan split into three
tiers — **green** (mechanical, safe to apply), **yellow** (transform but confirm), **red**
(never auto-fix; decide each). SSR/SSG projects and React Native (Metro) are **routed away**
(to Rspack/Astro/a meta-framework) rather than fake-converted. It also computes an honest
**gzip total-transfer** size delta, because "Vite is smaller" is usually a myth on real apps.
The mechanical (green) steps you then apply and build to verify — the loop-designer fail-safe:
deny/ask, don't guess.

**How it's built.** A zero-runtime-dependency **TypeScript** engine (`src/*.ts` → `dist/`,
ships with emitted `.d.ts`). Three modules: `detect` (deterministic bundler + render-mode +
TS detection), `plan` (the source×target matrix with green/yellow/red rules), `size`
(normalized gzip/brotli measurement). Public API: `import { detect, plan, measure } from
"bundleferry"`. Covered by 21 `node:test` cases exercising the honest edge cases (esbuild
detected via an indirect `node build.js`, its false-positive guard, RN-as-non-web, the
no-dead-cells matrix, tsup-is-red-for-a-SPA, TypeScript posture). Every migration rule was
distilled from real migrations of real public repos — see the study table above and
[CASES.md](CASES.md).

**Status.** Early but honest. It plans and measures across 14 sources and 7 targets today;
it does not yet auto-apply or run the build for you (by design — that stays your gated step).
Contributions and correction reports welcome — the rules are a living file.

## Works in

Claude Code (native skill), plus any agent that loads a rules/skill file — Codex,
Cursor, Gemini CLI, opencode, Aider, GitHub Copilot CLI.

## License

MIT.
