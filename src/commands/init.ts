import chalk from 'chalk';
import ora from 'ora';
import { ConfigManager } from '../core/config-manager.js';
import { ProjectDetector } from '../core/project-detector.js';
import { logger } from '../utils/logger.js';

interface InitOptions {
  force?: boolean;
  config?: string;
}

export async function initCommand(options: InitOptions = {}): Promise<void> {
  const configManager = new ConfigManager(options.config);
  
  logger.info('🚀 Initializing Constech Worker...');

  // Check if config already exists
  if (configManager.exists() && !options.force) {
    logger.warning('Configuration already exists. Use --force to overwrite.');
    return;
  }

  const spinner = ora('Detecting project settings...').start();

  try {
    // Get bot token from environment
    const botToken = process.env.GITHUB_BOT_TOKEN || process.env.BOT_APP_TOKEN;
    
    if (!botToken) {
      spinner.warn('No GITHUB_BOT_TOKEN found in environment');
      logger.info('ℹ️  You can set this later or run again with the token configured');
    }

    // Auto-detect project settings
    const detector = new ProjectDetector();
    const detected = await detector.detect(botToken);
    
    spinner.text = 'Creating configuration...';
    
    // Create configuration
    const detectedConfig = detector.createConfig(detected);
    configManager.merge(detectedConfig);
    
    spinner.succeed('Configuration created successfully!');

    // Show summary
    console.log('\n' + chalk.bgGreen.black(' CONFIGURATION SUMMARY '));
    console.log(`📁 Project: ${chalk.cyan(`${detected.owner}/${detected.name}`)}`);
    console.log(`🌿 Branches: ${chalk.yellow(detected.defaultBranch)} → ${chalk.green(detected.workingBranch || 'staging')}`);
    
    if (detected.botUsername) {
      console.log(`🤖 Bot: ${chalk.magenta(detected.botUsername)}`);
    }
    
    if (detected.githubProject) {
      console.log(`📋 GitHub Project: ${chalk.blue('Detected')}`);
    }

    console.log(`⚙️  Config file: ${chalk.dim(configManager['configPath'])}`);

    // Next steps
    console.log('\n' + chalk.bgBlue.black(' NEXT STEPS '));
    console.log(`1. Review configuration: ${chalk.cyan('constech-worker configure --list')}`);
    
    if (!botToken) {
      console.log(`2. Set bot token: ${chalk.yellow('export GITHUB_BOT_TOKEN=ghp_...')}`);
    }
    
    console.log(`3. Check system health: ${chalk.cyan('constech-worker doctor')}`);
    console.log(`4. Start working: ${chalk.cyan('constech-worker dispatch --issue 42')}`);

  } catch (error: any) {
    spinner.fail('Failed to initialize project');
    logger.error('Initialization failed:', error?.message);
    
    console.log('\n' + chalk.bgRed.black(' TROUBLESHOOTING '));
    console.log('• Make sure you are in a git repository with GitHub remote');
    console.log('• Verify GITHUB_BOT_TOKEN is set and valid');
    console.log('• Check network connectivity to GitHub');
    
    process.exit(1);
  }
}