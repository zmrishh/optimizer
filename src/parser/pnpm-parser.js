import fs from 'fs/promises';
import path from 'path';
import yaml from 'js-yaml';
import { addToPackagesMap } from './index.js';

// ── Key normalization ────────────────────────────────────────────────────────

/** Strip leading "/" from lockfile keys (pnpm v5/v6 format) */
function normalizePkgKey(key) {
  return key.replace(/^\//, '');
}

/** Strip parenthesised peer suffix: "1.2.3(react@18)" → "1.2.3" */
function cleanVersion(version) {
  return String(version).split('(')[0].trim();
}

/**
 * Extract a bare package name from a "name@version" key.
 * Handles scoped packages: "@babel/core@7.0.0" → "@babel/core"
 */
function pkgNameOf(key) {
  if (!key) return '';
  if (key.startsWith('@')) {
    const second = key.indexOf('@', 1);
    return second > 0 ? key.substring(0, second) : key;
  }
  const at = key.indexOf('@');
  return at > 0 ? key.substring(0, at) : key;
}

// ── Importer extraction (handles v5 / v6 / v7 / v9 formats) ─────────────────

/**
 * Return the root importer object from parsed lockfile.
 * pnpm v5: importers['.']  (or absent — everything is packages only)
 * pnpm v6+: importers['.'] with { dependencies: { name: { specifier, version } } }
 * pnpm v9: same but lockfileVersion is "9.0"
 */
function getRootImporter(parsed) {
  if (!parsed.importers) return {};
  // Try '.', then '' (empty string), then first key
  return parsed.importers['.']
    || parsed.importers['']
    || Object.values(parsed.importers)[0]
    || {};
}

/**
 * Extract a bare version string from a dependency spec.
 * Handles both string specs ("1.2.3") and object specs ({ specifier, version }).
 */
function extractVersion(spec) {
  if (!spec) return null;
  if (typeof spec === 'string') return cleanVersion(spec);
  if (typeof spec === 'object') {
    if (spec.version) return cleanVersion(spec.version);
  }
  return null;
}

/**
 * Get all top-level dep names from the importer.
 * Returns bare package names like ["next", "eslint", "@babel/core"].
 */
function getTopLevelDepNames(importer) {
  const deps = {
    ...(importer.dependencies || {}),
    ...(importer.devDependencies || {}),
    ...(importer.optionalDependencies || {}),
  };
  return new Set(Object.keys(deps));
}

// ── Package entry iteration ──────────────────────────────────────────────────

/**
 * Build the forward dependency graph and reverse graph from the packages block.
 * Returns { forwardGraph, reverseGraph, allPkgKeys }
 *
 * Handles two package block formats:
 *   pnpm v5/v6: { "/pkg@1.0.0": { dependencies: { dep: "version" } } }
 *   pnpm v9:    { "pkg@1.0.0":  { dependencies: { dep: "version" } } }
 */
function buildGraphs(parsed) {
  const forwardGraph = {};
  const reverseGraph = {};
  const packages = parsed.packages || {};

  // pnpm v9 "snapshots" block takes precedence if present; otherwise use packages
  const pkgBlock = parsed.snapshots || packages;

  for (const rawKey of Object.keys(pkgBlock)) {
    const pkgKey = normalizePkgKey(rawKey);
    if (!forwardGraph[pkgKey]) forwardGraph[pkgKey] = [];
    if (!reverseGraph[pkgKey]) reverseGraph[pkgKey] = [];

    // Get deps from both snapshots and packages (pnpm v9 split them)
    const pkgEntry = pkgBlock[rawKey] || {};
    const pkgMeta  = packages[rawKey] || packages['/' + rawKey] || {};
    const deps = { ...(pkgMeta.dependencies || {}), ...(pkgEntry.dependencies || {}) };

    for (const [depName, depSpec] of Object.entries(deps)) {
      const ver = extractVersion(depSpec);
      if (!ver || String(depSpec).startsWith('link:')) continue;

      const depKey = `${depName}@${ver}`;
      forwardGraph[pkgKey].push(depKey);
      if (!reverseGraph[depKey]) reverseGraph[depKey] = [];
      reverseGraph[depKey].push(pkgKey);
    }
  }

  return { forwardGraph, reverseGraph };
}

// ── Top-down ownership DFS ───────────────────────────────────────────────────

/**
 * For each top-level dep, DFS through forwardGraph to find every package
 * it introduces. Returns Map<pkgKey, Set<topLevelDepName>>.
 *
 * Start keys are found by:
 *   1. Matching pkgKey name against topLevelDeps set
 *   2. Seeding from importer version specs (for exact key format)
 */
function buildOwnershipMap(parsed, forwardGraph, topLevelDeps, importer) {
  // Step A — find versioned start keys for each top-level dep
  const topLevelVersioned = new Map(); // depName → Set<pkgKey>

  // Seed from package keys
  const pkgBlock = parsed.snapshots || parsed.packages || {};
  for (const rawKey of Object.keys(pkgBlock)) {
    const pkgKey = normalizePkgKey(rawKey);
    const name   = pkgNameOf(pkgKey);
    if (topLevelDeps.has(name)) {
      if (!topLevelVersioned.has(name)) topLevelVersioned.set(name, new Set());
      topLevelVersioned.get(name).add(pkgKey);
    }
  }

  // Seed from importer dep version specs (catches exact key variations)
  const allImporterDeps = {
    ...(importer.dependencies || {}),
    ...(importer.devDependencies || {}),
    ...(importer.optionalDependencies || {}),
  };
  for (const [depName, spec] of Object.entries(allImporterDeps)) {
    const ver = extractVersion(spec);
    if (ver) {
      const key = `${depName}@${ver}`;
      if (!topLevelVersioned.has(depName)) topLevelVersioned.set(depName, new Set());
      topLevelVersioned.get(depName).add(key);
      // Also try without peer suffix
      const cleanKey = `${depName}@${cleanVersion(ver)}`;
      topLevelVersioned.get(depName).add(cleanKey);
    }
  }

  // Step B — DFS from each start key
  const ownership = new Map(); // pkgKey → Set<topLevelDepName>

  for (const [depName, startKeys] of topLevelVersioned) {
    for (const startKey of startKeys) {
      const stack   = [startKey];
      const visited = new Set([startKey]);

      while (stack.length) {
        const node = stack.pop();
        if (!ownership.has(node)) ownership.set(node, new Set());
        ownership.get(node).add(depName);

        for (const child of (forwardGraph[node] || [])) {
          if (!visited.has(child)) {
            visited.add(child);
            stack.push(child);
          }
        }
      }
    }
  }

  return ownership;
}

// ── Main parser ──────────────────────────────────────────────────────────────

export async function parsePnpmLockfile(projectDir) {
  const lockfilePath = path.join(projectDir, 'pnpm-lock.yaml');
  const lockfileContent = await fs.readFile(lockfilePath, 'utf-8');
  const parsed = yaml.load(lockfileContent);
  const packagesMap = new Map();

  const packages = parsed.packages || {};
  if (Object.keys(packages).length === 0 && !parsed.snapshots) {
    return { packagesMap, topLevelDeps: new Set() };
  }

  // ── Importer & top-level dep extraction ──────────────────────────────────
  const importer    = getRootImporter(parsed);
  const topLevelDeps = getTopLevelDepNames(importer);

  // ── Graph construction ────────────────────────────────────────────────────
  const { forwardGraph, reverseGraph } = buildGraphs(parsed);

  // ── Ownership map (top-down DFS) ──────────────────────────────────────────
  const ownership = buildOwnershipMap(parsed, forwardGraph, topLevelDeps, importer);

  // ── Emit packages ─────────────────────────────────────────────────────────
  // Use packages block (not snapshots) as the canonical source of package identity
  for (const rawKey of Object.keys(packages)) {
    const pkgKey = normalizePkgKey(rawKey);
    const lastAt = pkgKey.lastIndexOf('@');
    if (lastAt <= 0) continue;

    const name            = pkgKey.substring(0, lastAt);
    const resolvedVersion = pkgKey.substring(lastAt + 1);
    const selfId          = `${name}@${resolvedVersion}`;

    // roots = bare top-level dep names that introduce this package
    const roots   = Array.from(ownership.get(selfId) || []);
    // parents = immediate dependents from reverse graph
    const parents = Array.from(new Set(reverseGraph[selfId] || []));

    addToPackagesMap(packagesMap, name, resolvedVersion, rawKey, {
      roots,
      parents,
      allParents: ancestors(reverseGraph, selfId), // full chain for grouper fallback
    });
  }

  return { packagesMap, topLevelDeps };
}

/**
 * Walk reverse graph upward to collect all ancestors (BFS, depth-limited).
 * Used as allParents so the grouper fallback layers have data if roots are empty.
 */
function ancestors(reverseGraph, startId, maxDepth = 8) {
  const result  = new Set();
  const queue   = [{ node: startId, depth: 0 }];
  const visited = new Set([startId]);

  while (queue.length) {
    const { node, depth } = queue.shift();
    if (depth >= maxDepth) continue;
    for (const parent of (reverseGraph[node] || [])) {
      if (!visited.has(parent)) {
        visited.add(parent);
        result.add(parent);
        queue.push({ node: parent, depth: depth + 1 });
      }
    }
  }

  return Array.from(result);
}
