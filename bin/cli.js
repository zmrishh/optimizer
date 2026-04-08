#!/usr/bin/env node

import { program } from 'commander';
import { setupCommands } from '../src/cli/index.js';
import fs from 'fs';
import path from 'path';

// Read version from package.json
const pkgPath = path.join(process.cwd(), 'package.json');
let version = '1.0.0';
try {
  const pkgContent = fs.readFileSync(new URL('../../package.json', import.meta.url), 'utf-8');
  version = JSON.parse(pkgContent).version;
} catch (e) {
  // Ignore
}

program
  .name('dep-optimizer')
  .description('NPM doctor for dependency bloat. Detects and resolves duplicated dependencies in your lockfile.')
  .version(version);

setupCommands(program);

program.parse(process.argv);
