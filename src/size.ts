// size.ts — normalized, tool-agnostic bundle-size measurement. The honest headline is
// gzip total-transfer (not raw, not per-file), so old-vs-new is apples-to-apples across
// bundlers that chunk differently. Dependency-free (Node zlib).

import * as fs from 'node:fs';
import * as path from 'node:path';
import * as zlib from 'node:zlib';

export interface Measured {
  outDir: string;
  fileCount: number;
  raw: number;
  gzip: number;
  brotli: number;
  biggest: { file: string | null; gzip: number; raw: number };
}

function walk(dir: string, exts: string[]): string[] {
  const out: string[] = [];
  const rec = (d: string, depth: number): void => {
    if (depth > 8) return;
    let entries: fs.Dirent[];
    try { entries = fs.readdirSync(d, { withFileTypes: true }); } catch { return; }
    for (const e of entries) {
      const full = path.join(d, e.name);
      if (e.isDirectory()) rec(full, depth + 1);
      else if (exts.some((x) => e.name.endsWith(x))) out.push(full);
    }
  };
  rec(dir, 0);
  return out;
}

const gz = (buf: Buffer): number => { try { return zlib.gzipSync(buf, { level: 9 }).length; } catch { return 0; } };
const br = (buf: Buffer): number => { try { return zlib.brotliCompressSync(buf).length; } catch { return 0; } };

export function measure(outDir: string): Measured | null {
  if (!fs.existsSync(outDir)) return null;
  const files = walk(outDir, ['.js', '.mjs', '.css']);
  let raw = 0, gzip = 0, brotli = 0;
  let biggest = { file: null as string | null, gzip: 0, raw: 0 };
  for (const f of files) {
    const buf = fs.readFileSync(f);
    raw += buf.length;
    const g = gz(buf);
    gzip += g;
    brotli += br(buf);
    if (f.endsWith('.js') && g > biggest.gzip) biggest = { file: path.basename(f), gzip: g, raw: buf.length };
  }
  return { outDir, fileCount: files.length, raw, gzip, brotli, biggest };
}

export function findOutDir(projectDir: string): string | null {
  for (const d of ['dist', 'build', 'out']) {
    const p = path.join(projectDir, d);
    if (fs.existsSync(p)) return p;
  }
  return null;
}

export function fmt(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(2)} MB`;
}

export interface SizeCompare { oldGzip: number; newGzip: number; deltaBytes: number; deltaPct: number; verdict: 'smaller' | 'larger' | 'same'; line: string; }

export function compare(oldM: Measured | null, newM: Measured | null): SizeCompare | null {
  if (!oldM || !newM) return null;
  const d = newM.gzip - oldM.gzip;
  const pct = oldM.gzip ? (d / oldM.gzip) * 100 : 0;
  const verdict = d < 0 ? 'smaller' : d > 0 ? 'larger' : 'same';
  return { oldGzip: oldM.gzip, newGzip: newM.gzip, deltaBytes: d, deltaPct: pct, verdict, line: `${fmt(oldM.gzip)} gzip → ${fmt(newM.gzip)} gzip (${d >= 0 ? '+' : ''}${pct.toFixed(1)}%, ${verdict})` };
}
