import chalk from 'chalk';
import { isLowLevelPackage } from '../analyze/grouper.js';

// ── Helpers ───────────────────────────────────────────────────────────────────

function formatBytes(bytes) {
  if (!bytes || bytes === 0) return null;
  const kb = bytes / 1024;
  if (kb < 1024) return `~${Math.round(kb)} KB`;
  return `~${(kb / 1024).toFixed(2)} MB`;
}

function confidenceLabel(confidence) {
  switch (confidence) {
    case 'HIGH':   return chalk.green('HIGH') + chalk.dim(' — safe to upgrade');
    case 'MEDIUM': return chalk.yellow('MEDIUM') + chalk.dim(' — likely safe, verify first');
    default:       return chalk.red('LOW') + chalk.dim(' — manual review required');
  }
}

function smartMessage(groupName, fixLikelihood, isLowLevel = false, chainCount = 0) {
  // Strip version suffix (e.g. "@1.2.3") but preserve scoped names like "@mdx-js/loader"
  let pkg = groupName || '';
  if (pkg.startsWith('@')) {
    // scoped: drop everything after the second '@' (version tag), if any
    const versionAt = pkg.indexOf('@', 1);
    if (versionAt > 0) pkg = pkg.substring(0, versionAt);
  } else {
    // unscoped: drop everything from the first '@'
    pkg = pkg.replace(/@.*/, '');
  }
  pkg = pkg.trim();
  if (!pkg) pkg = 'this dependency';

  const chainImpact   = chainCount > 0
    ? `Upgrade ${pkg} → may resolve ${chainCount} duplicate chain${chainCount !== 1 ? 's' : ''}`
    : `Upgrade ${pkg} to latest and re-run to measure impact`;

  if (isLowLevel) {
    return [
      `Multiple versions are being pulled by different parts of your stack.`,
      `Find which top-level dep depends on ${pkg} and upgrade that instead.`,
      `Run: ${chalk.cyan(`npx depopsy trace ${pkg}`)} to see the full chain.`,
    ];
  }

  if (fixLikelihood === 'HIGH') {
    return [
      `Versions are compatible — safe to consolidate automatically.`,
      `${chainImpact}.`,
      `Run: ${chalk.cyan('npx depopsy fix')} to apply.`,
    ];
  }
  if (/^@babel/.test(pkg) || pkg === 'babel') {
    return [
      `Common in large projects with plugins and peer dependencies.`,
      `Align all @babel/* packages to the same major version.`,
      chainImpact + '.',
    ];
  }
  if (pkg === 'eslint' || /^eslint-/.test(pkg)) {
    return [
      `Multiple versions are being pulled by different parts of your stack.`,
      `Ensure all eslint-plugin-* packages target the same eslint major.`,
      chainImpact + '.',
    ];
  }
  if (pkg === 'webpack' || /webpack/.test(pkg)) {
    return [
      `Common in large projects with plugins and peer dependencies.`,
      `Check if any loaders haven\'t been updated to webpack 5.`,
      chainImpact + '.',
    ];
  }
  if (pkg === 'jest' || pkg === 'vitest') {
    return [
      `Test tooling often bundles its own utility versions.`,
      chainImpact + '.',
      `Run: ${chalk.cyan('npx depopsy fix')} to apply safe fixes.`,
    ];
  }
  if (pkg === 'next') {
    return [
      `Next.js bundles many internal dependencies with fixed versions.`,
      `Upgrading Next.js usually resolves most of these conflicts.`,
      chainImpact + '.',
    ];
  }
  if (pkg === 'react' || pkg === 'react-dom') {
    return [
      `React 16/17/18 are not interchangeable — ensure everything uses the same major.`,
      `Check all third-party component libraries for peer dep compatibility.`,
      chainImpact + '.',
    ];
  }
  return [
    `Common in large projects with plugins and peer dependencies.`,
    `Multiple versions are being pulled by different parts of your stack.`,
    chainImpact + '.',
  ];
}

// ── Text Report ───────────────────────────────────────────────────────────────

