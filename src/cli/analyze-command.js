import chalk from 'chalk';
import { parseLockfile } from '../parser/index.js';
import { buildDependencyGraph } from '../graph/builder.js';
import { detectDuplicates } from '../analyze/detector.js';
import { scoreDuplicates } from '../analyze/scorer.js';
import { groupRootCauses } from '../analyze/grouper.js';
import { printTextReport, printJsonReport, printCiReport } from '../report/formatter.js';
import { detectWorkspaces } from '../utils/workspace.js';
import fs from 'fs/promises';
import path from 'path';

export async function commandAnalyze(options) {
  const projectDir = process.cwd();

  try {
    if (!options.json && !options.ci) {
      console.log(chalk.dim('Analyzing large dependency graph...'));
    }

    // Try reading package.json for workspaces
    let pkg = null;
    try {
      const pkgStr = await fs.readFile(path.join(projectDir, 'package.json'), 'utf-8');
      pkg = JSON.parse(pkgStr);
    } catch(e) {}
    
    // We can use the workspace config eventually to refine ignored internal packages
    await detectWorkspaces(projectDir, pkg);

    const { type, map: rawPackagesMap, topLevelDeps = new Set() } = await parseLockfile(projectDir);
    const cleanMap = buildDependencyGraph(rawPackagesMap);
    const duplicates = await detectDuplicates(cleanMap, projectDir);
    const scoredDuplicates = scoreDuplicates(duplicates);
    const rootCauses = groupRootCauses(scoredDuplicates, topLevelDeps);

    if (options.ci) {
      printCiReport(scoredDuplicates);
      process.exit(scoredDuplicates.length > 0 ? 1 : 0);
    } else if (options.json) {
      printJsonReport(scoredDuplicates, rootCauses);
      process.exit(scoredDuplicates.length > 0 ? 1 : 0);
    } else {
      if (type === 'npm') console.log(chalk.dim('Detected Package Manager: npm'));
      if (type === 'yarn') console.log(chalk.dim('Detected Package Manager: yarn'));
      if (type === 'pnpm') console.log(chalk.dim('Detected Package Manager: pnpm'));
      printTextReport(scoredDuplicates, rootCauses, options);
      process.exit(scoredDuplicates.length > 0 ? 1 : 0);
    }
  } catch (error) {
    if (options.json || options.ci) {
      console.log(JSON.stringify({ error: error.message }));
    } else {
      console.error(chalk.red(`❌ Error: ${error.message}`));
    }
    process.exit(2);
  }
}
