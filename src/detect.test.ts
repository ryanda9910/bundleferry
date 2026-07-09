import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { detect } from './detect.js';
import type { PackageJson } from './types.js';

function fixture(pkg: PackageJson, files: Record<string, string> = {}): string {
  const d = fs.mkdtempSync(path.join(os.tmpdir(), 'bftest-'));
  fs.writeFileSync(path.join(d, 'package.json'), JSON.stringify(pkg));
  for (const [f, c] of Object.entries(files)) {
    const full = path.join(d, f);
    fs.mkdirSync(path.dirname(full), { recursive: true });
    fs.writeFileSync(full, c);
  }
  return d;
}

test('detects each bundler from its strongest signal', () => {
  assert.equal(detect(fixture({ devDependencies: { webpack: '5' }, scripts: { build: 'webpack' } })).bundler, 'webpack');
  assert.equal(detect(fixture({ dependencies: { 'react-scripts': '5' }, scripts: { build: 'react-scripts build' } })).bundler, 'cra');
  assert.equal(detect(fixture({ devDependencies: { '@craco/craco': '7' }, scripts: { build: 'craco build' } })).bundler, 'craco');
  assert.equal(detect(fixture({ devDependencies: { rollup: '4' }, scripts: { build: 'rollup -c' } })).bundler, 'rollup');
  assert.equal(detect(fixture({ dependencies: { parcel: '2' }, scripts: { build: 'parcel build index.html' } })).bundler, 'parcel');
  assert.equal(detect(fixture({ devDependencies: { vite: '5' }, scripts: { build: 'vite build' } }, { 'vite.config.js': 'export default {}' })).bundler, 'vite');
  assert.equal(detect(fixture({ devDependencies: { '@rspack/core': '1' }, scripts: { build: 'rspack build' } }, { 'rspack.config.js': '' })).bundler, 'rspack');
  assert.equal(detect(fixture({ devDependencies: { snowpack: '3' }, scripts: { build: 'snowpack build' } })).bundler, 'snowpack');
  assert.equal(detect(fixture({ scripts: { build: 'bun build ./x --outdir ./dist' } })).bundler, 'bun');
  assert.equal(detect(fixture({ dependencies: { 'react-native': '0.74' }, scripts: { start: 'react-native start' } })).bundler, 'metro');
});

test('craco outranks cra (precedence)', () => {
  const d = fixture({ dependencies: { 'react-scripts': '5', '@craco/craco': '7' }, scripts: { build: 'craco build' } });
  assert.equal(detect(d).bundler, 'craco');
});

test('esbuild detected via an indirect `node build.js` that imports it', () => {
  const d = fixture({ devDependencies: { esbuild: '0.20' }, scripts: { build: 'node build.js' } }, { 'build.js': 'const esbuild = require("esbuild"); esbuild.build({})' });
  assert.equal(detect(d).bundler, 'esbuild');
});

test('a plain `node build.js` with NO esbuild dep is NOT esbuild (no false positive)', () => {
  const d = fixture({ scripts: { build: 'node build.js' } }, { 'build.js': 'console.log(1)' });
  assert.equal(detect(d).bundler, null);
});

test('React Native / Expo flagged as non-web (route-tier render mode)', () => {
  const rn = detect(fixture({ dependencies: { 'react-native': '0.74' }, scripts: { start: 'react-native start' } }));
  assert.equal(rn.render.mode, 'ssr');
  const expo = detect(fixture({ dependencies: { expo: '51' }, scripts: {} }));
  assert.equal(expo.render.mode, 'ssr');
});

test('Next.js is SSR; a plain webpack SPA is CSR', () => {
  assert.equal(detect(fixture({ dependencies: { next: '15' }, scripts: { build: 'next build' } })).render.mode, 'ssr');
  assert.equal(detect(fixture({ devDependencies: { webpack: '5' }, scripts: { build: 'webpack' } })).render.mode, 'csr');
});

test('TypeScript posture: tsconfig + .tsx + path aliases', () => {
  const d = fixture(
    { devDependencies: { typescript: '5', vite: '5' }, scripts: { build: 'vite build' } },
    { 'tsconfig.json': JSON.stringify({ compilerOptions: { paths: { '@/*': ['src/*'] } } }), 'vite.config.js': '', 'src/app.tsx': 'export {}' },
  );
  const ts = detect(d).typescript;
  assert.equal(ts.isTypeScript, true);
  assert.equal(ts.hasTsConfig, true);
  assert.equal(ts.hasPathAliases, true);
  assert.ok(ts.tsxCount >= 1);
});

test('plain JS project reports not-TypeScript', () => {
  const d = fixture({ devDependencies: { webpack: '5' }, scripts: { build: 'webpack' } }, { 'src/app.js': 'module.exports = {}' });
  assert.equal(detect(d).typescript.isTypeScript, false);
});
