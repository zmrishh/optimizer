#!/usr/bin/env node

import { program } from 'commander';
import { setupCommands } from '../src/cli/index.js';
import { fileURLToPath } from 'url';
import path from 'path';
import fs from 'fs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// Resolve version from this package's own package.json.
// Works correctly whether invoked via: node bin/cli.js, npm link, npm install -g, or npx.
let version = '1.0.0';
try {
  const pkgPath = path.join(__dirname, '..', 'package.json');
  version = JSON.parse(fs.readFileSync(pkgPath, 'utf-8')).version;
} catch {
  // Silently fall back — the CLI is still fully functional without a version string.
}

program
  .name('dep-optimizer')
  .description('NPM doctor for dependency bloat. Detects and resolves duplicated dependencies in your lockfile.')
  .version(version, '-v, --version', 'Output the current version')
  .addHelpText('after', `
Examples:
  $ dep-optimizer                   Full dependency health report
  $ dep-optimizer --simple          Top 3 root causes only
  $ dep-optimizer --verbose         Full breakdown of every group
  $ dep-optimizer --json            JSON output for CI/CD pipelines
  $ dep-optimizer --ci              Minimal JSON + exit codes for CI
  $ dep-optimizer fix               Dry-run safe deduplication fixes
  $ dep-optimizer fix --yes         Apply fixes to package.json
  $ dep-optimizer trace <pkg>       Trace a package to its root cause
`);

setupCommands(program);

async function runCLI() {
  await program.parseAsync(process.argv);
}

try {
  await runCLI();
} catch (err) {
  console.error("❌ Error:", err.message);
  process.exit(1);
}
