// Packages that are well-known low-level utilities — never actionable as root causes
const LEAF_BLACKLIST = new Set([
  // Terminal styling
  'chalk', 'ansi-styles', 'ansi-regex', 'strip-ansi', 'wrap-ansi', 'string-width',
  'color-convert', 'color-name', 'supports-color', 'has-flag', 'kleur', 'picocolors',
  // Character / string utilities
  'is-fullwidth-code-point', 'emoji-regex', 'escape-string-regexp', 'string-length',
  'widest-line', 'wrap-ansi-cjs',
  // Core Node.js polyfills / util
  'inherits', 'safe-buffer', 'once', 'wrappy', 'inflight', 'ee-first', 'depd',
  'ms', 'debug', 'signal-exit',
  // Glob / file matching
  'minimatch', 'glob', 'brace-expansion', 'balanced-match', 'concat-map',
  'path-is-absolute', 'path-type', 'picomatch', 'micromatch', 'fast-glob',
  'glob-parent', 'is-glob', 'is-extglob', 'fill-range', 'to-regex-range',
  // Version / semver
  'semver', 'semver-compare', 'compare-versions',
  // MIME
  'mime', 'mime-types', 'mime-db',
  // Collection / iteration utilities
  'lru-cache', 'yallist', 'minipass',
  // Argument parsing
  'camelcase', 'decamelize', 'minimist', 'yargs-parser',
  // Config / rc
  'ini', 'js-ini', 'strip-json-comments',
  // Process
  'cross-spawn', 'execa', 'which', 'shebang-command', 'shebang-regex', 'isexe',
  // Misc
  'p-limit', 'p-locate', 'locate-path', 'path-exists', 'yocto-queue',
  'queue-microtask', 'run-parallel', 'reusify', 'fastq',
]);

// Regex-based matcher for families not enumerated above
function isLeafPackage(name) {
  if (LEAF_BLACKLIST.has(name)) return true;
  if (/^(ansi|color|strip|wrap|supports|is-|has-|get-|set-)/.test(name)) return true;
  if (/(-regex|-styles|-utils|-compat|-ify|-cjs)$/.test(name)) return true;
  return false;
}

// Same predicate exported for the formatter
export function isLowLevelPackage(name) {
  if (!name || name.startsWith('⚠️')) return true;
  const bare = name.startsWith('@') ? name.split('/').slice(1).join('/') : name;
  if (isLeafPackage(bare)) return true;
  return /(ansi|regex|string|width|wrap|strip|minimatch|semver|color|glob)/i.test(bare);
}

/**
 * Extract the bare package name from a "name@version" string.
 * Handles scoped packages like "@babel/core@7.0.0" correctly.
 */
function pkgName(nameAtVersion) {
  if (!nameAtVersion) return '';
  if (nameAtVersion.startsWith('@')) {
    const second = nameAtVersion.indexOf('@', 1);
    return second > 0 ? nameAtVersion.substring(0, second) : nameAtVersion;
  }
  const at = nameAtVersion.indexOf('@');
  return at > 0 ? nameAtVersion.substring(0, at) : nameAtVersion;
}

/**
 * SOURCE PRIORITY — The single source of truth for which packages to
 * attribute a duplicate to.
 *
 * Priority (highest → lowest):
 *   1. roots[]   — pre-computed top-level introducers (pnpm ownership DFS
 *                  or npm graph traversal root nodes). Always the preferred
 *                  attribution because they represent INTENTIONAL dependencies.
 *   2. parents[] — immediate dependents. Closer to the signal than the full
 *                  ancestor chain, and avoids "ancestor soup" dilution.
 *   3. ancestors — full flattened chain. Last resort; very noisy because it
 *                  includes every transitive dependency, making low-level
 *                  packages appear highly frequent.
 *
 * NEVER use ancestors first — on large graphs (Next.js) the ancestor list
 * is hundreds of entries long and low-level packages like `semver` appear
 * in almost every chain, making them look like root causes.
 */
function getSources(detail) {
  if (detail.roots && detail.roots.length > 0) return detail.roots;
  if (detail.parents && detail.parents.length > 0) return detail.parents;
  // Canonical ancestors field (detector maps inst.allParents → ancestors)
  const anc = detail.ancestors || detail.allParents || [];
  return anc;
}

function computeFixLikelihood(safeties) {
  const safeCount = safeties.filter(s => s === 'SAFE').length;
  const totalCount = safeties.length;
  if (totalCount === 0) return 'LOW';
  if (safeCount === totalCount) return 'HIGH';
  if (safeCount / totalCount >= 0.5) return 'MEDIUM';
  return 'LOW';
}

/**
 * Build an introducer attribution map.
 * filterFn(pkgName) → true means this name is an acceptable introducer.
 * Each duplicate is counted once per introducer (deduped via seenForDup).
 */