export function printTextReport(duplicates, rootCauses, options = {}) {
  const isVerbose = options.verbose === true;
  const isSimple  = options.simple === true;
  const topLimit  = isSimple ? 3 : (options.top || 5);

  const totalDuplicates = duplicates.length;
  const safeCounts      = duplicates.filter(d => d.safety === 'SAFE').length;
  const riskyCounts     = duplicates.filter(d => d.safety === 'RISKY').length;
  const totalWaste      = duplicates.reduce((acc, curr) => acc + curr.wastedBytes, 0);
  const wasteStr        = formatBytes(totalWaste);

  const MISC = '⚠️ Misc / Low-level dependencies';
  const HR = chalk.dim('─'.repeat(50));

  // ── Header ─────────────────────────────────────────────────────────────────
  console.log('');
  console.log(chalk.bold.white('📦 Dependency Health Report'));
  console.log(HR);

  if (totalDuplicates === 0) {
    console.log('');
    console.log(chalk.green('  ✅ Your dependency tree is perfectly clean.'));
    console.log(chalk.dim('     No duplicates found — great job!\n'));
    console.log(chalk.dim('💡 Tip: Run this in CI to catch regressions early.\n'));
    return;
  }

  // ── Problem Block ───────────────────────────────────────────────────────────
  console.log('');
  console.log(chalk.bold.red('🚨 Problem:'));
  console.log(`   You have ${chalk.bold.yellow(totalDuplicates)} duplicate dependencies`);
  if (wasteStr) {
    console.log(`   ${chalk.dim('→')} ${chalk.magenta(wasteStr)} wasted on disk`);
  }
  console.log(`   ${chalk.dim('→')} Slower installs, larger bundles, subtle runtime bugs`);

  // ── Root Causes ─────────────────────────────────────────────────────────────
  // Separate actionable from low-level
  const allRoots = rootCauses.filter(rc => rc.name !== MISC);
  const actionableRoots = allRoots.filter(rc => !isLowLevelPackage(rc.name));
  const lowLevelRoots   = allRoots.filter(rc => isLowLevelPackage(rc.name));

  // Decide what to display
  const hasActionable = actionableRoots.length > 0;
  const displayRoots  = hasActionable
    ? actionableRoots.slice(0, isVerbose ? actionableRoots.length : topLimit)
    : lowLevelRoots.slice(0, 3); // fallback: show top 3 with warning
  const showingLowLevelFallback = !hasActionable && displayRoots.length > 0;

  if (displayRoots.length > 0) {
    console.log('');
    if (showingLowLevelFallback) {
      console.log(chalk.bold.yellow('⚠️  Low-level dependencies') + chalk.dim(' (indirect causes)'));
      console.log(chalk.dim('   No high-level root causes found — showing closest available.'));
    } else {
      console.log(chalk.bold.white('🔥 Top Root Causes') + chalk.dim(' (you can act on)'));
      console.log(chalk.dim('   These are the packages pulling in most duplicate dependencies.'));
    }
    console.log('');

    displayRoots.forEach((group, i) => {
      const pkgCount = group.affectedPackages.length;
      // Guard: never display empty name
      const displayName = (group.name && group.name.trim()) ? group.name : 'unknown package';
      console.log(
        `  ${chalk.bold(`${i + 1}.`)} ${chalk.cyan.bold(displayName)}` +
        `  ${chalk.dim('→')} ${chalk.yellow(pkgCount)} duplicate package${pkgCount !== 1 ? 's' : ''}`
      );
    });

    // Global impact line
    const coveredCount = displayRoots.reduce((s, g) => s + g.count, 0);
    if (totalDuplicates > 0 && coveredCount > 0) {
      const pct = Math.round((coveredCount / (totalDuplicates * 2)) * 100);
      const cappedPct = Math.min(pct, 99);
      console.log('');
      console.log(chalk.dim(`   ➔ These top root causes account for ~${cappedPct}% of your duplication.`));
    }

    if (showingLowLevelFallback) {
      console.log('');
      console.log(chalk.dim('  ⚠️  These are low-level packages pulled in by higher-level libraries.'));
      console.log(chalk.dim('     Use --verbose or --trace <pkg> to find their true introducer.'));
    }
  }

  // ── Why it matters ──────────────────────────────────────────────────────────
  if (!isSimple) {
    console.log('');
    console.log(chalk.bold.white('🎯 Why this matters'));
    console.log(chalk.dim('  · Multiple versions of the same package increase bundle size'));
    console.log(chalk.dim('  · Slows npm install / pnpm install / CI pipelines'));
    console.log(chalk.dim('  · Can cause subtle runtime bugs when packages check instanceof'));
  }

  // ── Action blocks ───────────────────────────────────────────────────────────
  if (!isSimple && displayRoots.length > 0) {
    console.log('');
    console.log(chalk.bold.white('🧠 What you should do'));

    for (const group of displayRoots) {
      const lowLevel = isLowLevelPackage(group.name);
      // Guard: always use a defined, non-empty pkg name
      let pkg = (group.name || '').trim();
      if (!pkg || pkg === '') pkg = 'this dependency';
      const confidence = group.confidence || group.fixLikelihood || 'LOW';
      const msgs = smartMessage(group.name, group.fixLikelihood, lowLevel, group.count);
      console.log('');
      console.log(`  ${chalk.cyan.bold('▶ ' + pkg)}`);
      console.log(`  ${chalk.dim('Confidence:')} ${confidenceLabel(confidence)}`);
      const showPkgs = isVerbose
        ? group.affectedPackages
        : group.affectedPackages.slice(0, 4);
      const hidden = group.affectedPackages.length - showPkgs.length;
      console.log(`  ${chalk.dim('Introduces:')} ${showPkgs.join(', ')}${hidden > 0 ? chalk.dim(` (+${hidden} more)`) : ''}`);
      msgs.forEach(m => console.log(`  ${chalk.dim('→')} ${m}`));
    }
  }

  // ── Quick Fix ───────────────────────────────────────────────────────────────
  if (safeCounts > 0) {
    console.log('');
    console.log(chalk.bold.white('⚡ Quick Fix'));
    console.log(`   Run:  ${chalk.cyan.bold('npx depopsy fix')}`);
    console.log(chalk.dim(`   (applies ${safeCounts} SAFE fix${safeCounts !== 1 ? 'es' : ''} automatically — no breaking changes)`));
  }

  // ── Summary ─────────────────────────────────────────────────────────────────
  console.log('');
  console.log(chalk.bold.white('📊 Summary'));
  console.log(HR);
  console.log(`  ${chalk.green('✔')} SAFE issues:  ${chalk.green.bold(safeCounts)}  ${chalk.dim('(auto-fixable)')}`);
  console.log(`  ${chalk.red('✖')} RISKY issues: ${chalk.red.bold(riskyCounts)}  ${chalk.dim('(manual review)')}`);

  if (lowLevelRoots.length > 0 && isVerbose) {
    console.log('');
    console.log(chalk.dim(`  ℹ ${lowLevelRoots.length} low-level package group${lowLevelRoots.length !== 1 ? 's' : ''} hidden (utility libs)`));
    console.log(chalk.dim(`    Use --verbose to see them or --trace <pkg> to trace their origin.`));
  }

  const allHidden = actionableRoots.length - displayRoots.length;
  if (hasActionable && allHidden > 0) {
    console.log(chalk.dim(`\n  + ${allHidden} more root cause group${allHidden !== 1 ? 's' : ''} — run with ${chalk.white('--verbose')} to see all`));
  }

  // ── Developer Tip ───────────────────────────────────────────────────────────
  console.log('');
  console.log(HR);
  console.log(chalk.dim('💡 Tip: Even well-maintained projects have duplicates.'));
  console.log(chalk.dim('   This tool explains *why* — not just what.'));
  if (lowLevelRoots.length > 0 && !showingLowLevelFallback) {
    console.log(chalk.dim(`   Run: ${chalk.white('npx depopsy trace <pkg>')} to trace any package to its source.\n`));
  } else {
    console.log('');
  }
}

