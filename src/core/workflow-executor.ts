import { spawn } from 'child_process';
import { promises as fs } from 'fs';
import { join } from 'path';
import { userInfo } from 'os';
import Docker from 'dockerode';
import { logger } from '../utils/logger.js';
import { Config } from './config-schema.js';
import { GitHubClient } from './github-client.js';
import { McpManager } from './mcp-manager.js';
import { ClaudeMdParser } from './claude-md-parser.js';
import ora from 'ora';

export interface WorkflowOptions {
  botToken: string;
  reviewer?: string;
  baseBranch?: string;
}

export interface ExecutionOptions {
  issueNumber?: number;
  prompt?: string;
  createIssue?: boolean;
}

export class WorkflowExecutor {
  private config: Config;
  private options: WorkflowOptions;
  private docker: Docker;
  private github: GitHubClient;
  private mcpManager: McpManager;
  private claudeMdParser: ClaudeMdParser;
  private tempDockerDir?: string;
  private tempScriptDir?: string;

  constructor(config: Config, options: WorkflowOptions) {
    this.config = config;
    this.options = options;
    this.docker = new Docker();
    this.github = new GitHubClient(options.botToken);
    this.mcpManager = new McpManager(config);
    this.claudeMdParser = new ClaudeMdParser(process.cwd());
  }

  async execute(execution: ExecutionOptions): Promise<void> {
    logger.info('Starting workflow execution...');

    // Step 1: Create GitHub issue if requested
    let issueNumber = execution.issueNumber;
    if (execution.createIssue && execution.prompt) {
      issueNumber = await this.createGitHubIssue(execution.prompt);
      logger.success(`Created GitHub issue #${issueNumber}`);
    }

    // Step 2: Set issue status to "In progress" if working on an issue
    if (issueNumber && this.config.github?.projectId) {
      await this.setIssueStatus(issueNumber, 'inProgress');
      logger.success(`Issue #${issueNumber} status set to "In progress"`);
    }

    // Step 3: Prepare Docker container
    const containerId = await this.prepareContainer();
    logger.success('Container prepared and ready');

    try {
      // Step 4: Execute Claude Code workflow
      await this.executeWorkflow(containerId, {
        issueNumber,
        prompt: execution.prompt,
      });

      logger.success('Claude Code execution completed');

    } finally {
      // Cleanup container
      await this.cleanupContainer(containerId);
    }
  }

  private async createGitHubIssue(prompt: string): Promise<number> {
    const spinner = ora('Creating GitHub issue...').start();
    
    try {
      // Extract title and description using the same logic as shell script
      let title: string;
      let description: string;
      
      if (prompt.includes('.')) {
        const firstSentence = prompt.split('.')[0].trim();
        title = firstSentence;
        description = prompt.substring(prompt.indexOf('.') + 1).trim();
      } else {
        // Fallback logic for prompts without dots
        const cleanPrompt = prompt.replace(/^(we need to |please |can you )/i, '');
        title = cleanPrompt.length > 50 ? cleanPrompt.substring(0, 50) : cleanPrompt;
        description = prompt;
      }

      const body = `## Description
${description}

## Tasks
- [ ] Analyze requirements
- [ ] Implement solution
- [ ] Test implementation
- [ ] Update documentation if needed

## Acceptance Criteria
- Solution meets the described requirements
- Code follows project conventions
- All quality checks pass (typecheck, lint, build)
- Changes are properly tested

---
*This issue was created automatically by Constech Worker.*`;

      const issue = await this.github.createIssue({
        owner: this.config.project.owner,
        repo: this.config.project.name,
        title,
        body,
        assignees: [this.config.bot.username!],
        labels: ['enhancement'],
      });

      // Add to GitHub project if configured
      if (this.config.github?.projectId) {
        await this.github.addIssueToProject(issue.number, this.config.github.projectId, this.config.project.owner, this.config.project.name);
        
        // Set status to Ready
        if (this.config.github.statusFieldId && this.config.github.statusOptions?.ready) {
          await this.github.updateProjectItemStatus(
            issue.number,
            this.config.github.projectId,
            this.config.github.statusFieldId,
            this.config.github.statusOptions.ready,
            'issue',
            this.config.project.owner,
            this.config.project.name
          );
        }
      }

      spinner.succeed(`Created issue #${issue.number}: ${title}`);
      return issue.number;
      
    } catch (error) {
      spinner.fail('Failed to create GitHub issue');
      throw error;
    }
  }

