import fs from 'fs/promises';
import path from 'path';
import yaml from 'js-yaml';
import lockfileParser from '@yarnpkg/lockfile';
import { addToPackagesMap } from './index.js';
import { buildGraphTraversal, getTopLevelSet } from './graph.js';

export async function parseYarnLockfile(projectDir) {
  const lockfilePath = path.join(projectDir, 'yarn.lock');
  const lockfileContent = await fs.readFile(lockfilePath, 'utf-8');

  const packagesMap = new Map();

  // Try to determine if it's Yarn v1 or v2+
  // Yarn v2+ lockfiles usually have "__metadata" block and standard YAML structure
  let parsed;
  if (lockfileContent.includes('__metadata')) {
    // It's likely Yarn v2+ (YAML)
    parsed = yaml.load(lockfileContent);
    // Remove metadata
    delete parsed.__metadata;
  } else {
    // Yarn v1
    const result = lockfileParser.parse(lockfileContent);
    if (result.type !== 'success') {
      throw new Error('Failed to parse yarn.lock');
    }
    parsed = result.object;
  }

  // Pass 1: Build exact version lookup map
  const exactVersions = new Map();
  for (const [key, pkgData] of Object.entries(parsed)) {
    const resolutions = key.split(',').map(s => s.trim());
    for (let res of resolutions) {
      if (res.includes('@npm:')) res = res.replace('@npm:', '@');
      if (res.includes('@workspace:')) res = res.replace('@workspace:', '@');
      exactVersions.set(res, pkgData.version);
    }
  }

  // Pass 2: Build specific name@version Reverse Graph Matrix
  const reverseMap = new Map();
  for (const [key, pkgData] of Object.entries(parsed)) {
    const resolutions = key.split(',').map(s => s.trim());
    let firstRes = resolutions[0];
    if (firstRes.includes('@npm:')) firstRes = firstRes.replace('@npm:', '@');
    if (firstRes.includes('@workspace:')) firstRes = firstRes.replace('@workspace:', '@');
    const lastAtIdx = firstRes.lastIndexOf('@');
    if (lastAtIdx <= 0) continue;
    
    const name = firstRes.substring(0, lastAtIdx);
    const callerId = `${name}@${pkgData.version}`;

    if (pkgData.dependencies) {
      for (const [depName, depReq] of Object.entries(pkgData.dependencies)) {
        const depKey = `${depName}@${depReq}`;
        const resolvedVersion = exactVersions.get(depKey);
        if (resolvedVersion) {
           const depId = `${depName}@${resolvedVersion}`;
           if (!reverseMap.has(depId)) reverseMap.set(depId, new Set());
           reverseMap.get(depId).add(callerId);
        }
      }
    }
  }

  // Pass 3: Evaluate unified recursive graph limits
  const topLevelSet = await getTopLevelSet(projectDir, fs, path);
  const graph = buildGraphTraversal(reverseMap, topLevelSet);

  for (const [key, pkgData] of Object.entries(parsed)) {
    // Extract the raw package name. 
    const resolutions = key.split(',').map(s => s.trim());
    let firstRes = resolutions[0];
    
    if (firstRes.includes('@npm:')) firstRes = firstRes.replace('@npm:', '@');
    if (firstRes.includes('@workspace:')) firstRes = firstRes.replace('@workspace:', '@');

    const lastAtIdx = firstRes.lastIndexOf('@');
    if (lastAtIdx <= 0) continue; // safety check
    
    const name = firstRes.substring(0, lastAtIdx);
    const selfId = `${name}@${pkgData.version}`;
    
    const graphData = graph.traverse(selfId);

    // In Yarn, packages are flattened into the lockfile. The "instance path" is abstract.
    addToPackagesMap(packagesMap, name, pkgData.version, key, graphData);
  }

  return packagesMap;
}
