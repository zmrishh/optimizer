/**
 * Debug script — run from a pnpm project root:
 *   node <path-to-dep-optimizer>/debug-pnpm.mjs
 *
 * Prints what parsePnpmLockfile sees so we can diagnose ownership failures.
 */
import fs from 'fs/promises';
import path from 'path';
import yaml from 'js-yaml';

const lockfilePath = path.join(process.cwd(), 'pnpm-lock.yaml');
const raw = await fs.readFile(lockfilePath, 'utf-8');
const parsed = yaml.load(raw);

console.log('=== pnpm lockfile version:', parsed.lockfileVersion);
console.log('=== importers keys:', Object.keys(parsed.importers || {}));

const importer = parsed.importers?.['.'] || parsed.importers?.[''] || {};
console.log('=== importer dep count:', Object.keys(importer.dependencies || {}).length);
console.log('=== importer devDep count:', Object.keys(importer.devDependencies || {}).length);

// Sample first 5 deps
const allDeps = { ...(importer.dependencies || {}), ...(importer.devDependencies || {}) };
const depEntries = Object.entries(allDeps).slice(0, 5);
console.log('\n=== Sample importer deps:');
for (const [name, spec] of depEntries) {
  console.log(' ', name, '→', JSON.stringify(spec));
}

// Sample packages section
const pkgKeys = Object.keys(parsed.packages || {}).slice(0, 5);
console.log('\n=== Sample package keys:');
pkgKeys.forEach(k => console.log(' ', k));

// Check deps inside a package
if (pkgKeys.length > 0) {
  const sample = parsed.packages[pkgKeys[0]];
  console.log('\n=== Sample package entry:');
  console.log(JSON.stringify(sample, null, 2).slice(0, 300));
}

// Count packages where ownership would be found
console.log('\n=== Total packages:', Object.keys(parsed.packages || {}).length);