  private async setIssueStatus(issueNumber: number, status: 'inProgress' | 'inReview'): Promise<void> {
    if (!this.config.github?.projectId || !this.config.github?.statusFieldId) {
      logger.warning('GitHub project not configured, skipping issue status update');
      return;
    }

    const statusValue = status === 'inProgress' 
      ? this.config.github?.statusOptions?.inProgress
      : this.config.github?.statusOptions?.inReview;

    if (!statusValue) {
      logger.warning(`Status option "${status}" not configured, skipping status update`);
      return;
    }

    try {
      await this.github.updateProjectItemStatus(
        issueNumber,
        this.config.github!.projectId,
        this.config.github!.statusFieldId,
        statusValue,
        'issue',
        this.config.project.owner,
        this.config.project.name
      );
    } catch (error: any) {
      logger.error(`Failed to update issue #${issueNumber} status: ${error?.message}`);
      throw error;
    }
  }

  private async prepareContainer(): Promise<string> {
    const spinner = ora('Preparing Docker container...').start();
    
    try {
      // Build or pull container image
      const imageName = await this.ensureContainerImage();
      
      // Generate MCP configuration if needed
      const mcpConfigPath = await this.prepareMcpConfiguration();
      
      // Create container with proper configuration (match dispatch-worker.sh approach)
      // Mount repository as read-only like working implementation
      const containerBinds = [
        `${process.cwd()}:/workspace/repo:ro`, // Read-only mount like dispatch-worker.sh
        // Use persistent Docker volume for Claude authentication like working implementation
        'plaiwoo-worker-claude:/home/worker/.claude:rw',
      ];
      
      // Add MCP config if available  
      if (mcpConfigPath) {
        containerBinds.push(`${mcpConfigPath}:/tmp/mcp-config.json:ro`);
      }
      
      const container = await this.docker.createContainer({
        Image: imageName,
        WorkingDir: '/workspace',
        Cmd: ['sleep', 'infinity'], // Keep container alive for exec commands
        Env: [
          'HOME=/home/worker', // Use worker home directory like dispatch-worker.sh
          'USER=worker', // Set user name to worker
          'PATH=/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin:/usr/local/share/npm-global/bin:/usr/local/share/pnpm', // Include npm-global and pnpm paths
          'NPM_CONFIG_PREFIX=/usr/local/share/npm-global', // Match devcontainer config
          'CLAUDE_CONFIG_DIR=/home/worker/.claude', // Set Claude config directory like dispatch-worker.sh
          `GITHUB_TOKEN=${this.options.botToken}`,
          `GH_TOKEN=${this.options.botToken}`,
          `BOT_APP_TOKEN=${this.options.botToken}`,
          `CURRENT_USER=${this.options.reviewer || 'unknown'}`,
          `REVIEWER_USER=${this.options.reviewer || 'unknown'}`,
          `REPOSITORY_OWNER=${this.config.project.owner}`,
          `REPOSITORY_NAME=${this.config.project.name}`,
          'NODE_OPTIONS=--max-old-space-size=4096',
          'DEVCONTAINER=true',
          'PNPM_HOME=/usr/local/share/pnpm',
          'PNPM_STORE_PATH=/tmp/pnpm-store',
          'PNPM_CACHE_PATH=/tmp/pnpm-cache',
          'PNPM_STATE_DIR=/tmp/pnpm-state',
          'POWERLEVEL9K_DISABLE_GITSTATUS=true',
          ...this.mcpManager.getMcpEnvironment(this.options.botToken),
        ],
        HostConfig: {
          AutoRemove: false, // Manual cleanup for better debugging
          Binds: containerBinds,
          CapAdd: ['NET_ADMIN', 'NET_RAW', 'SYS_PTRACE'],
          Privileged: false, // Keep false for security
          SecurityOpt: ['seccomp=unconfined'], // Allow some system calls
          // Remove resource limits - they may be causing the exit code 137
          // Memory: 8 * 1024 * 1024 * 1024, // 8GB memory limit
          // CpuQuota: 200000, // 2 CPU cores  
          // CpuPeriod: 100000,
        },
        User: 'worker', // Use worker user like dispatch-worker.sh
        Tty: false,
        AttachStdout: true,
        AttachStderr: true,
      });

      spinner.succeed('Container created successfully');
      return container.id;
      
    } catch (error) {
      spinner.fail('Failed to prepare container');
      throw error;
    }
  }

