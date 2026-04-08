import fs from 'fs/promises';
import path from 'path';
import { addToPackagesMap } from './index.js';
import { buildGraphTraversal, getTopLevelSet } from './graph.js';

export async function parseNpmLockfile(projectDir) {
  const lockfilePath = path.join(projectDir, 'package-lock.json');
  const lockfileContent = await fs.readFile(lockfilePath, 'utf-8');
  const lockfile = JSON.parse(lockfileContent);
  const packagesMap = new Map();

  const reverseMap = new Map();

  if (lockfile.packages) {
    // Map paths securely to extract resolution models securely
    const pathMap = new Map();
    for (const [pkgPath, pkgData] of Object.entries(lockfile.packages)) {
      if (pkgPath === '' || pkgData.link) continue;
      const parts = pkgPath.split('node_modules/');
      const name = parts[parts.length - 1];
      pathMap.set(pkgPath, `${name}@${pkgData.version}`);
    }

    const resolveDependencyPath = (callerPath, depName) => {
      let currentPath = callerPath;
      while (currentPath !== '') {
         const probe = `${currentPath}/node_modules/${depName}`;
         if (pathMap.has(probe)) return pathMap.get(probe);
         const lastIndex = currentPath.lastIndexOf('/node_modules/');
         if (lastIndex === -1) {
             currentPath = '';
         } else {
             currentPath = currentPath.substring(0, lastIndex);
         }
      }
      const rootProbe = `node_modules/${depName}`;
      if (pathMap.has(rootProbe)) return pathMap.get(rootProbe);
      return null;
    };

    for (const [pkgPath, pkgData] of Object.entries(lockfile.packages)) {
      if (pkgPath === '' || pkgData.link) continue;
      const callerId = pathMap.get(pkgPath);
      
      const requires = pkgData.dependencies || {};
      for (const [depName] of Object.entries(requires)) {
         const resolvedDepId = resolveDependencyPath(pkgPath, depName);
         if (resolvedDepId) {
             if (!reverseMap.has(resolvedDepId)) reverseMap.set(resolvedDepId, new Set());
             reverseMap.get(resolvedDepId).add(callerId);
         }
      }
    }

    const topLevelSet = await getTopLevelSet(projectDir, fs, path);
    const graph = buildGraphTraversal(reverseMap, topLevelSet);

    for (const [pkgPath, pkgData] of Object.entries(lockfile.packages)) {
      if (pkgPath === '' || pkgData.link) continue;
      
      const parts = pkgPath.split('node_modules/');
      const name = parts[parts.length - 1];
      
      const selfId = `${name}@${pkgData.version}`;
      const graphData = graph.traverse(selfId);
      
      addToPackagesMap(packagesMap, name, pkgData.version, pkgPath, graphData);
    }

  } else if (lockfile.dependencies) {
    // Fallback for extremely old v1 lockfiles without packages block
    // V1 resolution mirrors V2 closely but operates through nested arrays natively.
    const pathMap = new Map();
    
    const indexDependencies = (deps, basePath = '') => {
      for (const [name, data] of Object.entries(deps)) {
         const currentPath = basePath ? `${basePath}/node_modules/${name}` : `node_modules/${name}`;
         pathMap.set(currentPath, `${name}@${data.version}`);
         if (data.dependencies) {
            indexDependencies(data.dependencies, currentPath);
         }
      }
    };
    indexDependencies(lockfile.dependencies);

    const resolveDependencyPathV1 = (callerPath, depName) => {
      let currentPath = callerPath;
      while (currentPath !== '') {
         const probe = `${currentPath}/node_modules/${depName}`;
         if (pathMap.has(probe)) return pathMap.get(probe);
         const lastIndex = currentPath.lastIndexOf('/node_modules/');
         if (lastIndex === -1) {
             currentPath = '';
         } else {
             currentPath = currentPath.substring(0, lastIndex);
         }
      }
      const rootProbe = `node_modules/${depName}`;
      if (pathMap.has(rootProbe)) return pathMap.get(rootProbe);
      return null;
    };

    const linkDependencies = (deps, basePath = '') => {
      for (const [name, data] of Object.entries(deps)) {
         const currentPath = basePath ? `${basePath}/node_modules/${name}` : `node_modules/${name}`;
         const callerId = pathMap.get(currentPath);
         
         const requires = data.requires || {};
         for (const [depName] of Object.entries(requires)) {
            const resolvedDepId = resolveDependencyPathV1(currentPath, depName);
            if (resolvedDepId) {
                if (!reverseMap.has(resolvedDepId)) reverseMap.set(resolvedDepId, new Set());
                reverseMap.get(resolvedDepId).add(callerId);
            }
         }

         if (data.dependencies) {
            linkDependencies(data.dependencies, currentPath);
         }
      }
    };
    linkDependencies(lockfile.dependencies);

    const topLevelSet = await getTopLevelSet(projectDir, fs, path);
    const graph = buildGraphTraversal(reverseMap, topLevelSet);

    const processDependencies = (deps, basePath = '') => {
      for (const [name, data] of Object.entries(deps)) {
         const currentPath = basePath ? `${basePath}/node_modules/${name}` : `node_modules/${name}`;
         const selfId = `${name}@${data.version}`;
         const graphData = graph.traverse(selfId);
         
         addToPackagesMap(packagesMap, name, data.version, currentPath, graphData);
         if (data.dependencies) {
            processDependencies(data.dependencies, currentPath);
         }
      }
    };
    processDependencies(lockfile.dependencies);
  }

  return packagesMap;
}
