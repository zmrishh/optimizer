import { isLocalVersion } from '../utils/workspace.js';

export function buildDependencyGraph(rawPackagesMap) {
  // In the future, this can stitch together full traversal trees.
  // For duplicate bloat detection, we just need to ensure the raw map is clean
  // of local/workspace internal packages, which we filter out here.
  
  const cleanMap = new Map();

  for (const [name, data] of rawPackagesMap.entries()) {
    const validVersions = new Set();
    const validInstances = [];

    for (const instance of data.instances) {
      if (!isLocalVersion(instance.version)) {
        validVersions.add(instance.version);
        validInstances.push(instance);
      }
    }

    if (validVersions.size > 0) {
      cleanMap.set(name, {
        versions: validVersions,
        instances: validInstances
      });
    }
  }

  return cleanMap;
}
