import chalk from 'chalk';
import { parseLockfile } from '../parser/index.js';
import { buildDependencyGraph } from '../graph/builder.js';
import { detectDuplicates } from '../analyze/detector.js';
import { scoreDuplicates } from '../analyze/scorer.js';
import { applyFixes } from '../fix/fixer.js';
import { detectWorkspaces } from '../utils/workspace.js';
import fs from 'fs/promises';
import path from 'path';

export async function commandFix(options) {
  const projectDir = process.cwd();
  const isDryRun = !options.yes;

  try {
    console.log(chalk.dim('Analyzing dependencies to prepare fix plan...'));
    
    let pkg = null;
    try {
      const pkgStr = await fs.readFile(path.join(projectDir, 'package.json'), 'utf-8');
      pkg = JSON.parse(pkgStr);
    } catch(e) {}
    
    await detectWorkspaces(projectDir, pkg);

    const { type, map: rawPackagesMap } = await parseLockfile(projectDir);
    const cleanMap = buildDependencyGraph(rawPackagesMap);
    const duplicates = await detectDuplicates(cleanMap, projectDir);
    const scoredDuplicates = scoreDuplicates(duplicates);

    await applyFixes(scoredDuplicates, projectDir, isDryRun, type);

  } catch (error) {
    console.error(chalk.red(`❌ Error: ${error.message}`));
    process.exit(1);
  }
}
