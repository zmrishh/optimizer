import fs from 'fs/promises';
import path from 'path';
import { parseNpmLockfile } from './npm-parser.js';
import { parseYarnLockfile } from './yarn-parser.js';
import { parsePnpmLockfile } from './pnpm-parser.js';

export async function parseLockfile(projectDir) {
  // Detect lockfile
  const hasNpm = await fs.access(path.join(projectDir, 'package-lock.json')).then(() => true).catch(() => false);
  const hasYarn = await fs.access(path.join(projectDir, 'yarn.lock')).then(() => true).catch(() => false);
  const hasPnpm = await fs.access(path.join(projectDir, 'pnpm-lock.yaml')).then(() => true).catch(() => false);

  if (hasPnpm) {
    const { packagesMap, topLevelDeps } = await parsePnpmLockfile(projectDir);
    return { type: 'pnpm', map: packagesMap, topLevelDeps };
  } else if (hasYarn) {
    return { type: 'yarn', map: await parseYarnLockfile(projectDir) };
  } else if (hasNpm) {
    return { type: 'npm', map: await parseNpmLockfile(projectDir) };
  }

  throw new Error('No supported lockfile found (package-lock.json, yarn.lock, pnpm-lock.yaml). Please run install first.');
}

/**
 * Common graph insertion utility used by all parsers
 */
export function addToPackagesMap(packagesMap, name, version, instancePath, graphData = { parents: [], allParents: [], roots: [] }) {
  if (!name || instancePath === '') return;

  if (!packagesMap.has(name)) {
    packagesMap.set(name, {
      versions: new Set(),
      instances: []
    });
  }

  const entry = packagesMap.get(name);
  entry.versions.add(version);
  entry.instances.push({ 
    path: instancePath, 
    version, 
    parents: graphData.parents,
    allParents: graphData.allParents,
    roots: graphData.roots
  });
}
