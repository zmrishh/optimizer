import fs from 'fs/promises';
import path from 'path';
import chalk from 'chalk';

export async function applyFixes(scoredDuplicates, projectDir, isDryRun, packageManagerType) {
  const packageJsonPath = path.join(projectDir, 'package.json');
  
  let pkgContent;
  try {
    pkgContent = await fs.readFile(packageJsonPath, 'utf-8');
  } catch (e) {
    throw new Error('Could not read package.json');
  }

  const pkg = JSON.parse(pkgContent);

  // Filter for safe duplicates to fix automatically
  const targets = scoredDuplicates.filter(dup => dup.safety === 'SAFE' && dup.suggestedVersion !== null);
  const riskyTargets = scoredDuplicates.filter(dup => dup.safety === 'RISKY');

  if (targets.length === 0) {
    console.log(chalk.green('✅ No auto-fixes available. Semver-compatible SAFE duplicates not found.'));
    return;
  }

  // Build the overrides object
  const newOverrides = {};
  for (const target of targets) {
    newOverrides[target.name] = target.suggestedVersion;
  }

  console.log(chalk.bold.underline(`\n🛠️  Deduplication Fix Plan (${packageManagerType}):`));
  console.log(chalk.dim('Applying SAFE fixes only...'));

  for (const target of targets) {
    console.log(`  ✔ ${chalk.cyan(target.name)} (SAFE) -> aligns to ${chalk.green(target.suggestedVersion)}`);
  }

  if (riskyTargets.length > 0) {
    for (const target of riskyTargets) {
      console.log(`  ⚠️ skipped ${chalk.cyan(target.name)} (RISKY)`);
    }
  }

  if (isDryRun) {
    console.log(chalk.yellow('\n⚠️  This is a DRY RUN. No files have been modified.'));
    console.log(`To apply these changes and update your package.json, run:\n  ${chalk.cyan('npx dep-optimizer fix --yes')}\n`);
    return;
  }

  // Determine property to update based on package manager
  let propToUpdate = 'overrides';
  if (packageManagerType === 'yarn') {
    propToUpdate = 'resolutions';
  } else if (packageManagerType === 'pnpm') {
    if (!pkg.pnpm) pkg.pnpm = {};
    propToUpdate = 'pnpm.overrides';
  }

  // Apply fixes
  if (packageManagerType === 'pnpm') {
    if (!pkg.pnpm.overrides) pkg.pnpm.overrides = {};
    Object.assign(pkg.pnpm.overrides, newOverrides);
  } else {
    if (!pkg[propToUpdate]) pkg[propToUpdate] = {};
    Object.assign(pkg[propToUpdate], newOverrides);
  }

  // Backup files
  try {
    const backupDir = path.join(projectDir, '.dep-optimizer-backup');
    await fs.mkdir(backupDir, { recursive: true });
    await fs.writeFile(path.join(backupDir, 'package.json.bak'), pkgContent);
    console.log(chalk.dim(`\nBacked up package.json to ${backupDir}`));
  } catch (e) {
    console.log(chalk.dim(`Warning: Failed to create backups.`));
  }

  // Write new package.json
  await fs.writeFile(packageJsonPath, JSON.stringify(pkg, null, 2) + '\n');
  console.log(chalk.green(`\n✅ Successfully updated package.json "${propToUpdate}".`));
  
  if (packageManagerType === 'npm') {
    console.log(chalk.bold(`You MUST now run ${chalk.cyan('npm install')} to apply the deduplication to your lockfile!\n`));
  } else if (packageManagerType === 'yarn') {
    console.log(chalk.bold(`You MUST now run ${chalk.cyan('yarn install')} to apply the deduplication to your lockfile!\n`));
  } else if (packageManagerType === 'pnpm') {
    console.log(chalk.bold(`You MUST now run ${chalk.cyan('pnpm install')} to apply the deduplication to your lockfile!\n`));
  }
}