function buildIntroducerMap(scoredDuplicates, filterFn) {
  const introducerMap = {};

  for (const dup of scoredDuplicates) {
    const seenForDup = new Set();

    for (const detail of dup.details) {
      const sources = getSources(detail);

      for (const p of sources) {
        const name = pkgName(p);
        if (!name || !filterFn(name)) continue;
        if (seenForDup.has(name)) continue;
        seenForDup.add(name);

        if (!introducerMap[name]) {
          introducerMap[name] = { name, affectedPackages: [], count: 0, safeties: [] };
        }
        introducerMap[name].count += dup.totalInstances;
        if (!introducerMap[name].affectedPackages.includes(dup.name)) {
          introducerMap[name].affectedPackages.push(dup.name);
        }
        introducerMap[name].safeties.push(dup.safety);
      }
    }
  }

  return introducerMap;
}

function formatGroups(map, limit = 8) {
  const groups = Object.values(map);

  // Degradation guard: if every group has only 1 affected package, warn
  if (groups.length > 0 && groups.every(g => g.affectedPackages.length <= 1)) {
    // This is a signal that grouping landed at leaf level
    process.stderr.write('⚠️  dep-optimizer: grouping degraded — each root cause maps to only 1 package. ' +
      'Run --verbose to inspect.\n');
  }

  return groups
    .sort((a, b) =>
      b.affectedPackages.length - a.affectedPackages.length ||
      b.count - a.count
    )
    .slice(0, limit)
    .map(g => ({
      name: g.name,
      affectedPackages: g.affectedPackages,
      count: g.count,
      fixLikelihood: computeFixLikelihood(g.safeties)
    }));
}

/**
 * Build a coverage map: pkgName → Set<dupName>
 * Tells us how many distinct duplicate packages each candidate name covers.
 * Uses getSources() priority so roots are always preferred over ancestors.
 */
function buildCoverageMap(scoredDuplicates) {
  const coverageMap = {};

  for (const dup of scoredDuplicates) {
    const seenNames = new Set();

    for (const detail of dup.details) {
      const sources = getSources(detail);

      for (const p of sources) {
        const name = pkgName(p);
        if (!name) continue;
        if (seenNames.has(name)) continue;

        seenNames.add(name);

        // soft penalty for low-level packages instead of removing them
        const penalty = isLeafPackage(name) ? 0.3 : 1.0;

        if (!coverageMap[name]) {
          coverageMap[name] = {
            dups: new Set(),
            weight: 0
          };
        }

        coverageMap[name].dups.add(dup.name);
        coverageMap[name].weight += penalty;
      }
    }
  }

  return coverageMap;
}

export function groupRootCauses(scoredDuplicates, topLevelDeps = new Set()) {
  // ── LAYER 1: Explicit top-level matching (pnpm importers) ──────────────────
  // When topLevelDeps is provided, only names from that set qualify.
  // getSources() ensures we read roots[] first, so pnpm ownership DFS results
  // are used directly without going through the noisy ancestor chain.
  if (topLevelDeps && topLevelDeps.size > 0) {
    const map = buildIntroducerMap(scoredDuplicates, name => topLevelDeps.has(name));
    if (Object.keys(map).length > 0) {
      return formatGroups(map);
    }
  }

  // ── LAYER 2: Coverage-based grouping (npm / yarn / pnpm without importers) ─
  // Build coverageMap using getSources() priority (roots > parents > ancestors).
  // Candidates with highest coverage (most distinct dups) win.
  const coverageMap = buildCoverageMap(scoredDuplicates);

  const candidates = Object.entries(coverageMap)
    .sort((a, b) =>
      b[1].weight - a[1].weight ||
      b[1].dups.size - a[1].dups.size
    );

  // Try strict threshold first (≥2 dups covered)
  const strict = candidates.filter(([, data]) => data.dups.size >= 2);
  if (strict.length > 0) {
    const topNames = new Set(strict.slice(0, 10).map(([n]) => n));
    const map = buildIntroducerMap(scoredDuplicates, name => topNames.has(name));
    if (Object.keys(map).length > 0) return formatGroups(map);
  }

  // Drop to threshold=1 if nothing met ≥2
  if (candidates.length > 0) {
    const topNames = new Set(candidates.slice(0, 10).map(([n]) => n));
    const map = buildIntroducerMap(scoredDuplicates, name => topNames.has(name));
    if (Object.keys(map).length > 0) return formatGroups(map);
  }

  if (candidates.length === 0) {
    console.warn("⚠️ No candidates found — graph signal missing");
  }
  // ── LAYER 3: Misc fallback (truly no graph data) ────────────────────────────
  const MISC = '⚠️ Misc / Low-level dependencies';
  return [{
    name: MISC,
    affectedPackages: scoredDuplicates.map(d => d.name),
    count: scoredDuplicates.reduce((s, d) => s + d.totalInstances, 0),
    fixLikelihood: 'LOW'
  }];
}
