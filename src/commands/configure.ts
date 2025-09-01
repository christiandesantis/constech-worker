import chalk from 'chalk';
import { ConfigManager } from '../core/config-manager.js';
import { logger } from '../utils/logger.js';

interface ConfigureOptions {
  list?: boolean;
  reset?: boolean;
  validate?: boolean;
}

export async function configureCommand(
  key?: string,
  value?: string,
  options: ConfigureOptions = {}
): Promise<void> {
  const configManager = new ConfigManager();

  try {
    // List all configuration
    if (options.list) {
      await listConfiguration(configManager);
      return;
    }

    // Reset configuration
    if (options.reset) {
      await resetConfiguration(configManager);
      return;
    }

    // Validate configuration
    if (options.validate) {
      await validateConfiguration(configManager);
      return;
    }

    // Get specific key
    if (key && !value) {
      const currentValue = configManager.get(key);
      if (currentValue !== undefined) {
        console.log(chalk.cyan(key) + ':', formatValue(currentValue));
      } else {
        logger.error(`Configuration key '${key}' not found`);
        process.exit(1);
      }
      return;
    }

    // Set key-value pair
    if (key && value) {
      const parsedValue = parseValue(value);
      configManager.set(key, parsedValue);
      logger.success(`Set ${chalk.cyan(key)} = ${chalk.green(formatValue(parsedValue))}`);
      return;
    }

    // No action specified - show help
    console.log(chalk.bold('Configuration Management\n'));
    console.log('Usage:');
    console.log('  constech-worker configure --list                    # List all settings');
    console.log('  constech-worker configure --validate                # Validate configuration');
    console.log('  constech-worker configure --reset                   # Reset to defaults');
    console.log('  constech-worker configure project.owner             # Get value');
    console.log('  constech-worker configure project.owner MyOrg       # Set value');
    console.log('  constech-worker configure github.projectId null     # Clear value');

  } catch (error: any) {
    logger.error('Configuration operation failed:', error?.message);
    process.exit(1);
  }
}

async function listConfiguration(configManager: ConfigManager): Promise<void> {
  try {
    const config = configManager.load();
    
    console.log(chalk.bgBlue.black(' CONFIGURATION '));
    console.log();
    
    printSection('Project', config.project);
    printSection('GitHub', config.github);
    printSection('Bot', config.bot);
    printSection('Docker', config.docker);
    printSection('Workflow', config.workflow);

  } catch (error: any) {
    logger.error('Failed to load configuration:', error?.message);
    if (!configManager.exists()) {
      logger.info('No configuration found. Run: constech-worker init');
    }
  }
}

async function validateConfiguration(configManager: ConfigManager): Promise<void> {
  const validation = configManager.validate();
  
  if (validation.valid) {
    logger.success('Configuration is valid ✓');
  } else {
    logger.error('Configuration validation failed:');
    for (const error of validation.errors) {
      console.log(`  • ${chalk.red(error)}`);
    }
    process.exit(1);
  }
}

async function resetConfiguration(configManager: ConfigManager): Promise<void> {
  logger.info('Resetting configuration to defaults...');
  configManager.createDefault();
  logger.success('Configuration reset to defaults');
  logger.info('Run: constech-worker init to detect project settings');
}

function printSection(title: string, obj: any): void {
  console.log(chalk.bold.cyan(title + ':'));
  printObject(obj, '  ');
  console.log();
}

function printObject(obj: any, indent: string = ''): void {
  if (!obj || typeof obj !== 'object') {
    return;
  }

  for (const [key, value] of Object.entries(obj)) {
    if (value && typeof value === 'object' && !Array.isArray(value)) {
      console.log(indent + chalk.yellow(key) + ':');
      printObject(value, indent + '  ');
    } else {
      const formattedValue = formatValue(value);
      const color = value === null || value === undefined ? chalk.gray : chalk.green;
      console.log(indent + chalk.yellow(key) + ': ' + color(formattedValue));
    }
  }
}

function formatValue(value: any): string {
  if (value === null) {
    return 'null';
  }
  if (value === undefined) {
    return 'undefined';
  }
  if (Array.isArray(value)) {
    return `[${value.map(v => `"${v}"`).join(', ')}]`;
  }
  if (typeof value === 'string') {
    return `"${value}"`;
  }
  return String(value);
}

function parseValue(value: string): any {
  // Handle special values
  if (value === 'null') return null;
  if (value === 'undefined') return undefined;
  if (value === 'true') return true;
  if (value === 'false') return false;
  
  // Try to parse as number
  const num = Number(value);
  if (!isNaN(num) && isFinite(num)) {
    return num;
  }
  
  // Try to parse as JSON array/object
  if (value.startsWith('[') || value.startsWith('{')) {
    try {
      return JSON.parse(value);
    } catch (error) {
      // Fall through to string
    }
  }
  
  // Return as string
  return value;
}