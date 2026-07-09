# FAQ

### What is this, exactly?

A skill (plain instructions) your coding agent follows. It adds no network calls,
no telemetry, no account — your code goes wherever your agent already sends it and
nowhere new.

### How is it different from a linter / CLI tool?

A codemod blindly transforms; bundleferry reasons about YOUR project — it reads which loaders are actually used, whether a PostCSS config is orphaned or real, and whether the app is CSR or SSR — then tiers the work and stops on the parts that need a human. Deterministic engine, agent judgment on top.

### Will it slow me down?

No. It reads package.json + the config + a shallow src scan (a few KB), runs in milliseconds, and only when you ask to migrate a bundler or a dependency upgrade broke the build.

### Does it spam?

It's instructed not to: it only flags real signal and never invents problems.

### What languages / stacks?

webpack, Create React App, Rollup, Parcel → Vite today (esbuild + Rspack/Astro routing noted). Any JS/TS project. The engine is zero-dep Node; the skill is language-agnostic.

### Which agents?

Claude Code (native), plus Codex, Cursor, Gemini CLI, opencode, Aider, Copilot CLI.

### It missed / mis-flagged something.

Open an issue with the example and the output — the checklist is a living file.