// ── JSON Report ───────────────────────────────────────────────────────────────

export function printJsonReport(duplicates, rootCauses) {
  const totalWaste = duplicates.reduce((acc, curr) => acc + curr.wastedBytes, 0);
  const MISC = '⚠️ Misc / Low-level dependencies';

  const jsonPayload = {
    summary: {
      total: duplicates.length,
      safe: duplicates.filter(d => d.safety === 'SAFE').length,
      risky: duplicates.filter(d => d.safety === 'RISKY').length,
      wasteKB: (totalWaste / 1024).toFixed(2)
    },
    rootCauses: rootCauses
      .filter(rc => rc.name !== MISC)
      .map(rc => ({
        name: rc.name,
        affectedPackages: rc.affectedPackages,
        count: rc.count,
        confidence: rc.fixLikelihood,
        lowLevel: isLowLevelPackage(rc.name)
      })),
    duplicates: duplicates.map(d => ({
      name: d.name,
      versions: d.versions,
      safety: d.safety,
      confidence: d.confidence,
      recommended: d.suggestedVersion,
      roots: [...new Set(d.details.flatMap(det => det.roots || []))].filter(Boolean)
    })),
    suggestions: duplicates
      .filter(d => d.safety === 'SAFE' && d.suggestedVersion)
      .map(d => ({ name: d.name, targetVersion: d.suggestedVersion }))
  };

  console.log(JSON.stringify(jsonPayload, null, 2));
}

// ── CI Report ─────────────────────────────────────────────────────────────────

export function printCiReport(duplicates) {
  console.log(JSON.stringify({
    status: duplicates.length > 0 ? 'fail' : 'success',
    total: duplicates.length,
    safe:  duplicates.filter(d => d.safety === 'SAFE').length,
    risky: duplicates.filter(d => d.safety === 'RISKY').length,
  }, null, 2));
}
