import chalk from 'chalk';
import { isLowLevelPackage } from '../analyze/grouper.js';

// ── Helpers ───────────────────────────────────────────────────────────────────

function formatBytes(bytes) {
  if (!bytes || bytes === 0) return null;
  const kb = bytes / 1024;
  if (kb < 1024) return `~${Math.round(kb)} KB`;
  return `~${(kb / 1024).toFixed(2)} MB`;
}

function confidenceLabel(fixLikelihood) {
  switch (fixLikelihood) {
    case 'HIGH':   return chalk.green('HIGH — safe to auto-fix');
    case 'MEDIUM': return chalk.yellow('MEDIUM — likely safe, verify first');
    default:       return chalk.red('LOW — manual review needed');
  }
}

function smartMessage(groupName, fixLikelihood, isLowLevel = false) {
  if (isLowLevel) {
    return [
      `This is a low-level utility pulled in by a higher-level library.`,
      `Find which top-level dep depends on ${groupName} and upgrade that instead.`,
      `Run: ${chalk.cyan(`npx dep-optimizer trace ${groupName}`)} to see the full chain.`,
    ];
  }

  const name = groupName.replace(/@.*/, '');
  if (fixLikelihood === 'HIGH') {
    return [
      `Versions are compatible — safe to consolidate automatically.`,
      `Run: ${chalk.cyan('npx dep-optimizer fix')} to apply.`,
    ];
  }
  if (/^@babel/.test(name) || name === 'babel') {
    return [
      `Babel plugins often pin their own dependencies. Check peer versions.`,
      `Align all @babel/* packages to the same major version.`,
    ];
  }
  if (name === 'eslint' || /^eslint-/.test(name)) {
    return [
      `ESLint plugins commonly pull conflicting parser versions.`,
      `Ensure all eslint-plugin-* packages target the same eslint major.`,
    ];
  }
  if (name === 'webpack' || /webpack/.test(name)) {
    return [
      `Webpack v4/v5 loaders are often version-locked.`,
      `Check if any loaders haven\'t been updated to webpack 5.`,
    ];
  }
  if (name === 'jest' || name === 'vitest') {
    return [
      `Test tooling often bundles its own utility versions.`,
      `Upgrade ${name} to latest — most duplicates resolve automatically.`,
    ];
  }
  if (name === 'next') {
    return [
      `Next.js bundles many internal dependencies with fixed versions.`,
      `Upgrading Next.js usually resolves most of these conflicts.`,
    ];
  }
  if (name === 'react' || name === 'react-dom') {
    return [
      `React 16/17/18 are not interchangeable — ensure everything uses the same major.`,
      `Check all third-party component libraries for peer dep compatibility.`,
    ];
  }
  return [
    `Likely caused by version mismatches across plugins or peer dependencies.`,
    `Upgrade ${name} to latest and re-run to see which conflicts resolve.`,
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
      console.log(
        `  ${chalk.bold(`${i + 1}.`)} ${chalk.cyan.bold(group.name)}` +
        `  ${chalk.dim('→')} ${chalk.yellow(pkgCount)} duplicate package${pkgCount !== 1 ? 's' : ''}`
      );
    });

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
      const msgs = smartMessage(group.name, group.fixLikelihood, lowLevel);
      console.log('');
      console.log(`  ${chalk.cyan.bold('▶ ' + group.name)}`);
      console.log(`  ${chalk.dim('Confidence:')} ${confidenceLabel(group.fixLikelihood)}`);
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
    console.log(`   Run:  ${chalk.cyan.bold('npx dep-optimizer fix')}`);
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
    console.log(chalk.dim(`   Run: ${chalk.white('npx dep-optimizer trace <pkg>')} to trace any package to its source.\n`));
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