  private async ensureContainerImage(): Promise<string> {
    // Check if we need to build from devcontainer
    const devContainerPath = join(process.cwd(), this.config.docker.devContainerPath);
    
    try {
      await fs.access(devContainerPath);
      // Build dev container image
      return await this.buildDevContainer();
    } catch (error) {
      // Use default worker image or template
      return await this.buildWorkerImage();
    }
  }

  private async buildDevContainer(): Promise<string> {
    const spinner = ora('Building dev container image...').start();
    
    try {
      // Use devcontainer CLI to build the image (let it generate its own name)
      const { execSync } = await import('child_process');
      
      // Build from the target project directory, not the CLI tool directory
      const targetWorkspaceFolder = process.cwd();
      logger.debug(`Building devcontainer from: ${targetWorkspaceFolder}`);
      logger.debug(`Checking for .devcontainer/devcontainer.json...`);
      
      const devcontainerPath = join(targetWorkspaceFolder, '.devcontainer', 'devcontainer.json');
      try {
        await fs.access(devcontainerPath);
        logger.debug('✓ Found devcontainer.json');
      } catch {
        logger.warning(`✗ devcontainer.json not found at: ${devcontainerPath}`);
      }
      
      const output = execSync(`npx --yes @devcontainers/cli build --workspace-folder "${targetWorkspaceFolder}"`, {
        cwd: targetWorkspaceFolder,
        stdio: 'pipe',
        encoding: 'utf8',
      });
      
      // Parse the output to get the actual image name generated by devcontainer CLI
      const outputLines = output.toString().split('\n');
      const resultLine = outputLines.find(line => line.includes('"imageName"'));
      
      let imageName: string;
      if (resultLine) {
        const match = resultLine.match(/"imageName":\["([^"]+)"\]/);
        imageName = match ? match[1] : `vsc-${this.config.project.name}-${Date.now()}`;
      } else {
        // Fallback: devcontainer generates deterministic names based on folder hash
        imageName = `vsc-${this.config.project.name}-${Date.now()}`;
      }
      
      spinner.succeed(`Dev container image built: ${imageName}`);
      return imageName;
      
    } catch (error) {
      spinner.fail('Failed to build dev container');
      throw error;
    }
  }

  private async buildWorkerImage(): Promise<string> {
    const spinner = ora('Building worker container image...').start();
    
    try {
      // Create a temporary Dockerfile based on our template
      const dockerfileContent = await this.generateDockerfile();
      const imageName = `constech-worker-default:latest`;
      
      // Use simpler Docker build approach via command line
      const { execSync } = await import('child_process');
      
      try {
        // Build from temp directory with the generated Dockerfile
        const dockerfilePath = join(this.tempDockerDir!, 'Dockerfile');
        execSync(`docker build -f ${dockerfilePath} -t ${imageName} .`, {
          cwd: process.cwd(), // Build context is still the project directory
          stdio: 'pipe',
        });
        
        spinner.succeed('Worker image built');
      } catch (buildError: any) {
        throw new Error(`Docker build failed: ${buildError.message}`);
      }
      return imageName;
      
    } catch (error) {
      spinner.fail('Failed to build worker image');
      throw error;
    }
  }

