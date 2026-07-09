<p align="center">
  <img src="assets/logo.svg" alt="bundleferry" width="96" height="96" />
</p>

<h1 align="center">bundleferry</h1>

<p align="center"><b>在不弄垮构建的前提下，把你的 JS 项目从一个打包器迁移到另一个（webpack、CRA、Rollup、Parcel 到 Vite）。</b></p>

<p align="center">
  <a href="README.md">🇺🇸 English</a> · <a href="README.id.md">🇮🇩 Bahasa Indonesia</a> · 🇨🇳 简体中文
</p>

<p align="center">
  <img src="demo.gif" alt="bundleferry 演示" width="760" />
</p>

bundleferry 是 Claude Code（也支持 Codex、Cursor、Gemini CLI、opencode）里做打包器迁移的
"船员"。换打包器看似只是改配置，其实不然：配置只能搞定约 80%，剩下的 20%——`process.env`、
`.js` 文件里的 JSX、遗留的 PostCSS 配置、自定义 loader、SSR——正是每次真实迁移悄悄卡住的地方：
构建通过了，行为却是错的。bundleferry 检测当前打包器与渲染模式，用三档规划迁移（绿色自动、
黄色确认、红色留给人工清单），把 SSR/SSG 路由出去而不是硬转，并且在红色阻塞项未处理前拒绝
说"完成"。零依赖、确定性。

## 前 / 后

**没有 bundleferry** —— 智能体换了配置，构建通过，但某个 `process.env` 或 `.js` 里的 JSX 在
生产环境悄悄出错；或者把 Next.js 应用"迁移"成 Vite SPA，悄悄丢掉了按路由的 SSR：

```
$ # 配置换了，构建绿了 —— 但没人检查那不机械的 20%
$ vite build   # ✓ built —— 带着 bug 上线
```

**有了 bundleferry** —— 它分档规划，并在你构建前点出具体的坑，遇到 SSR 就停下而不是假装转换：

```
bundleferry — ./my-app
  bundler: parcel   render: csr
  Migration plan: Parcel → Vite
    green:  • .parcelrc transformers → @vitejs/plugin-react（原生）
    yellow: • 15 个 .js 文件含 JSX → 重命名 .jsx 或设置 esbuild loader
            • 存在 .postcssrc 且确实用了 Tailwind → 重新装依赖，配置改 .cjs
    red:    • 自定义 .parcelrc optimizer，Vite 无对应
2 项红色 —— 每一项决定前都不要说"完成"。
```

## 安装

```bash
# macOS / Linux / WSL
curl -fsSL https://raw.githubusercontent.com/ryanda9910/bundleferry/main/install.sh | bash

# Windows (PowerShell)
irm https://raw.githubusercontent.com/ryanda9910/bundleferry/main/install.ps1 | iex
```

它会找出你装的每个编码 agent，把技能装进每一个。约 10 秒，可重复运行。无需密钥、无需账号、无依赖。

## 许可证

MIT。
