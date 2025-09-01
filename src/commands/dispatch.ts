import chalk from 'chalk';
import ora from 'ora';
import { ConfigManager } from '../core/config-manager.js';
import { WorkflowExecutor } from '../core/workflow-executor.js';
import { logger } from '../utils/logger.js';

interface DispatchOptions {
  issue?: string;
  prompt?: string;
  createIssue?: boolean;
  reviewer?: string;
  base?: string;
  force?: boolean;
  dryRun?: boolean;
}

export async function dispatchCommand(options: DispatchOptions = {}): Promise<void> {
  // Validate input parameters
  if (!options.issue && !options.prompt) {
    logger.error('Either --issue or --prompt must be specified');
    process.exit(1);
  }

  if (options.issue && options.createIssue) {
    logger.error('Cannot use --create-issue with --issue (issue already exists)');
    process.exit(1);
  }

  logger.info('🚀 Starting Constech Worker dispatch...');

  // Load configuration
  const configManager = new ConfigManager();
  let config;
  
  try {
    config = configManager.load();
  } catch (error: any) {
    logger.error('Failed to load configuration:', error?.message);
    logger.info('Run: constech-worker init');
    process.exit(1);
  }

  // Validate configuration
  const validation = configManager.validate();
  if (!validation.valid && !options.force) {
    logger.error('Configuration validation failed:');
    for (const error of validation.errors) {
      console.log(`  • ${chalk.red(error)}`);
    }
    logger.info('Fix configuration or use --force to proceed anyway');
    process.exit(1);
  }

  // Show what will be executed in dry-run mode
  if (options.dryRun) {
    await showDryRun(config, options);
    return;
  }

  // Validate environment
  const botToken = process.env[config.bot.tokenEnvVar];
  if (!botToken) {
    logger.error(`Environment variable ${config.bot.tokenEnvVar} is required`);
    process.exit(1);
  }

  // Determine workflow scenario
  const scenario = determineScenario(options);
  logger.info(`📋 Workflow: ${chalk.cyan(scenario)}`);

  if (options.issue) {
    logger.info(`🎯 Target: Issue #${chalk.yellow(options.issue)}`);
  }
  
  if (options.prompt) {
    logger.info(`💭 Prompt: ${chalk.green(`"${options.prompt}"`)}`);
  }

  const spinner = ora('Preparing workflow execution...').start();

  try {
    // Create workflow executor
    const executor = new WorkflowExecutor(config, {
      botToken,
      reviewer: options.reviewer || process.env[config.workflow.reviewerEnvVar],
      baseBranch: options.base || config.project.workingBranch,
    });

    // Execute workflow
    spinner.text = 'Executing autonomous development workflow...';
    
    await executor.execute({
      issueNumber: options.issue ? parseInt(options.issue) : undefined,
      prompt: options.prompt,
      createIssue: options.createIssue,
    });

    spinner.succeed('Workflow completed successfully!');
    
    // Show success summary
    console.log('\n' + chalk.bgGreen.black(' SUCCESS '));
    console.log('✅ Autonomous development workflow completed');
    console.log('📋 Check your GitHub repository for:');
    console.log('   • New feature branch');
    console.log('   • Pull request with proper reviewers');
    console.log('   • Updated project status');
    
    if (options.createIssue) {
      console.log('   • Created GitHub issue');
    }

  } catch (error: any) {
    spinner.fail('Workflow execution failed');
    logger.error('Execution failed:', error?.message);

    console.log('\n' + chalk.bgRed.black(' TROUBLESHOOTING '));
    console.log('• Check system health: constech-worker doctor');
    console.log('• Verify GitHub permissions and project access');
    console.log('• Ensure Claude Code is authenticated and working');
    console.log('• Check Docker is running and accessible');
    
    process.exit(1);
  }
}

function determineScenario(options: DispatchOptions): string {
  if (options.issue && options.prompt) {
    return 'Combined (Issue + Custom context)';
  } else if (options.issue) {
    return 'Issue-based development';
  } else if (options.prompt && options.createIssue) {
    return 'Create issue + Development';
  } else if (options.prompt) {
    return 'Prompt-only development';
  } else {
    return 'Unknown';
  }
}

async function showDryRun(config: any, options: DispatchOptions): Promise<void> {
  console.log('\n' + chalk.bgYellow.black(' DRY RUN - NO CHANGES WILL BE MADE '));
  
  console.log('\n' + chalk.bold('Configuration:'));
  console.log(`  Project: ${chalk.cyan(`${config.project.owner}/${config.project.name}`)}`);
  console.log(`  Base branch: ${chalk.yellow(options.base || config.project.workingBranch)}`);
  console.log(`  Bot token: ${chalk.green(config.bot.tokenEnvVar)} ${process.env[config.bot.tokenEnvVar] ? '✓' : '✗'}`);
  
  const reviewer = options.reviewer || process.env[config.workflow.reviewerEnvVar] || config.workflow.defaultReviewer;
  if (reviewer) {
    console.log(`  Reviewer: ${chalk.magenta(reviewer)}`);
  }

  console.log('\n' + chalk.bold('Workflow steps:'));
  
  if (options.createIssue && options.prompt) {
    console.log(`  1. ${chalk.blue('Create GitHub issue')} from prompt`);
    console.log(`     Title: ${chalk.gray('feat: [first sentence of prompt]')}`);
    console.log(`     Body: ${chalk.gray('[remaining prompt content]')}`);
  }
  
  if (options.issue) {
    console.log(`  ${options.createIssue ? '2' : '1'}. ${chalk.blue('Fetch issue')} #${options.issue}`);
  }
  
  const stepOffset = (options.createIssue ? 1 : 0) + (options.issue ? 1 : 0);
  console.log(`  ${stepOffset + 1}. ${chalk.blue('Create feature branch')} from ${options.base || config.project.workingBranch}`);
  console.log(`  ${stepOffset + 2}. ${chalk.blue('Execute Claude Code')} in isolated container`);
  console.log(`  ${stepOffset + 3}. ${chalk.blue('Run quality checks')}: ${config.workflow.qualityChecks.join(', ')}`);
  console.log(`  ${stepOffset + 4}. ${chalk.blue('Create pull request')} with bot authentication`);
  console.log(`  ${stepOffset + 5}. ${chalk.blue('Update project status')} to "In Review"`);
  
  console.log('\n' + chalk.bold('Docker execution:'));
  console.log(`  Container: ${chalk.gray('Isolated dev container with Claude Code')}`);
  console.log(`  Volumes: ${chalk.gray('Project source + Claude Code authentication')}`);
  console.log(`  Network: ${chalk.gray('Isolated with GitHub API access')}`);

  console.log(`\n${chalk.yellow('💡 Run without --dry-run to execute the workflow')}`);
}