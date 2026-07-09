<p align="center">
  <img src="assets/logo.svg" alt="bundleferry" width="96" height="96" />
</p>

<h1 align="center">bundleferry</h1>

<p align="center"><b>Ferry your JS project across bundlers (webpack, CRA, Rollup, Parcel to Vite) without sinking the build.</b></p>

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
a leftover PostCSS config, custom loaders, SSR — is where every real migration silently
stalls with a green build that behaves wrong. bundleferry detects the bundler + rendering
mode, plans the crossing in three tiers, routes SSR away instead of faking it, and won't
let you call it done while the boat's still taking on water. Zero-dep, deterministic.

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

## Real runs

Not a mockup. Actual bundleferry runs in Claude Code — see **[CASES.md](CASES.md)**.

## Install

```bash
# macOS / Linux / WSL
curl -fsSL https://raw.githubusercontent.com/ryanda9910/bundleferry/main/install.sh | bash

# Windows (PowerShell)
irm https://raw.githubusercontent.com/ryanda9910/bundleferry/main/install.ps1 | iex
```

Finds every coding agent you have and installs the skill into each. ~10 seconds,
safe to re-run. `--project` also installs into the current repo's `.claude/`. No
key, no account, no dependency.

Manual: copy [`skill/SKILL.md`](skill/SKILL.md) into your agent's skills/rules dir
(Claude Code: `~/.claude/skills/bundleferry/SKILL.md`).

## Documentation

Full docs in **[docs/](docs/)** — [usage](docs/usage.md) · [reference](docs/checklist.md) ·
[install](docs/install.md) · [customizing](docs/customizing.md) · [FAQ](docs/faq.md) ·
[real runs](CASES.md) · [contributing](CONTRIBUTING.md).

## Works in

Claude Code (native skill), plus any agent that loads a rules/skill file — Codex,
Cursor, Gemini CLI, opencode, Aider, GitHub Copilot CLI.

## License

MIT.
