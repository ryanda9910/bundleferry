<p align="center">
  <img src="assets/logo.svg" alt="bundleferry" width="96" height="96" />
</p>

<h1 align="center">bundleferry</h1>

<p align="center"><b>Seberangkan project JS-mu antar bundler (webpack, CRA, Rollup, Parcel ke Vite) tanpa build-nya tenggelam.</b></p>

<p align="center">
  <a href="README.md">🇺🇸 English</a> · 🇮🇩 Bahasa Indonesia · <a href="README.zh-CN.md">🇨🇳 简体中文</a>
</p>

<p align="center">
  <img src="demo.gif" alt="demo bundleferry" width="760" />
</p>

bundleferry adalah "awak kapal" untuk migrasi bundler di Claude Code (juga Codex,
Cursor, Gemini CLI, opencode). Ganti bundler kelihatannya cuma tukar config, padahal
tidak: config-nya beres ~80%, sisanya yang 20% — `process.env`, JSX di file `.js`, config
PostCSS sisa, custom loader, SSR — justru tempat tiap migrasi diam-diam mandek dengan
build hijau tapi kelakuannya salah. bundleferry deteksi bundler + mode rendering, susun
rencananya dalam tiga tingkat (hijau otomatis, kuning konfirmasi, merah punch-list
manusia), route SSR/SSG (bukan dipaksa convert), dan menolak bilang "selesai" selama masih
ada blocker merah. Zero-dep, deterministik.

## Sebelum / Sesudah

**Tanpa bundleferry** — agen tukar config, build hijau, lalu sebuah `process.env` atau file
JSX-di-`.js` diam-diam salah di produksi — atau ia "migrasi" app Next.js jadi Vite SPA dan
diam-diam menghapus SSR per-route:

```
$ # config ditukar, build hijau — tapi 20% yang tak mekanis tak ada yang cek
$ vite build   # ✓ built — ship rusak
```

**Dengan bundleferry** — ia susun rencana bertingkat dan sebut gotcha-nya sebelum kamu
build, dan STOP di SSR alih-alih pura-pura convert:

```
bundleferry — ./my-app
  bundler: parcel   render: csr
  Migration plan: Parcel → Vite
    green:  • .parcelrc transformers → @vitejs/plugin-react (native)
    yellow: • 15 file .js mengandung JSX → rename .jsx atau set esbuild loader
            • .postcssrc ada dan Tailwind DIPAKAI → tambah lagi deps, config → .cjs
    red:    • custom .parcelrc optimizer tanpa padanan Vite
2 item merah — jangan bilang "selesai" sebelum tiap-tiap diputuskan.
```

## Pasang

```bash
# macOS / Linux / WSL
curl -fsSL https://raw.githubusercontent.com/ryanda9910/bundleferry/main/install.sh | bash

# Windows (PowerShell)
irm https://raw.githubusercontent.com/ryanda9910/bundleferry/main/install.ps1 | iex
```

Cari semua coding agent yang kamu punya lalu pasang skill-nya. ~10 detik, aman
dijalankan ulang. Tanpa key, tanpa akun, tanpa dependency.

## Lisensi

MIT.
