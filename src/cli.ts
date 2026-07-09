#!/usr/bin/env node
// bundleferry CLI — plan a tiered migration between any bundler pair without sinking the build.
//
//   bundleferry [dir]                       plan a migration to Vite (default target)
//   bundleferry [dir] --target rspack       plan to a chosen target
//   bundleferry --list-targets              show all target bundlers
//   bundleferry --detect [dir]              detect bundler + render mode + TypeScript only
//   bundleferry --size <old> <new>          compare gzip total-transfer of two build dirs
//
// Deterministic, zero runtime dependency. Exit 1 on a red-tier blocker or SSR route.

import * as path from 'node:path';
import { detect } from './detect.js';
import { plan, TARGETS, targetLabel } from './plan.js';
import * as size from './size.js';
import type { MigratePlan, TargetBundler, Tier } from './types.js';

const tty = process.stdout.isTTY;
const C = tty
  ? { g: '\x1b[38;5;42m', y: '\x1b[38;5;221m', r: '\x1b[38;5;203m', d: '\x1b[2m', b: '\x1b[1m', x: '\x1b[0m' }
  : { g: '', y: '', r: '', d: '', b: '', x: '' };
const TIER: Record<Tier, string> = { green: `${C.g}green${C.x}`, yellow: `${C.y}yellow${C.x}`, red: `${C.r}red${C.x}` };

function arg(flag: string): string | undefined {
  const i = process.argv.indexOf(flag);
  return i >= 0 ? process.argv[i + 1] : undefined;
}

function sizeMode(oldDir: string, newDir: string): never {
  const om = size.measure(oldDir);
  const nm = size.measure(newDir);
  if (!om || !nm) { console.error('bundleferry --size: could not read one of the build dirs'); process.exit(1); }
  const cmp = size.compare(om, nm)!;
  console.log(`${C.b}bundleferry size${C.x} ${C.d}— normalized gzip total-transfer${C.x}`);
  console.log(`  old ${oldDir}: ${size.fmt(om.raw)} raw / ${C.b}${size.fmt(om.gzip)} gzip${C.x} / ${size.fmt(om.brotli)} brotli (${om.fileCount} files)`);
  console.log(`  new ${newDir}: ${size.fmt(nm.raw)} raw / ${C.b}${size.fmt(nm.gzip)} gzip${C.x} / ${size.fmt(nm.brotli)} brotli (${nm.fileCount} files)`);
  const col = cmp.verdict === 'smaller' ? C.g : cmp.verdict === 'larger' ? C.y : C.d;
  console.log(`  ${col}${C.b}${cmp.line}${C.x}`);
  console.log(`${C.d}  (gzip total-transfer is the honest number — chunk counts differ across bundlers)${C.x}`);
  process.exit(0);
}

function main(): void {
  const argv = process.argv.slice(2);

  if (argv.includes('--list-targets')) {
    console.log(`${C.b}bundleferry targets:${C.x}`);
    for (const t of TARGETS) console.log(`  ${C.g}${t}${C.x} — ${targetLabel(t)}`);
    console.log(`${C.d}  use: bundleferry <dir> --target <name>${C.x}`);
    process.exit(0);
  }

  if (argv[0] === '--size') { sizeMode(argv[1]!, argv[2]!); }

  const detectOnly = argv.includes('--detect');
  const targetArg = (arg('--target') ?? 'vite') as TargetBundler;
  if (!TARGETS.includes(targetArg)) {
    console.error(`unknown target "${targetArg}". valid: ${TARGETS.join(', ')}`); process.exit(2);
  }
  const dir = path.resolve(argv.find((a) => !a.startsWith('--') && a !== targetArg) ?? '.');

  const d = detect(dir);
  console.log(`${C.b}bundleferry${C.x} ${C.d}— ${dir}${C.x}`);
  console.log(`  bundler: ${C.b}${d.bundler ?? 'none detected'}${C.x}   render: ${C.b}${d.render.mode}${C.x} ${C.d}(${d.render.reason})${C.x}`);
  console.log(`  ${d.typescript.isTypeScript ? C.b + 'TypeScript' + C.x : C.d + 'JavaScript' + C.x}: ${C.d}${d.typescript.note}${C.x}`);
  if (d.ranked.length > 1) console.log(`  ${C.d}also matched: ${d.ranked.slice(1).map((m) => m.name).join(', ')}${C.x}`);
  if (detectOnly) process.exit(0);

  const p = plan(d, dir, targetArg);

  if (p.route) {
    console.log(`\n  ${C.r}${C.b}${p.verdict}${C.x}`);
    console.log(`  ${C.b}Recommended routes:${C.x}`);
    p.options.forEach((o) => console.log(`    ${C.y}→${C.x} ${o}`));
    console.log(`\n${C.r}${C.b}ROUTE — do not say "done": this needs an architectural choice, not an auto-migration.${C.x}`);
    process.exit(1);
  }

  const mp = p as MigratePlan;
  if (mp.alreadyThere) { console.log(`\n  ${C.g}${mp.note}${C.x}`); process.exit(0); }
  if (!mp.steps.length) { console.log(`\n  ${mp.note ?? 'No plan.'}`); process.exit(0); }

  console.log(`\n  ${C.b}Migration plan: ${mp.from} → ${targetLabel(targetArg)}${C.x}\n`);
  const byTier: Record<Tier, typeof mp.steps> = { green: [], yellow: [], red: [] };
  for (const s of mp.steps) byTier[s.tier].push(s);
  for (const t of ['green', 'yellow', 'red'] as Tier[]) {
    if (!byTier[t].length) continue;
    console.log(`  ${TIER[t]}:`);
    for (const s of byTier[t]) console.log(`    • ${s.msg}${s.fix ? `\n      ${C.d}fix: ${s.fix}${C.x}` : ''}`);
    console.log('');
  }
  const reds = byTier.red.length;
  if (reds) { console.log(`${C.r}${C.b}${reds} red-tier item(s) — do not say "done" until each is decided (they never auto-fix).${C.x}`); process.exit(1); }
  console.log(`${C.g}${C.b}green/yellow only — safe to migrate; confirm the yellow items, then build to verify.${C.x}`);
  process.exit(0);
}

main();
