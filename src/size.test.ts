import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { measure, compare, findOutDir, fmt } from './size.js';

function distWith(files: Record<string, string>): string {
  const d = fs.mkdtempSync(path.join(os.tmpdir(), 'bfsize-'));
  const out = path.join(d, 'dist');
  fs.mkdirSync(out);
  for (const [f, c] of Object.entries(files)) fs.writeFileSync(path.join(out, f), c);
  return out;
}

test('measure sums JS+CSS and finds the biggest JS', () => {
  const out = distWith({ 'a.js': 'x'.repeat(2000), 'b.js': 'y'.repeat(500), 'c.css': 'z'.repeat(300) });
  const m = measure(out)!;
  assert.equal(m.fileCount, 3);
  assert.ok(m.raw >= 2800);
  assert.ok(m.gzip > 0 && m.gzip < m.raw); // gzip compresses
  assert.equal(m.biggest.file, 'a.js');
});

test('measure returns null for a missing dir', () => {
  assert.equal(measure('/no/such/dir/xyz'), null);
});

test('compare reports smaller / larger honestly', () => {
  const small = measure(distWith({ 'a.js': 'x'.repeat(500) }))!;
  const big = measure(distWith({ 'a.js': 'x'.repeat(5000) }))!;
  assert.equal(compare(big, small)!.verdict, 'smaller');
  assert.equal(compare(small, big)!.verdict, 'larger');
  assert.equal(compare(null, small), null);
});

test('findOutDir prefers dist, then build, then out', () => {
  const d = fs.mkdtempSync(path.join(os.tmpdir(), 'bfout-'));
  fs.mkdirSync(path.join(d, 'build'));
  assert.equal(findOutDir(d), path.join(d, 'build'));
});

test('fmt renders B / KB / MB', () => {
  assert.match(fmt(500), /B$/);
  assert.match(fmt(5000), /KB$/);
  assert.match(fmt(5_000_000), /MB$/);
});
