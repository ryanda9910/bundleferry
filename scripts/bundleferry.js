#!/usr/bin/env node
'use strict';
/**
 * bundleferry — ferry a JS project across bundlers without sinking the build.
 *
 * Detects the current bundler + rendering mode, plans a migration to Vite tagged by tier
 * (green = auto-safe, yellow = confirm, red = human punch-list), and refuses a false-green:
 * SSR/SSG is routed away (Rspack/Astro/Next), not blindly converted.
 *
 * Modes:
 *   bundleferry [dir]                 detect + plan (default: cwd)
 *   bundleferry --detect [dir]        detect only (bundler + render mode)
 *   bundleferry --size <old> <new>    compare gzip total-transfer of two build dirs
 *
 * Deterministic, zero-dependency. Exit 1 when a red-tier blocker or SSR route is found
 * (so it can gate a "done" claim); exit 0 on a clean green/yellow plan.
 */
const path = require('path');
const { detect } = require('../lib/detect');
const { plan } = require('../lib/plan');
const size = require('../lib/size');

const C = process.stdout.isTTY
  ? { g: '\x1b[38;5;42m', y: '\x1b[38;5;221m', r: '\x1b[38;5;203m', d: '\x1b[2m', b: '\x1b[1m', x: '\x1b[0m' }
  : { g: '', y: '', r: '', d: '', b: '', x: '' };
const TIER = { green: `${C.g}green${C.x}`, yellow: `${C.y}yellow${C.x}`, red: `${C.r}red${C.x}` };

function sizeMode(oldDir, newDir) {
  const om = size.measure(oldDir);
  const nm = size.measure(newDir);
  if (!om || !nm) { console.error('bundleferry --size: could not read one of the build dirs'); process.exit(1); }
  const cmp = size.compare(om, nm);
  console.log(`${C.b}bundleferry size${C.x} ${C.d}— normalized gzip total-transfer${C.x}`);
  console.log(`  old ${oldDir}: ${size.fmt(om.raw)} raw / ${C.b}${size.fmt(om.gzip)} gzip${C.x} / ${size.fmt(om.brotli)} brotli (${om.fileCount} files)`);
  console.log(`  new ${newDir}: ${size.fmt(nm.raw)} raw / ${C.b}${size.fmt(nm.gzip)} gzip${C.x} / ${size.fmt(nm.brotli)} brotli (${nm.fileCount} files)`);
  const col = cmp.verdict === 'smaller' ? C.g : cmp.verdict === 'larger' ? C.y : C.d;
  console.log(`  ${col}${C.b}${cmp.line}${C.x}`);
  console.log(`${C.d}  (gzip total-transfer is the honest number — chunk counts differ across bundlers)${C.x}`);
  process.exit(0);
}

function main() {
  const args = process.argv.slice(2);
  if (args[0] === '--size') return sizeMode(args[1], args[2]);
  const detectOnly = args.includes('--detect');
  const dir = path.resolve(args.find((a) => !a.startsWith('--')) || '.');

  const d = detect(dir);
  console.log(`${C.b}bundleferry${C.x} ${C.d}— ${dir}${C.x}`);
  console.log(`  bundler: ${C.b}${d.bundler || 'none detected'}${C.x}   render: ${C.b}${d.render.mode}${C.x} ${C.d}(${d.render.reason})${C.x}`);
  if (d.ranked.length > 1) {
    console.log(`  ${C.d}also matched: ${d.ranked.slice(1).map((m) => m.name).join(', ')}${C.x}`);
  }
  if (detectOnly) process.exit(0);

  const p = plan(d, dir);

  if (p.route) {
    console.log(`\n  ${C.r}${C.b}${p.verdict}${C.x}`);
    console.log(`  ${C.b}Recommended routes:${C.x}`);
    p.options.forEach((o) => console.log(`    ${C.y}→${C.x} ${o}`));
    console.log(`\n${C.r}${C.b}ROUTE — do not say "done": this needs an architectural choice, not an auto-migration.${C.x}`);
    process.exit(1);
  }
  if (p.alreadyVite) { console.log(`\n  ${C.g}Already on Vite — nothing to ferry.${C.x}`); process.exit(0); }
  if (!p.steps || !p.steps.length) { console.log(`\n  ${p.note || 'No plan.'}`); process.exit(0); }

  console.log(`\n  ${C.b}Migration plan: ${p.from} → ${p.to}${C.x}\n`);
  const byTier = { green: [], yellow: [], red: [] };
  for (const s of p.steps) byTier[s.tier].push(s);
  for (const t of ['green', 'yellow', 'red']) {
    if (!byTier[t].length) continue;
    console.log(`  ${TIER[t]}:`);
    for (const s of byTier[t]) {
      console.log(`    • ${s.msg}${s.fix ? `\n      ${C.d}fix: ${s.fix}${C.x}` : ''}`);
    }
    console.log('');
  }
  const reds = byTier.red.length;
  if (reds) {
    console.log(`${C.r}${C.b}${reds} red-tier item(s) — do not say "done" until each is decided (they never auto-fix).${C.x}`);
    process.exit(1);
  }
  console.log(`${C.g}${C.b}green/yellow only — safe to migrate; confirm the yellow items, then build to verify.${C.x}`);
  process.exit(0);
}

main();
