'use strict';
// size.js — normalized bundle-size measurement, tool-agnostic. The honest headline:
// total transferred (gzip), not raw and not per-file, so old-vs-new is apples-to-apples
// regardless of how each bundler chunks. Zero-dep (uses zlib).

const fs = require('fs');
const path = require('path');
const zlib = require('zlib');

function walk(dir, exts) {
  const out = [];
  const rec = (d, depth) => {
    if (depth > 8) return;
    let entries;
    try { entries = fs.readdirSync(d, { withFileTypes: true }); } catch { return; }
    for (const e of entries) {
      const full = path.join(d, e.name);
      if (e.isDirectory()) rec(full, depth + 1);
      else if (!exts || exts.some((x) => e.name.endsWith(x))) out.push(full);
    }
  };
  rec(dir, 0);
  return out;
}

function gzipSize(buf) {
  try { return zlib.gzipSync(buf, { level: 9 }).length; } catch { return 0; }
}
function brotliSize(buf) {
  try { return zlib.brotliCompressSync(buf).length; } catch { return 0; }
}

// Measure a build output dir. Returns totals for JS + CSS (the transferred code),
// each raw / gzip / brotli, plus the single biggest JS file.
function measure(outDir) {
  if (!fs.existsSync(outDir)) return null;
  const files = walk(outDir, ['.js', '.mjs', '.css']);
  let raw = 0, gz = 0, br = 0, biggest = { file: null, gzip: 0 };
  for (const f of files) {
    const buf = fs.readFileSync(f);
    raw += buf.length;
    const g = gzipSize(buf);
    gz += g;
    br += brotliSize(buf);
    if (f.endsWith('.js') && g > biggest.gzip) biggest = { file: path.basename(f), gzip: g, raw: buf.length };
  }
  return { outDir, fileCount: files.length, raw, gzip: gz, brotli: br, biggest };
}

function findOutDir(projectDir) {
  for (const d of ['dist', 'build', 'out']) {
    const p = path.join(projectDir, d);
    if (fs.existsSync(p)) return p;
  }
  return null;
}

function fmt(bytes) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(2)} MB`;
}

// Compare two measured builds, honest delta on the gzip total-transfer number.
function compare(oldM, newM) {
  if (!oldM || !newM) return null;
  const d = newM.gzip - oldM.gzip;
  const pct = oldM.gzip ? (d / oldM.gzip) * 100 : 0;
  return {
    oldGzip: oldM.gzip, newGzip: newM.gzip, deltaBytes: d, deltaPct: pct,
    verdict: d < 0 ? 'smaller' : d > 0 ? 'larger' : 'same',
    line: `${fmt(oldM.gzip)} gzip -> ${fmt(newM.gzip)} gzip (${d >= 0 ? '+' : ''}${pct.toFixed(1)}%, ${d >= 0 ? 'larger' : 'smaller'})`,
  };
}

module.exports = { measure, compare, findOutDir, fmt };