  private async generateDockerfile(): Promise<string> {
    // Generate Dockerfile content based on template
    const mcpCommands = this.mcpManager.generateDockerfileCommands();
    
    const dockerfileContent = `
FROM node:${this.config.docker.nodeVersion}

# Install system dependencies
RUN apt-get update && apt-get install -y --no-install-recommends \\
  git gh jq vim nano curl wget unzip \\
  && apt-get clean && rm -rf /var/lib/apt/lists/*

# Create worker user
RUN useradd -m worker && usermod -aG sudo worker
RUN echo "worker ALL=(ALL) NOPASSWD:ALL" >> /etc/sudoers

# Install Claude Code
RUN npm install -g @anthropic-ai/claude-code

# Install MCP servers
${mcpCommands.join('\n')}

# Configure git
RUN git config --system user.name "constech-worker"
RUN git config --system user.email "worker@constech.dev"
RUN git config --system credential.helper store

# Set up working directory
WORKDIR /workspace

# Switch to worker user
USER worker

CMD ["sleep", "infinity"]
    `;

    // Create temporary directory for Docker build context
    const tempDir = await fs.mkdtemp(join(process.cwd(), '.tmp-constech-'));
    const dockerfilePath = join(tempDir, 'Dockerfile');
    
    await fs.writeFile(dockerfilePath, dockerfileContent);
    
    // Store temp dir for cleanup
    this.tempDockerDir = tempDir;
    
    return dockerfileContent;
  }

  private async executeWorkflow(
    containerId: string,
    execution: { issueNumber?: number; prompt?: string }
  ): Promise<void> {
    const container = this.docker.getContainer(containerId);
    
    try {
      // Start container first with better error handling
      logger.debug('Starting container...');
      await container.start();
      
      // Wait a moment for container to fully initialize
      await new Promise(resolve => setTimeout(resolve, 1000));
      
      // Check if container is actually running
      const containerInfo = await container.inspect();
      if (!containerInfo.State.Running) {
        throw new Error(`Container failed to start. State: ${JSON.stringify(containerInfo.State)}`);
      }
      
      logger.debug('Container started successfully');
      
      // Create workflow script based on our shell scripts
      const scriptContent = await this.generateWorkflowScript(execution);
      
      // Create script in temporary directory (not in target repo)
      const osModule = await import('os');
      const tempDir = await fs.mkdtemp(join(osModule.tmpdir(), 'constech-script-'));
      const scriptPath = join(tempDir, 'workflow.sh');
      
      await fs.writeFile(scriptPath, scriptContent);
      await fs.chmod(scriptPath, 0o755);
      
      // Store for cleanup
      this.tempScriptDir = tempDir;
      
      logger.debug(`Script written to temp file: ${scriptPath}`);
      
      // Execute the script directly by mounting the temp file
      const exec = await container.exec({
        Cmd: ['/bin/bash', '-c', `
          # Copy script to container and execute
          echo '${scriptContent.replace(/'/g, "'\\''")}' > /tmp/workflow.sh
          chmod +x /tmp/workflow.sh
          exec /bin/bash /tmp/workflow.sh
        `],
        AttachStdout: true,
        AttachStderr: true,
        Tty: false,
        User: 'worker', // Use worker user like dispatch-worker.sh
        WorkingDir: '/workspace',
        Env: [
          'SHELL=/bin/bash',
          'PATH=/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin:/usr/local/share/npm-global/bin:/usr/local/share/pnpm', // Include npm-global and pnpm paths
          'NPM_CONFIG_PREFIX=/usr/local/share/npm-global', // Match devcontainer config
          'HOME=/home/worker', // Use worker home directory like dispatch-worker.sh
          'CLAUDE_CONFIG_DIR=/home/worker/.claude', // Set Claude config directory like dispatch-worker.sh
        ],
      });

      logger.debug('Exec created, starting stream...');
      const stream = await exec.start({});
      
      // Show progress animation
      await this.showProgress(stream, exec);
      
    } catch (error: any) {
      logger.error('Container execution failed:', error.message);
      
      // Get container logs for debugging
      try {
        const logs = await container.logs({ 
          stdout: true, 
          stderr: true,
          tail: 50 
        });
        logger.error('Container logs:', logs.toString());
      } catch (logError: any) {
        logger.error('Failed to get container logs:', logError.message);
      }
      
      throw error;
    }
  }

