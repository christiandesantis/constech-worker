import chalk from 'chalk';
import { ConfigManager } from '../core/config-manager.js';
import { WorkflowExecutor } from '../core/workflow-executor.js';
import { logger } from '../utils/logger.js';
import { exitGracefully } from '../utils/cleanup-manager.js';
import { showAnimatedBanner } from '../utils/banner.js';

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
    await exitGracefully(1, 'Either --issue or --prompt must be specified');
  }

  if (options.issue && options.createIssue) {
    await exitGracefully(1, 'Cannot use --create-issue with --issue (issue already exists)');
  }

  // Show animated banner
  await showAnimatedBanner();

  logger.info('🚀 Starting autonomous development workflow...');

  // Load configuration
  const configManager = new ConfigManager();
  let config;
  
  try {
    config = configManager.load();
  } catch (error: any) {
    logger.error('Failed to load configuration:', error?.message);
    logger.info('Run: constech-worker init');
    await exitGracefully(1);
  }

  // Validate configuration
  const validation = configManager.validate();
  if (!validation.valid && !options.force) {
    logger.error('Configuration validation failed:');
    for (const error of validation.errors) {
      console.log(`  • ${chalk.red(error)}`);
    }
    logger.info('Fix configuration or use --force to proceed anyway');
    await exitGracefully(1);
  }

  // Show what will be executed in dry-run mode
  if (options.dryRun) {
    await showDryRun(config, options);
    return;
  }

  // Validate environment
  const botToken = process.env[config?.bot.tokenEnvVar ?? ""];
  if (!botToken) {
    await exitGracefully(1, `Environment variable ${config?.bot.tokenEnvVar} is required`);
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

  try {
    // Create workflow executor
    const executor = new WorkflowExecutor(config!, {
      botToken: botToken ?? "",
      reviewer: options.reviewer || process.env[config?.workflow.reviewerEnvVar ?? ""],
      baseBranch: options.base || config?.project.workingBranch,
    });

    // Execute workflow with internal progress tracking
    await executor.execute({
      issueNumber: options.issue ? parseInt(options.issue) : undefined,
      prompt: options.prompt,
      createIssue: options.createIssue,
    });
    
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
    logger.error('✖ Workflow execution failed');
    logger.error('Execution failed:', error?.message);

    console.log('\n' + chalk.bgRed.black(' TROUBLESHOOTING '));
    console.log('• Check system health: constech-worker doctor');
    console.log('• Verify GitHub permissions and project access');
    console.log('• Ensure Claude Code is authenticated and working');
    console.log('• Check Docker is running and accessible');
    
    await exitGracefully(1);
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