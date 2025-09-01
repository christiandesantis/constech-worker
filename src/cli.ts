#!/usr/bin/env node

import { Command } from 'commander';
import chalk from 'chalk';
import { initCommand } from './commands/init.js';
import { dispatchCommand } from './commands/dispatch.js';
import { doctorCommand } from './commands/doctor.js';
import { configureCommand } from './commands/configure.js';

const program = new Command();

program
  .name('constech-worker')
  .description('Autonomous GitHub project management with Claude Code integration')
  .version('1.0.0')
  .helpOption('-h, --help', 'Display help for command')
  .addHelpText('after', `
Examples:
  ${chalk.cyan('constech-worker init')}                    Initialize project configuration
  ${chalk.cyan('constech-worker dispatch --issue 42')}    Work on GitHub issue #42
  ${chalk.cyan('constech-worker dispatch --prompt "Add dark mode" --create-issue')}
  ${chalk.cyan('constech-worker doctor')}                 Check system requirements
  
For more help: ${chalk.blue('https://github.com/constech-org/constech-worker')}
`);

// Initialize project configuration
program
  .command('init')
  .description('Initialize Constech Worker in the current project')
  .option('--force', 'Overwrite existing configuration')
  .option('--config <path>', 'Custom configuration file path')
  .action(initCommand);

// Main dispatch command
program
  .command('dispatch')
  .description('Dispatch autonomous development worker')
  .option('--issue <number>', 'GitHub issue number to work on')
  .option('--prompt <text>', 'Custom development task prompt')
  .option('--create-issue', 'Create GitHub issue from prompt first')
  .option('--reviewer <username>', 'Override default reviewer')
  .option('--base <branch>', 'Base branch for PR (default: staging)')
  .option('--force', 'Skip validation checks')
  .option('--dry-run', 'Show what would be executed without running')
  .action(dispatchCommand);

// System health check
program
  .command('doctor')
  .description('Check system requirements and configuration health')
  .option('--fix', 'Attempt to fix detected issues')
  .option('--verbose', 'Show detailed diagnostic information')
  .action(doctorCommand);

// Configuration management
program
  .command('configure')
  .description('Manage project configuration')
  .argument('[key]', 'Configuration key to view/edit (e.g., github.projectId)')
  .argument('[value]', 'New value to set')
  .option('--list', 'List all configuration values')
  .option('--reset', 'Reset to default configuration')
  .option('--validate', 'Validate current configuration')
  .action(configureCommand);

// Global error handler
program.configureHelp({
  sortSubcommands: true,
  subcommandTerm: (cmd) => cmd.name() + ' ' + cmd.usage(),
});

program.parseAsync(process.argv).catch((error) => {
  console.error(chalk.red('Error:'), error.message);
  process.exit(1);
});