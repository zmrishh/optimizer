import { commandAnalyze } from './analyze-command.js';
import { commandFix } from './fix-command.js';
import { commandTrace } from './trace-command.js';

export function setupCommands(program) {
  // Add default behavior when no command is passed to run 'analyze'
  program
    .command('analyze', { isDefault: true })
    .description('Analyze the lockfile and output a duplicate dependencies report')
    .option('--json', 'Output report as JSON')
    .option('--ci', 'Run in CI mode (minimal JSON, correct exit codes, no formatting)')
    .option('--verbose', 'Show full breakdown of all root causes and packages')
    .option('--simple', 'Show only top 3 root causes — great for a quick overview')
    .option('--top <number>', 'Limit results to top N root cause groups (default 5)', parseInt)
    .action(commandAnalyze);

  program
    .command('fix')
    .description('Safely automatically consolidate duplicate dependencies via package.json overrides')
    .option('--yes', 'Confirm to actually write the changes (defaults to dry-run)')
    .action(commandFix);

  program
    .command('trace <package>')
    .description('Trace which top-level dependencies introduce a given package')
    .action(commandTrace);
}
