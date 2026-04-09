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
  .name('depopsy')
  .description('NPM doctor for dependency bloat. Detects and resolves duplicated dependencies in your lockfile.')
  .version(version, '-v, --version', 'Output the current version')
  .addHelpText('after', `
Examples:
  $ depopsy                   Full dependency health report
  $ depopsy --simple          Top 3 root causes only
  $ depopsy --verbose         Full breakdown of every group
  $ depopsy --json            JSON output for CI/CD pipelines
  $ depopsy --ci              Minimal JSON + exit codes for CI
  $ depopsy fix               Dry-run safe deduplication fixes
  $ depopsy fix --yes         Apply fixes to package.json
  $ depopsy trace <pkg>       Trace a package to its root cause
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
