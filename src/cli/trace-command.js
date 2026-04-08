import chalk from 'chalk';
import { parseLockfile } from '../parser/index.js';
import { buildDependencyGraph } from '../graph/builder.js';
import { detectDuplicates } from '../analyze/detector.js';
import { scoreDuplicates } from '../analyze/scorer.js';

export async function commandTrace(pkgArg, options) {
  const projectDir = process.cwd();
  const targetName = pkgArg.replace(/@.*/, ''); // strip version if accidentally passed

  try {
    console.log(chalk.dim(`\nTracing "${targetName}" through dependency graph...\n`));

    const { map: rawPackagesMap } = await parseLockfile(projectDir);
    const cleanMap = buildDependencyGraph(rawPackagesMap);
    const duplicates = await detectDuplicates(cleanMap, projectDir);
    const scored = scoreDuplicates(duplicates);

    // Find the target duplicate (if any)
    const target = scored.find(d => d.name === targetName);

    if (!target) {
      console.log(chalk.yellow(`  ⚠ "${targetName}" is not in the duplicate list.`));
      console.log(chalk.dim(`  It might exist at a single version (no conflict) or not be installed.\n`));
      return;
    }

    // Collect all root introducers across all instances
    const rootSet = new Map(); // rootName → versions[]
    for (const detail of target.details) {
      for (const r of (detail.roots || [])) {
        if (!rootSet.has(r)) rootSet.set(r, new Set());
      }
      for (const p of (detail.parents || [])) {
        // Group immediate parents as secondary info
        if (!rootSet.has(p)) rootSet.set(p, new Set());
      }
    }

    // Collect all allParents for chain display
    const allAncestors = new Set();
    for (const detail of target.details) {
      for (const a of (detail.ancestors || detail.allParents || detail.roots || [])) {
        allAncestors.add(a);
      }
    }

    console.log(chalk.bold.white(`🔍 Trace: ${chalk.cyan(targetName)}`));
    console.log(chalk.dim('─'.repeat(50)));
    console.log('');

    // Show versions found
    console.log(`  ${chalk.bold('Versions found:')} ${target.versions.map(v => chalk.yellow(v)).join(', ')}`);
    console.log(`  ${chalk.bold('Safety:')} ${target.safety === 'SAFE' ? chalk.green('SAFE') : chalk.red('RISKY')}`);
    console.log('');

    // Show which top-level deps introduce this
    const roots = [...new Set(target.details.flatMap(d => d.roots || []))].filter(Boolean);
    if (roots.length > 0) {
      console.log(chalk.bold.white(`  ${targetName} is introduced by:`));
      for (const r of roots) {
        console.log(`    ${chalk.dim('▶')} ${chalk.cyan(r)}`);
      }
    } else if (allAncestors.size > 0) {
      console.log(chalk.bold.white(`  ${targetName} appears via these ancestors:`));
      const ancestors = [...allAncestors].slice(0, 15);
      for (const a of ancestors) {
        console.log(`    ${chalk.dim('→')} ${a}`);
      }
      if (allAncestors.size > 15) {
        console.log(chalk.dim(`    (+ ${allAncestors.size - 15} more)`));
      }
    } else {
      console.log(chalk.yellow(`  No parent chain found.`));
      console.log(chalk.dim(`  "${targetName}" may be a direct project dependency.\n`));
    }

    // Show immediate parents per version
    console.log('');
    console.log(chalk.bold.white('  Per-version breakdown:'));
    for (const detail of target.details) {
      const immediateParents = (detail.parents || []).slice(0, 5);
      const more = (detail.parents || []).length - immediateParents.length;
      console.log(`    ${chalk.yellow(detail.version)} — required by: ${
        immediateParents.length > 0
          ? immediateParents.join(', ') + (more > 0 ? chalk.dim(` (+${more} more)`) : '')
          : chalk.dim('(unknown)')
      }`);
    }

    console.log('');
    console.log(chalk.dim('─'.repeat(50)));
    if (target.suggestedVersion) {
      console.log(`  💡 Suggested fix: align all to ${chalk.green(target.suggestedVersion)}`);
      console.log(chalk.dim(`     Run: npx dep-optimizer fix\n`));
    } else {
      console.log(chalk.dim(`  ⚠  No auto-fix available — versions span multiple majors.\n`));
    }

  } catch (err) {
    console.error(chalk.red(`❌ Error: ${err.message}`));
    process.exit(2);
  }
}
