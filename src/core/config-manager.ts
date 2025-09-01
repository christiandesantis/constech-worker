import { cosmiconfigSync } from 'cosmiconfig';
import { writeFileSync, existsSync } from 'fs';
import { join } from 'path';
import { Config, ConfigSchema, DefaultConfig } from './config-schema.js';
import { logger } from '../utils/logger.js';

export class ConfigManager {
  private configPath: string;
  private config: Config | null = null;

  constructor(configPath?: string) {
    this.configPath = configPath || '.constech-worker.json';
  }

  /**
   * Load configuration from file or return defaults
   */
  load(): Config {
    if (this.config) {
      return this.config;
    }

    try {
      const explorer = cosmiconfigSync('constech-worker', {
        searchPlaces: [
          '.constech-worker.json',
          '.constech-workerrc',
          '.constech-workerrc.json',
          '.constech-workerrc.yaml',
          '.constech-workerrc.yml',
          'constech-worker.config.js',
          'constech-worker.config.json',
        ]
      });
      const result = explorer.search();
      
      if (result) {
        logger.debug(`Loaded config from: ${result.filepath}`);
        this.config = ConfigSchema.parse(result.config);
        return this.config;
      }

      // No config found, return defaults
      logger.debug('No configuration found, using defaults');
      this.config = ConfigSchema.parse(DefaultConfig);
      return this.config;
    } catch (error: any) {
      logger.error('Failed to load configuration:', error);
      throw new Error(`Invalid configuration: ${error?.message}`);
    }
  }

  /**
   * Save configuration to file
   */
  save(config: Config): void {
    try {
      const validated = ConfigSchema.parse(config);
      writeFileSync(this.configPath, JSON.stringify(validated, null, 2));
      this.config = validated;
      logger.info(`Configuration saved to: ${this.configPath}`);
    } catch (error: any) {
      logger.error('Failed to save configuration:', error);
      throw new Error(`Failed to save configuration: ${error?.message}`);
    }
  }

  /**
   * Check if configuration file exists
   */
  exists(): boolean {
    return existsSync(this.configPath);
  }

  /**
   * Get a specific configuration value by dot notation path
   */
  get(path: string): any {
    const config = this.load();
    const keys = path.split('.');
    let value: any = config;
    
    for (const key of keys) {
      if (value && typeof value === 'object' && key in value) {
        value = value[key];
      } else {
        return undefined;
      }
    }
    
    return value;
  }

  /**
   * Set a specific configuration value by dot notation path
   */
  set(path: string, value: any): void {
    const config = this.load();
    const keys = path.split('.');
    let current: any = config;
    
    // Navigate to the parent object
    for (let i = 0; i < keys.length - 1; i++) {
      const key = keys[i];
      if (!current[key] || typeof current[key] !== 'object') {
        current[key] = {};
      }
      current = current[key];
    }
    
    // Set the final value
    const finalKey = keys[keys.length - 1];
    current[finalKey] = value;
    
    this.save(config);
  }

  /**
   * Validate current configuration
   */
  validate(): { valid: boolean; errors: string[] } {
    try {
      const config = this.load();
      ConfigSchema.parse(config);
      return { valid: true, errors: [] };
    } catch (error: any) {
      const errors = error?.errors?.map((e: any) => `${e.path.join('.')}: ${e.message}`) || [error.message];
      return { valid: false, errors };
    }
  }

  /**
   * Create default configuration file
   */
  createDefault(): void {
    const defaultConfig = ConfigSchema.parse(DefaultConfig);
    this.save(defaultConfig);
    logger.info('Created default configuration file');
  }

  /**
   * Merge user configuration with detected values
   */
  merge(detectedConfig: Partial<Config>): void {
    const currentConfig = this.exists() ? this.load() : ConfigSchema.parse(DefaultConfig);
    const mergedConfig = this.deepMerge(currentConfig, detectedConfig);
    this.save(mergedConfig);
  }

  private deepMerge(target: any, source: any): any {
    const result = { ...target };
    
    for (const key in source) {
      if (source[key] && typeof source[key] === 'object' && !Array.isArray(source[key])) {
        result[key] = this.deepMerge(result[key] || {}, source[key]);
      } else if (source[key] !== undefined && source[key] !== 'auto-detect') {
        result[key] = source[key];
      }
    }
    
    return result;
  }
}