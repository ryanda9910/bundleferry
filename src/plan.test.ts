import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { detect } from './detect.js';
import { plan, TARGETS } from './plan.js';
import type { MigratePlan, PackageJson, RoutePlan } from './types.js';

function fixture(pkg: PackageJson, files: Record<string, string> = {}): string {
  const d = fs.mkdtempSync(path.join(os.tmpdir(), 'bfplan-'));
  fs.writeFileSync(path.join(d, 'package.json'), JSON.stringify(pkg));
  for (const [f, c] of Object.entries(files)) {
    const full = path.join(d, f);
    fs.mkdirSync(path.dirname(full), { recursive: true });
    fs.writeFileSync(full, c);
  }
  return d;
}

const SOURCES: Array<[string, string]> = [
  ['webpack', 'webpack'],
  ['rollup', 'rollup -c'],
  ['snowpack', 'snowpack build'],
  ['gulp', 'gulp'],
  ['browserify', 'browserify src -o out.js'],
];

test('matrix has NO dead cells: every source plans to every target', () => {
  for (const [dep, script] of SOURCES) {
    const d = fixture({ devDependencies: { [dep]: '1' }, scripts: { build: script } });
    const det = detect(d);
    for (const target of TARGETS) {
      const p = plan(det, d, target);
      if (p.route) continue; // SSR route is a valid non-plan outcome
      const mp = p as MigratePlan;
      // a real plan OR "already there" — never a dead "no rules" note with zero steps
      const ok = mp.steps.length > 0 || mp.alreadyThere === true;
      assert.ok(ok, `${dep} → ${target} produced a dead cell: ${JSON.stringify(mp.note)}`);
    }
  }
});

test('SSR/SSG projects ROUTE instead of planning, whatever the target', () => {
  const next = fixture({ dependencies: { next: '15' }, scripts: { build: 'next build' } });
  const det = detect(next);
  for (const target of TARGETS) {
    const p = plan(det, next, target);
    assert.equal(p.route, true, `Next.js → ${target} should route, not plan`);
    assert.ok((p as RoutePlan).options.length > 0);
  }
});

test('React Native (Metro) routes away — no web migration', () => {
  const rn = fixture({ dependencies: { 'react-native': '0.74' }, scripts: { start: 'react-native start' } });
  const p = plan(detect(rn), rn, 'vite');
  assert.equal(p.route, true);
});

test('a browser SPA → tsup is flagged red (tsup is library-only)', () => {
  const d = fixture({ devDependencies: { webpack: '5' }, scripts: { build: 'webpack' } });
  const p = plan(detect(d), d, 'tsup') as MigratePlan;
  const reds = p.steps.filter((s) => s.tier === 'red').map((s) => s.msg).join(' ');
  assert.match(reds, /not an app bundler|library/i);
});

test('same source and target says "already there"', () => {
  const d = fixture({ devDependencies: { vite: '5' }, scripts: { build: 'vite build' } }, { 'vite.config.js': '' });
  const p = plan(detect(d), d, 'vite') as MigratePlan;
  assert.equal(p.alreadyThere, true);
  assert.equal(p.steps.length, 0);
});

test('detected JSX-in-.js surfaces as a yellow step (vite target)', () => {
  const d = fixture(
    { devDependencies: { webpack: '5' }, scripts: { build: 'webpack' } },
    { 'src/App.js': 'import W from "./W"; export default () => <Widget><W/></Widget>' },
  );
  const p = plan(detect(d), d, 'vite') as MigratePlan;
  const hit = p.steps.find((s) => s.id === 'jsx-in-js');
  assert.ok(hit, 'expected a jsx-in-js yellow step');
  assert.equal(hit?.tier, 'yellow');
});

test('a TypeScript project gets the "transpiles but does not type-check" step', () => {
  const d = fixture(
    { devDependencies: { webpack: '5', typescript: '5' }, scripts: { build: 'webpack' } },
    { 'tsconfig.json': '{}', 'src/app.tsx': 'export const x: number = 1' },
  );
  const p = plan(detect(d), d, 'vite') as MigratePlan;
  const hit = p.steps.find((s) => s.id === 'ts-transpile');
  assert.ok(hit, 'expected a ts-transpile step');
  assert.match(hit!.msg, /type-check/i);
});

test('orphaned PostCSS config is green (remove); real Tailwind is yellow (keep)', () => {
  const orphan = fixture(
    { devDependencies: { webpack: '5' }, scripts: { build: 'webpack' } },
    { 'postcss.config.cjs': 'module.exports={}', 'src/app.js': 'export default 1' },
  );
  const oStep = (plan(detect(orphan), orphan, 'vite') as MigratePlan).steps.find((s) => s.id === 'postcss-config');
  assert.equal(oStep?.tier, 'green');

  const tw = fixture(
    { devDependencies: { webpack: '5' }, scripts: { build: 'webpack' } },
    { 'postcss.config.cjs': 'module.exports={}', 'tailwind.config.js': 'module.exports={}', 'src/index.css': '@tailwind base;' },
  );
  const tStep = (plan(detect(tw), tw, 'vite') as MigratePlan).steps.find((s) => s.id === 'postcss-config');
  assert.equal(tStep?.tier, 'yellow');
});
