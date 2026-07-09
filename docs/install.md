# Install

## One line

```bash
# macOS / Linux / WSL
curl -fsSL https://raw.githubusercontent.com/ryanda9910/bundleferry/main/install.sh | bash
# Windows (PowerShell)
irm https://raw.githubusercontent.com/ryanda9910/bundleferry/main/install.ps1 | iex
```

Idempotent — re-run to update. Needs `curl` or `wget` (macOS/Linux); no other deps.

## Where it installs

| Agent | Location |
|---|---|
| **Claude Code** (native skill) | `~/.claude/skills/bundleferry/SKILL.md` |
| Codex | `~/.codex/bundleferry/bundleferry.md` |
| Cursor | `~/.cursor/bundleferry/bundleferry.md` |
| Gemini CLI | `~/.gemini/bundleferry/bundleferry.md` |
| opencode / Aider / Copilot CLI | manual (paste into the rules file) |

## Global vs project

- **Global** (default) — home agent dirs; applies to every repo.
- **Project** — add `-- --project` (sh) / `-project` (ps1) to also install into
  `./.claude/skills/bundleferry/SKILL.md` so the skill travels with the repo.

## Manual

```bash
mkdir -p ~/.claude/skills/bundleferry
cp skill/SKILL.md ~/.claude/skills/bundleferry/SKILL.md
```

## Uninstall

```bash
rm -rf ~/.claude/skills/bundleferry ~/.codex/bundleferry ~/.cursor/bundleferry ~/.gemini/bundleferry
```
