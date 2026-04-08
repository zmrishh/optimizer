import fs from 'fs/promises';
import path from 'path';
import semver from 'semver';

/**
 * Super fast directory size calculator.
 * Silently fails and returns 0 if directory doesn't exist or there's a permission error.
 */
async function getDirectorySize(dirPath) {
  let size = 0;
  try {
    const files = await fs.readdir(dirPath, { withFileTypes: true });
    for (const file of files) {
      const fullPath = path.join(dirPath, file.name);
      if (file.isDirectory()) {
        size += await getDirectorySize(fullPath);
      } else {
        const stats = await fs.stat(fullPath);
        size += stats.size;
      }
    }
  } catch (error) {
    // Ignore errors (e.g., ENOENT if not installed)
    return 0;
  }
  return size;
}

/**
 * Analyzes the parsed packages map and returns a list of duplicated packages.
 * @param {Map<string, { instances: string[], versions: Set<string> }>} packagesMap 
 * @param {string} projectDir 
 * @returns {Promise<Array>} List of duplicates, sorted by severity/instances
 */
export async function detectDuplicates(packagesMap, projectDir) {
  const duplicates = [];

  for (const [name, data] of packagesMap.entries()) {
    if (data.versions.size > 1) {
      let totalWastedBytes = 0;
      let approxSize = false;

      // Group instances by version
      const instancesByVersion = new Map();
      for (const instance of data.instances) {
        if (!instancesByVersion.has(instance.version)) {
          instancesByVersion.set(instance.version, []);
        }
        instancesByVersion.get(instance.version).push(instance);
      }

      // Evaluate safety using semver
      const validVersions = Array.from(data.versions).filter(v => semver.valid(semver.coerce(v)));
      const coercedVersions = validVersions.map(v => semver.coerce(v));
      const majors = new Set(coercedVersions.map(v => v.major));
      
      const safety = majors.size === 1 ? 'SAFE' : 'RISKY';
      let suggestedVersion = null;

      // Calculate instances counts
      const counts = Array.from(instancesByVersion.entries()).map(([v, instances]) => ({
        version: v,
        count: instances.length
      })).sort((a, b) => b.count - a.count);

      const mostFrequent = counts[0];

      if (safety === 'SAFE') {
        const sortedOriginals = [...validVersions].sort((a, b) => {
          return semver.rcompare(semver.coerce(a), semver.coerce(b));
        });
        
        // Popularity heuristic: if one version is overwhelmingly popular (>= 80% usage), prefer it
        if (mostFrequent && mostFrequent.count >= data.instances.length * 0.8) {
          suggestedVersion = mostFrequent.version;
        } else {
          // Otherwise, highest version
          suggestedVersion = sortedOriginals[0];
        }
      } else {
         // RISKY: optionally suggest highest version as a direction, but we keep it null to avoid auto-fix
         suggestedVersion = null;
      }

      const duplicateVersionsInfo = [];

      // Calculate sizes for non-canonical versions (wasted sizes)
      for (const [version, instances] of instancesByVersion.entries()) {
        let versionBytes = 0;
        const allParents = new Set();
        const allAncestors = new Set();
        const allRoots = new Set();
        
        // Calculate size on disk if available (only for this version's instances)
        for (const inst of instances) {
            const absolutePath = path.join(projectDir, inst.path);
            const size = await getDirectorySize(absolutePath);
            versionBytes += size;
            
            if (inst.parents) inst.parents.forEach(p => allParents.add(p));
            if (inst.allParents) inst.allParents.forEach(a => allAncestors.add(a));
            if (inst.roots) inst.roots.forEach(r => allRoots.add(r));
        }

        duplicateVersionsInfo.push({
            version,
            count: instances.length,
            instances,
            parents: Array.from(allParents),
            ancestors: Array.from(allAncestors),
            roots: Array.from(allRoots),
            sizeBytes: versionBytes
        });

        // Any version that isn't the primary selected version is considered "waste" (optimistic assumption)
        if (safety === 'SAFE' && version !== suggestedVersion) {
            totalWastedBytes += versionBytes;
        } else if (safety === 'RISKY' && version !== mostFrequent.version) {
            totalWastedBytes += versionBytes;
        }
      }

      duplicates.push({
        name,
        versions: Array.from(data.versions),
        totalInstances: data.instances.length,
        wastedBytes: totalWastedBytes,
        suggestedVersion,
        safety,
        details: duplicateVersionsInfo.sort((a, b) => b.count - a.count)
      });
    }
  }

  // Sort by wasted bytes (if available) then by total instances
  duplicates.sort((a, b) => {
    if (b.wastedBytes !== a.wastedBytes) {
      return b.wastedBytes - a.wastedBytes;
    }
    return b.totalInstances - a.totalInstances;
  });

  return duplicates;
}
