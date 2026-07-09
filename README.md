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

## End-to-end study: 4 real repos, one per bundler

Not a mockup. bundleferry planned + migrated four real public GitHub repos to Vite,
and **every migrated build went green.** Each was `npm install`ed and built for real
(Node 24); the size column is the honest gzip total-transfer delta.

| Source bundler | Repo | Build | Size (gzip): old → Vite | Gotcha caught live |
|---|---|---|---|---|
| **Rollup** | [babel-react-rollup-starter](https://github.com/yamafaktory/babel-react-rollup-starter) | ✅ green | 31 KB → 45 KB (+44%) | JSX-in-.js → rename `.jsx` |
| **webpack** | [webpack-boilerplate](https://github.com/twa-dev/webpack-boilerplate) | ✅ green | 52 KB → 53 KB (+1%) | orphaned `postcss.config` |
| **CRA** | [create-react-phaser3-app](https://github.com/kevinshen56714/create-react-phaser3-app) | ✅ green | 320 KB → 336 KB (+5%) | `%PUBLIC_URL%` strip |
| **Parcel** | [foody-monk](https://github.com/alokVerma749/foody-monk) | ✅ green | 139 KB → **127 KB (−9%)** | JSX-in-.js ×15, real Tailwind |

The honest headline: **3 of 4 got *larger* on Vite.** "Vite is smaller" is a myth on
small apps (React bumps + older minifiers were tighter). Parcel shrank only because the
app used `React.lazy()` and Vite honored the code-splitting Parcel had flattened. Each
plan predicted the exact gotcha the real migration then hit. Full verbatim runs in
**[CASES.md](CASES.md)**.

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

## Documentation

Full docs in **[docs/](docs/)** — [usage](docs/usage.md) · [reference](docs/checklist.md) ·
[install](docs/install.md) · [customizing](docs/customizing.md) · [FAQ](docs/faq.md) ·
[real runs](CASES.md) · [contributing](CONTRIBUTING.md).

## Works in

Claude Code (native skill), plus any agent that loads a rules/skill file — Codex,
Cursor, Gemini CLI, opencode, Aider, GitHub Copilot CLI.

## License

MIT.
