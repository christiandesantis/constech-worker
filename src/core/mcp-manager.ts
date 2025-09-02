import { promises as fs } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { Config } from './config-schema.js';
import { logger } from '../utils/logger.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

export class McpManager {
  private config: Config;

  constructor(config: Config) {
    this.config = config;
  }

  /**
   * Get list of enabled MCP servers
   */
  getEnabledServers(): string[] {
    const enabled: string[] = [];
    const mcpServers = this.config.docker.mcpServers;

    if (mcpServers.github) enabled.push('github');
    if (mcpServers.semgrep) enabled.push('semgrep');
    if (mcpServers.ref) enabled.push('ref');

    return enabled;
  }

  /**
   * Generate MCP configuration for Claude Code
   */
  async generateMcpConfig(tempDir: string): Promise<string> {
    const enabledServers = this.getEnabledServers();
    
    if (enabledServers.length === 0) {
      logger.debug('No MCP servers enabled, skipping MCP configuration');
      return '';
    }

    logger.debug(`Generating MCP configuration for: ${enabledServers.join(', ')}`);

    const mcpConfig = {
      mcpServers: {} as Record<string, any>
    };

    // Generate configurations for enabled servers dynamically
    for (const serverName of enabledServers) {
      const serverConfig = this.generateServerConfig(serverName);
      if (serverConfig) {
        Object.assign(mcpConfig.mcpServers, serverConfig);
        logger.debug(`Generated MCP config for ${serverName}`);
      }
    }

    // Write combined config
    const configPath = join(tempDir, 'mcp-config.json');
    await fs.writeFile(configPath, JSON.stringify(mcpConfig, null, 2));

    logger.debug(`MCP configuration written to: ${configPath}`);
    return configPath;
  }

  /**
   * Get Docker environment variables for MCP servers
   */
  getMcpEnvironment(botToken: string): string[] {
    const env: string[] = [];
    const enabledServers = this.getEnabledServers();

    if (enabledServers.includes('github')) {
      env.push(`GITHUB_TOKEN=${botToken}`);
    }

    return env;
  }

  /**
   * Generate Dockerfile commands for MCP server installation
   */
  generateDockerfileCommands(): string[] {
    const commands: string[] = [];
    const enabledServers = this.getEnabledServers();

    if (enabledServers.length === 0) {
      return commands;
    }

    // Create npm install command for enabled servers
    const packages = enabledServers
      .map(server => this.getMcpPackageName(server))
      .filter(Boolean);

    if (packages.length > 0) {
      commands.push(`RUN npm install -g ${packages.join(' ')}`);
    }

    return commands;
  }

  /**
   * Generate MCP server configuration dynamically
   */
  private generateServerConfig(serverName: string): Record<string, any> | null {
    const packageName = this.getMcpPackageName(serverName);
    if (!packageName) return null;

    const serverConfigs: Record<string, any> = {
      github: {
        github: {
          command: "node",
          args: ["/usr/local/share/npm-global/lib/node_modules/@modelcontextprotocol/server-github/dist/index.js"],
          env: {
            GITHUB_TOKEN: "${GITHUB_TOKEN}"
          }
        }
      },
      semgrep: {
        semgrep: {
          command: "node", 
          args: ["/usr/local/share/npm-global/lib/node_modules/@modelcontextprotocol/server-semgrep/dist/index.js"],
          env: {}
        }
      },
      ref: {
        ref: {
          command: "node",
          args: ["/usr/local/share/npm-global/lib/node_modules/@modelcontextprotocol/server-ref/dist/index.js"], 
          env: {}
        }
      }
    };

    return serverConfigs[serverName] || null;
  }

  /**
   * Get npm package name for MCP server
   */
  private getMcpPackageName(serverName: string): string {
    const packageMap: Record<string, string> = {
      github: '@modelcontextprotocol/server-github',
      semgrep: '@modelcontextprotocol/server-semgrep', 
      ref: '@modelcontextprotocol/server-ref',
    };

    return packageMap[serverName] || '';
  }

  /**
   * Initialize MCP servers in container (script commands)
   */
  generateInitCommands(): string[] {
    const commands: string[] = [];
    const enabledServers = this.getEnabledServers();

    if (enabledServers.length === 0) {
      return commands;
    }

    commands.push('# Initialize MCP servers');
    commands.push('echo "Initializing MCP servers..." >&2');

    // Copy MCP configuration (Claude directory is mounted from host)  
    commands.push('cp /tmp/mcp-config.json $HOME/.claude/config.json 2>/dev/null || true');

    // Verify MCP installations
    for (const server of enabledServers) {
      const packageName = this.getMcpPackageName(server);
      if (packageName) {
        commands.push(`echo "Verifying ${server} MCP server..." >&2`);
        commands.push(`node -e "require('${packageName}')" 2>/dev/null || echo "Warning: ${server} MCP server not found" >&2`);
      }
    }

    return commands;
  }
}