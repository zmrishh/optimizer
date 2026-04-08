import fs from 'fs/promises';
import path from 'path';
import yaml from 'js-yaml';

export async function detectWorkspaces(projectDir, pkg) {
  const workspaces = {
    packages: new Set(),
    isMonorepo: false,
  };

  // 1. Check package.json workspaces
  if (pkg && pkg.workspaces) {
    workspaces.isMonorepo = true;
    // workspaces can be an array or an object with 'packages' array
    const wp = Array.isArray(pkg.workspaces) ? pkg.workspaces : pkg.workspaces.packages;
    if (Array.isArray(wp)) {
      // Just flag that it's a monorepo. We could use fast-glob to find exact package names,
      // but for dependency bloat, external dependencies are the pain.
      // Easiest heuristic: we'll mark this.
    }
  }

  // 2. Check pnpm-workspace.yaml
  try {
    const pnpmWsPath = path.join(projectDir, 'pnpm-workspace.yaml');
    const pnpmWsObj = yaml.load(await fs.readFile(pnpmWsPath, 'utf8'));
    if (pnpmWsObj && pnpmWsObj.packages) {
      workspaces.isMonorepo = true;
    }
  } catch (e) {
    // Ignore if not present
  }

  // To truly find workspace package names requires globbing.
  // Instead, we will rely on lockfiles which natively mark links or workspace protocols:
  // pnpm: version starts with 'link:'
  // yarn: version starts with 'workspace:'
  // npm: has a 'link' boolean

  return workspaces;
}

export function isLocalVersion(versionInfo) {
  // Checks if a lockfile version string is a local reference
  if (!versionInfo) return false;
  return versionInfo.startsWith('link:') || 
         versionInfo.startsWith('workspace:') || 
         versionInfo.startsWith('file:') ||
         versionInfo === '0.0.0-use.local';
}