  private async generateWorkflowScript(execution: {
    issueNumber?: number;
    prompt?: string;
  }): Promise<string> {
    // Read CLAUDE.md instructions from the project
    const claudeInstructions = await this.claudeMdParser.readClaudeInstructions();
    
    let workflowType: 'issue' | 'prompt' = 'prompt';
    if (execution.issueNumber) {
      workflowType = 'issue';
    }

    // Generate enhanced system prompt using parser
    const systemPrompt = this.claudeMdParser.generateSystemPrompt({
      workflowType,
      issueNumber: execution.issueNumber,
      prompt: execution.prompt,
      workingBranch: this.config.project.workingBranch,
      qualityChecks: this.config.workflow.qualityChecks,
      filteredInstructions: claudeInstructions.filtered,
      reviewerEnvVar: this.config.workflow.reviewerEnvVar,
      defaultReviewer: this.config.workflow.defaultReviewer || undefined,
      projectId: this.config.github?.projectId || undefined,
      statusFieldId: this.config.github?.statusFieldId || undefined,
      inReviewStatusId: this.config.github?.statusOptions?.inReview || undefined,
    });

    const fullPrompt = `${systemPrompt}

I am the autonomous development worker. I need to complete the full development workflow as specified above.

Please:
1. Start by reading CLAUDE.md to understand the workflow  
2. Follow the exact steps for the workflow type
3. Execute each step completely without asking for confirmation
4. Use the bot authentication patterns for GitHub operations
5. Complete the entire workflow from start to PR creation

Begin now.`;

    // Get MCP initialization commands
    const mcpInitCommands = this.mcpManager.generateInitCommands();

    // Create script that mimics workflow-engine.sh behavior  
    return `#!/bin/bash
set -e

# Debug info with step-by-step logging
echo "=== CONSTECH WORKER DEBUG INFO ===" >&2
echo "Step 1: Container started at: \$(date)" >&2
echo "Step 2: Working directory: \$(pwd)" >&2

echo "Step 3: Checking memory..." >&2
free -h >&2 || echo "free command failed" >&2

echo "Step 4: Checking Claude Code..." >&2
echo "PATH: \$PATH" >&2
which claude >&2 || echo "Claude Code not in PATH" >&2

echo "Step 5: Listing npm global packages..." >&2
npm list -g --depth=0 >&2 || echo "npm list failed" >&2

echo "Step 6: Checking Claude Code version..." >&2
claude --version >&2 || echo "Claude Code version check failed" >&2

echo "Step 6: Debug info complete, continuing with workflow..." >&2

# Initialize workspace (read-only repo mount at /workspace/repo)
cd /workspace
echo "Switched to workspace: \$(pwd)" >&2

# Check Claude authentication (should be available via persistent volume)
echo "Checking Claude Code authentication..." >&2
if [[ -f "/home/worker/.claude/.claude.json" ]]; then
    echo "Claude authentication found in persistent volume" >&2
else
    echo "Warning: Claude authentication not found at /home/worker/.claude/.claude.json" >&2
    echo "You may need to run the setup-claude-auth.sh script first" >&2
    echo "Available files in .claude directory:" >&2
    ls -la /home/worker/.claude/ >&2 || echo "Claude directory not accessible" >&2
fi

# Create completely isolated workspace following working implementation pattern
echo "Initializing git workspace..." >&2
echo "Creating clean isolated workspace from GitHub..." >&2

# Create workspace directory in container temp location (matches workflow-engine.sh)
mkdir -p /tmp/worker-shared
WORK_DIR="/tmp/worker-shared/workspace-\$(date +%s)"
echo "Creating workspace directory: \$WORK_DIR" >&2
mkdir -p "\$WORK_DIR"
cd "\$WORK_DIR"

# Initialize empty git repo (matches workflow-engine.sh exactly)
git init
git config user.name "plaiwoo-bot"
git config user.email "plaiwoo-bot@users.noreply.github.com"

# Configure git authentication for fetching from origin (matches workflow-engine.sh)
echo "Configuring git authentication..." >&2
git config credential.helper store
# Create credentials directory in /tmp instead of home directory to avoid permissions issues
mkdir -p /tmp/git-credentials
export GIT_CONFIG_GLOBAL=/tmp/gitconfig
git config --global credential.helper "store --file=/tmp/git-credentials/.git-credentials"
echo "https://plaiwoo-bot:\${BOT_APP_TOKEN}@github.com" > /tmp/git-credentials/.git-credentials

# Add GitHub remote (matches workflow-engine.sh)
git remote add origin "https://github.com/${this.config.project.owner}/${this.config.project.name}.git"

# Fetch staging branch from GitHub (clean, no uncommitted changes) - matches workflow-engine.sh
echo "Fetching clean ${this.config.project.workingBranch} branch from GitHub..." >&2
git fetch origin ${this.config.project.workingBranch} || {
    echo "Failed to fetch ${this.config.project.workingBranch} branch from GitHub" >&2
    exit 1
}

# Checkout clean staging branch (matches workflow-engine.sh)
echo "Checking out clean ${this.config.project.workingBranch} branch..." >&2
git checkout ${this.config.project.workingBranch} || {
    echo "Failed to checkout ${this.config.project.workingBranch} branch" >&2
    exit 1
}

# Verify we have clean staging (matches workflow-engine.sh)
CURRENT_BRANCH=\$(git branch --show-current)
if [[ "\$CURRENT_BRANCH" != "${this.config.project.workingBranch}" ]]; then
    echo "Failed to checkout ${this.config.project.workingBranch} branch, currently on: \$CURRENT_BRANCH" >&2
    exit 1
fi

# Ensure working directory is completely clean (matches workflow-engine.sh)
UNTRACKED_FILES=\$(git status --porcelain)
if [[ -n "\$UNTRACKED_FILES" ]]; then
    echo "Workspace should be clean but has changes: \$UNTRACKED_FILES" >&2
    exit 1
fi

echo "Workspace prepared on clean ${this.config.project.workingBranch} branch: \$(git log --oneline -1)" >&2

# Initialize MCP servers
${mcpInitCommands.join('\n')}

# Set environment variables for Claude Code execution
export ISSUE_NUMBER="${execution.issueNumber || ''}"
export PROMPT="${execution.prompt || ''}"

echo "Starting Claude Code execution..." >&2
echo "Prompt length: \${#PROMPT} characters" >&2

# Execute Claude Code with the full workflow prompt
echo "Step 7: Starting Claude Code execution with full workflow..." >&2

# Write full prompt to temporary file to handle multiline content properly
cat > /tmp/claude-prompt.txt << 'CLAUDE_PROMPT_EOF'
${fullPrompt.replace(/'/g, "'\\''")}
CLAUDE_PROMPT_EOF

# Execute Claude Code with the full workflow prompt
echo "Executing Claude Code with generated prompt..." >&2
claude --print \\
  --dangerously-skip-permissions \\
  --permission-mode bypassPermissions \\
  "\$(cat /tmp/claude-prompt.txt)"

echo "Step 8: Claude Code execution completed!" >&2
`;
  }

