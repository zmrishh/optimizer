export function buildGraphTraversal(reverseGraph, topLevelSet) {
  const cache = new Map();

  function traverse(pkgId) {
    if (cache.has(pkgId)) return cache.get(pkgId);
    
    const visited = new Set();
    const stack = [pkgId];
    const parents = [];
    const roots = [];
    const immediateParents = reverseGraph.get(pkgId) || [];

    while (stack.length > 0) {
      let current = stack.pop();
      const currParents = reverseGraph.get(current) || [];
      
      for (const parent of currParents) {
        if (!visited.has(parent)) {
          visited.add(parent);
          parents.push(parent);
          stack.push(parent);
          
          const lastAtIdx = parent.lastIndexOf('@');
          const nameOnly = lastAtIdx > 0 ? parent.substring(0, lastAtIdx) : parent;
          
          if (topLevelSet.has(nameOnly)) {
             roots.push(parent);
          }
        }
      }
    }
    
    // Sort and unique the arrays to ensure stability
    const result = {
      parents: Array.from(new Set(immediateParents)),
      allParents: Array.from(new Set(parents)),
      roots: Array.from(new Set(roots))
    };
    
    cache.set(pkgId, result);
    return result;
  }

  return { traverse };
}

export async function getTopLevelSet(projectDir, fs, path) {
  try {
    const pkgJsonPath = path.join(projectDir, 'package.json');
    const content = await fs.readFile(pkgJsonPath, 'utf-8');
    const pkg = JSON.parse(content);
    
    const topLevelSet = new Set();
    if (pkg.dependencies) {
      Object.keys(pkg.dependencies).forEach(d => topLevelSet.add(d));
    }
    if (pkg.devDependencies) {
      Object.keys(pkg.devDependencies).forEach(d => topLevelSet.add(d));
    }
    return topLevelSet;
  } catch (e) {
    return new Set();
  }
}
