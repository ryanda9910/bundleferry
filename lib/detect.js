'use strict';
// detect.js — figure out which bundler a project uses + its rendering mode.
// Deterministic, zero-dep. Reads package.json (deps + scripts) and globs config files.
// Precedence matters: scripts are the strongest signal; CRACO wraps CRA; Vite may list
// rollup/esbuild transitively so its own config/dep is authoritative.

const fs = require('fs');
const path = require('path');

function readJSON(p) {
  try { return JSON.parse(fs.readFileSync(p, 'utf8')); } catch { return null; }
}
function exists(dir, ...names) {
  return names.some((n) => fs.existsSync(path.join(dir, n)));
}

// Ordered rules — first match wins for the PRIMARY bundler.
const BUNDLERS = [
  {
    name: 'craco',
    configs: ['craco.config.js', 'craco.config.cjs'],
    deps: ['@craco/craco'],
    script: /\bcraco\b/,
  },
  {
    name: 'cra',
    configs: [],
    deps: ['react-scripts'],
    script: /\breact-scripts\b/,
  },
  {
    name: 'next',
    configs: ['next.config.js', 'next.config.mjs', 'next.config.ts'],
    deps: ['next'],
    script: /\bnext\b/,
  },
  {
    name: 'vite',
    configs: ['vite.config.js', 'vite.config.ts', 'vite.config.mjs'],
    deps: ['vite'],
    script: /\bvite\b/,
  },
  {
    name: 'parcel',
    configs: ['.parcelrc'],
    deps: ['parcel', 'parcel-bundler'],
    script: /\bparcel\b/,
    pkgField: (pkg) => pkg.source || pkg.targets,
  },
  {
    name: 'webpack',
    configs: ['webpack.config.js', 'webpack.config.cjs', 'webpack.config.ts'],
    deps: ['webpack', 'webpack-cli'],
    script: /\bwebpack\b/,
  },
  {
    name: 'rollup',
    configs: ['rollup.config.js', 'rollup.config.mjs', 'rollup.config.ts'],
    deps: ['rollup'],
    script: /\brollup\b/,
    // rollup is often transitive — require a config file or an explicit script.
    weak: true,
  },
  {
    name: 'esbuild',
    configs: ['esbuild.config.js', 'esbuild.config.mjs'],
    deps: ['esbuild'],
    script: /\besbuild\b/,
    weak: true,
  },
];

function detectBundler(dir) {
  const pkg = readJSON(path.join(dir, 'package.json')) || {};
  const allDeps = { ...(pkg.dependencies || {}), ...(pkg.devDependencies || {}) };
  const scripts = Object.values(pkg.scripts || {}).join(' ');
  const buildScript = (pkg.scripts && pkg.scripts.build) || '';

  const matches = [];
  for (const b of BUNDLERS) {
    const hasConfig = exists(dir, ...b.configs);
    const hasDep = b.deps.some((d) => d in allDeps);
    const inScript = b.script.test(scripts);
    const inBuild = b.script.test(buildScript);
    const pkgField = b.pkgField ? !!b.pkgField(pkg) : false;
    // weak bundlers (rollup/esbuild) need a config file OR an explicit script,
    // not mere dep presence (they're common transitive deps).
    const signal = b.weak ? (hasConfig || inScript) : (hasConfig || hasDep || inScript || pkgField);
    if (signal) {
      let score = 0;
      if (inBuild) score += 4;   // strongest: the build script names it
      if (hasConfig) score += 3;
      if (inScript) score += 2;
      if (hasDep) score += 1;
      if (pkgField) score += 1;
      matches.push({ name: b.name, score, hasConfig, hasDep, inScript });
    }
  }
  matches.sort((a, b) => b.score - a.score);
  return { primary: matches[0] ? matches[0].name : null, ranked: matches, pkg };
}

// Rendering mode: CSR (SPA) vs SSR/SSG. This is the up-front gate — SSR/SSG migrations
// are architectural, not a bundler swap, so the tool routes them instead of converting.
function detectRenderMode(dir, bundler, pkg) {
  const allDeps = { ...((pkg && pkg.dependencies) || {}), ...((pkg && pkg.devDependencies) || {}) };
  // framework-driven SSR/SSG
  if ('next' in allDeps || bundler === 'next') return { mode: 'ssr', reason: 'Next.js (SSR/SSG framework)' };
  if ('nuxt' in allDeps) return { mode: 'ssr', reason: 'Nuxt (SSR/SSG framework)' };
  if ('astro' in allDeps) return { mode: 'ssg', reason: 'Astro (SSG/hybrid framework)' };
  if ('@remix-run/react' in allDeps || 'remix' in allDeps) return { mode: 'ssr', reason: 'Remix (SSR framework)' };
  if ('gatsby' in allDeps) return { mode: 'ssg', reason: 'Gatsby (SSG framework)' };
  // a custom SSR entry is a strong hint
  const ssrHints = ['server.js', 'server.ts', 'entry-server.jsx', 'entry-server.tsx', 'src/entry-server.tsx'];
  if (ssrHints.some((f) => fs.existsSync(path.join(dir, f)))) {
    return { mode: 'ssr', reason: 'custom SSR entry file present' };
  }
  return { mode: 'csr', reason: 'client-rendered SPA (no SSR framework/entry detected)' };
}

function detect(dir) {
  const { primary, ranked, pkg } = detectBundler(dir);
  const render = detectRenderMode(dir, primary, pkg);
  return { bundler: primary, ranked, render, pkg };
}

module.exports = { detect, detectBundler, detectRenderMode };