  private async showProgress(stream: NodeJS.ReadableStream, exec: any): Promise<void> {
    const spinner = ora('Executing Claude Code workflow...').start();
    
    // Animation frames for progress bar
    const frames = [
      '[████░░░░░░]',
      '[█████░░░░░]',
      '[██████░░░░]',
      '[███████░░░]',
      '[████████░░]',
      '[█████████░]',
      '[██████████]',
      '[░█████████]',
      '[░░████████]',
      '[░░░███████]',
      '[░░░░██████]',
      '[░░░░░█████]',
      '[░░░░░░████]',
      '[░░░░░░░███]',
      '[░░░░░░░░██]',
      '[░░░░░░░░░█]',
      '[░░░░░░░░░░]',
      '[█░░░░░░░░░]',
      '[██░░░░░░░░]',
      '[███░░░░░░░]',
    ];
    
    let frameIndex = 0;
    const startTime = Date.now();
    
    // Start animation
    const animationInterval = setInterval(() => {
      const elapsed = Date.now() - startTime;
      const minutes = Math.floor(elapsed / 60000);
      const seconds = Math.floor((elapsed % 60000) / 1000);
      
      spinner.text = `${frames[frameIndex]} ${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
      frameIndex = (frameIndex + 1) % frames.length;
    }, 300);

    return new Promise((resolve, reject) => {
      let output = '';
      
      stream.on('data', (chunk: Buffer) => {
        const text = chunk.toString();
        output += text;
        
        // Log container output to console for debugging
        const lines = text.trim().split('\n').filter(line => line);
        for (const line of lines) {
          console.log(`[CONTAINER] ${line}`);
        }
        logger.debug('Container output:', text.trim());
      });

      stream.on('end', async () => {
        clearInterval(animationInterval);
        
        try {
          const result = await exec.inspect();
          if (result.ExitCode === 0) {
            spinner.succeed('Workflow completed successfully!');
            resolve();
          } else {
            spinner.fail(`Workflow failed with exit code: ${result.ExitCode}`);
            reject(new Error(`Workflow execution failed: ${result.ExitCode}`));
          }
        } catch (error) {
          clearInterval(animationInterval);
          spinner.fail('Failed to get execution result');
          reject(error);
        }
      });

      stream.on('error', (error: Error) => {
        clearInterval(animationInterval);
        spinner.fail('Stream error during execution');
        reject(error);
      });
    });
  }

  private async cleanupContainer(containerId: string): Promise<void> {
    try {
      const container = this.docker.getContainer(containerId);
      await container.remove({ force: true });
      logger.debug(`Container ${containerId} cleaned up`);
    } catch (error: any) {
      logger.warning(`Failed to cleanup container: ${error?.message}`);
    }
    
    // Also cleanup temp directories
    if (this.tempDockerDir) {
      try {
        await fs.rm(this.tempDockerDir, { recursive: true, force: true });
        logger.debug(`Temp docker directory ${this.tempDockerDir} cleaned up`);
      } catch (error: any) {
        logger.warning(`Failed to cleanup temp docker directory: ${error?.message}`);
      }
    }
    
    if (this.tempScriptDir) {
      try {
        await fs.rm(this.tempScriptDir, { recursive: true, force: true });
        logger.debug(`Temp script directory ${this.tempScriptDir} cleaned up`);
      } catch (error: any) {
        logger.warning(`Failed to cleanup temp script directory: ${error?.message}`);
      }
    }
  }

  private async waitForBuild(stream: NodeJS.ReadableStream): Promise<void> {
    return new Promise((resolve, reject) => {
      stream.on('data', (chunk: Buffer) => {
        const text = chunk.toString();
        logger.debug('Build output:', text.trim());
      });

      stream.on('end', resolve);
      stream.on('error', reject);
    });
  }

  /**
   * Prepare MCP configuration for container
   */
  private async prepareMcpConfiguration(): Promise<string> {
    const enabledServers = this.mcpManager.getEnabledServers();
    
    if (enabledServers.length === 0) {
      logger.debug('No MCP servers enabled, skipping MCP configuration');
      return '';
    }

    // Create temporary directory for MCP config
    const tempDir = join(process.cwd(), '.tmp');
    await fs.mkdir(tempDir, { recursive: true });

    // Generate MCP configuration file
    const configPath = await this.mcpManager.generateMcpConfig(tempDir);
    
    logger.debug(`MCP configuration prepared for: ${enabledServers.join(', ')}`);
    return configPath;
  }
}