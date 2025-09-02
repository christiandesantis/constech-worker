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
import { cleanupManager } from '../utils/cleanup-manager.js';
import ora from 'ora';
import chalk from 'chalk';

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

export interface WorkflowResults {
  issueNumber?: number;
  issueTitle?: string;
  issueCreated?: boolean;
  prompt?: string;
  branchName?: string;
  containerId?: string;
  startTime: Date;
  endTime?: Date;
  success: boolean;
  error?: string;
  // These will be populated if we can extract them from git/github operations
  commitHash?: string;
  prNumber?: number;
  prUrl?: string;
  reviewer?: string;
  qualityChecks?: {
    typecheck?: boolean;
    lint?: boolean;
    build?: boolean;
  };
  summary?: string;
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
  private currentContainerId?: string;
  private cleanupFunction?: () => Promise<void>;
  private workflowResults!: WorkflowResults;

  constructor(config: Config, options: WorkflowOptions) {
    this.config = config;
    this.options = options;
    this.docker = new Docker();
    this.github = new GitHubClient(options.botToken);
    this.mcpManager = new McpManager(config);
    this.claudeMdParser = new ClaudeMdParser(process.cwd());
  }

  async execute(execution: ExecutionOptions): Promise<void> {
    // Initialize workflow state tracking
    this.workflowResults = {
      issueNumber: execution.issueNumber,
      prompt: execution.prompt,
      startTime: new Date(),
      success: false,
      reviewer: this.options.reviewer,
    };

    console.log(''); // Add space before workflow
    logger.info('🚀 Starting autonomous development workflow...');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');

    // Phase 1: GitHub Issue Management
    let issueNumber = execution.issueNumber;
    
    // If we have an existing issue, try to get its title
    if (issueNumber && !execution.createIssue) {
      try {
        const issue = await this.github.getIssue(this.config.project.owner, this.config.project.name, issueNumber);
        this.workflowResults.issueTitle = issue.title;
      } catch (error: any) {
        logger.debug(`Failed to fetch issue #${issueNumber} title: ${error?.message}`);
      }
    }
    
    if (execution.createIssue && execution.prompt) {
      const spinner = ora('Creating GitHub issue...').start();
      issueNumber = await this.createGitHubIssue(execution.prompt);
      spinner.succeed(`Created GitHub issue #${issueNumber}`);
      
      // Update workflow results - also get the issue title
      this.workflowResults.issueNumber = issueNumber;
      this.workflowResults.issueCreated = true;
      
      // Extract the issue title using same logic as createGitHubIssue
      if (execution.prompt!.includes('.')) {
        this.workflowResults.issueTitle = execution.prompt!.split('.')[0].trim();
      } else {
        const cleanPrompt = execution.prompt!.replace(/^(we need to |please |can you )/i, '');
        this.workflowResults.issueTitle = cleanPrompt.length > 50 ? cleanPrompt.substring(0, 50) : cleanPrompt;
      }
    }

    if (issueNumber && this.config.github?.projectId) {
      const spinner = ora('Setting issue status...').start();
      await this.setIssueStatus(issueNumber, 'inProgress');
      spinner.succeed(`Issue #${issueNumber} status set to "In Progress"`);
    }

    // Phase 2: Container Preparation
    console.log('\n📦 Preparing development environment...');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    const containerId = await this.prepareContainer();
    this.currentContainerId = containerId;
    
    // Track container ID
    this.workflowResults.containerId = containerId;
    
    // Register cleanup function for graceful shutdown
    this.cleanupFunction = async () => {
      await this.cleanupContainer(containerId);
    };
    cleanupManager.registerCleanup(this.cleanupFunction);
    
    logger.success('✅ Development environment ready');

    try {
      // Phase 3: Claude Code Execution
      console.log('\n🤖 Executing autonomous development...');
      console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
      await this.executeWorkflow(containerId, {
        issueNumber,
        prompt: execution.prompt,
      });

      // Mark workflow as successful and set end time
      this.workflowResults.success = true;
      this.workflowResults.endTime = new Date();

      // Display comprehensive summary instead of simple success message
      this.displayWorkflowSummary();

    } catch (error: any) {
      // Track error details
      this.workflowResults.success = false;
      this.workflowResults.endTime = new Date();
      this.workflowResults.error = error?.message || 'Unknown error occurred';
      
      // Still display summary with error info
      this.displayWorkflowSummary();
      
      // Re-throw to maintain existing error handling
      throw error;
    } finally {
      // Unregister cleanup function since we're handling it manually
      if (this.cleanupFunction) {
        cleanupManager.unregisterCleanup(this.cleanupFunction);
        this.cleanupFunction = undefined;
      }
      
      // Cleanup container
      await this.cleanupContainer(containerId);
      this.currentContainerId = undefined;
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
    try {
      // Build or pull container image
      const imageName = await this.ensureContainerImage();
      
      // Generate MCP configuration if needed
      const mcpConfigPath = await this.prepareMcpConfiguration();
      
      // Create container with proper configuration (match dispatch-worker.sh approach)
      // Mount repository as read-only like working implementation
      const containerBinds = [
        `${process.cwd()}:/workspace/repo:ro`, // Read-only mount like dispatch-worker.sh
        // Use persistent Docker volume for Claude authentication
        'constech-worker-claude:/home/worker/.claude:rw',
      ];
      
      // Add MCP config if available  
      if (mcpConfigPath) {
        containerBinds.push(`${mcpConfigPath}:/tmp/mcp-config.json:ro`);
      }
      
      // Generate descriptive container name with timestamp
      const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, -5);
      const containerName = `constech-worker-${this.config.project.name}-${timestamp}`;

      const container = await this.docker.createContainer({
        name: containerName,
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

      logger.success('✅ Container created successfully');
      return container.id;
      
    } catch (error) {
      logger.error('✖ Failed to prepare container');
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
    const spinner = ora('Building development container...').start();
    
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
      
      spinner.succeed(`✅ Development container ready`);
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

    // Create temporary directory for Docker build context in system temp
    const osModule = await import('os');
    const tempDir = await fs.mkdtemp(join(osModule.tmpdir(), 'constech-docker-'));
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
          `BOT_APP_TOKEN=${this.options.botToken}`, // Pass GitHub bot token
          `GITHUB_BOT_TOKEN=${this.options.botToken}`, // Alternative variable name
          `BOT_USER=${this.config.bot.username || 'constech-worker'}`, // Bot username
          `REVIEWER_USER=${this.options.reviewer || ''}`, // Pass reviewer to container
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

# Initialize workspace (read-only repo mount at /workspace/repo)
cd /workspace

# Verify Claude authentication
if [[ ! -f "/home/worker/.claude/.claude.json" ]]; then
    exit 1
fi

# Create isolated workspace
mkdir -p /tmp/worker-shared
WORK_DIR="/tmp/worker-shared/workspace-\$(date +%s)"
mkdir -p "\$WORK_DIR"
cd "\$WORK_DIR"

# Initialize empty git repo
git init >/dev/null 2>&1
git config user.name "${this.config.git.authorName}" >/dev/null 2>&1
git config user.email "${this.config.git.authorEmail}" >/dev/null 2>&1

# Configure git authentication
git config credential.helper store >/dev/null 2>&1
mkdir -p /tmp/git-credentials
export GIT_CONFIG_GLOBAL=/tmp/gitconfig
git config --global credential.helper "store --file=/tmp/git-credentials/.git-credentials" >/dev/null 2>&1
echo "https://\${BOT_USER}:\${BOT_APP_TOKEN}@github.com" > /tmp/git-credentials/.git-credentials

# Add GitHub remote
git remote add origin "https://github.com/${this.config.project.owner}/${this.config.project.name}.git" >/dev/null 2>&1

# Fetch and checkout branch
git fetch origin ${this.config.project.workingBranch} >/dev/null 2>&1 || exit 1
git checkout ${this.config.project.workingBranch} >/dev/null 2>&1 || exit 1

# Verify clean workspace
CURRENT_BRANCH=\$(git branch --show-current)
if [[ "\$CURRENT_BRANCH" != "${this.config.project.workingBranch}" ]]; then
    exit 1
fi

UNTRACKED_FILES=\$(git status --porcelain)
if [[ -n "\$UNTRACKED_FILES" ]]; then
    exit 1
fi

# Initialize MCP servers
${mcpInitCommands.join('\n')}

# Set environment variables
export ISSUE_NUMBER="${execution.issueNumber || ''}"
export PROMPT="${execution.prompt || ''}"

# Write prompt to file
cat > /tmp/claude-prompt.txt << 'CLAUDE_PROMPT_EOF'
${fullPrompt.replace(/'/g, "'\\''")}
CLAUDE_PROMPT_EOF

# Execute Claude Code
echo "\$(cat /tmp/claude-prompt.txt)" | CLAUDE_CONFIG_DIR=/home/worker/.claude claude \\
  --print \\
  --permission-mode bypassPermissions \\
  --dangerously-skip-permissions
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
        const text = chunk.toString('utf8');
        output += text;
        
        // Clean up Docker stream output - remove ALL control characters, ANSI codes, and weird characters
        let cleanText = text
          .replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F-\x9F]/g, '') // Remove control characters
          .replace(/\x1b\[[0-9;]*[a-zA-Z]/g, '') // Remove ANSI escape sequences
          .replace(/[\uFFF0-\uFFFF]/g, '') // Remove Unicode specials
          .replace(/^[\#\;\A\d\'\"\%\(\)]/g, '') // Remove leading weird characters
          .trim();
        
        const lines = cleanText.split('\n').filter(line => {
          const trimmed = line.trim();
          return trimmed && 
                 !trimmed.startsWith('Step ') && 
                 !trimmed.includes('Debug:') &&
                 !trimmed.match(/^[#;A\d'"%()\-\s]*$/); // Skip lines with only weird chars
        });
        
        // Skip displaying container output to prevent overlapping with spinner
        // Container output is already captured in logger.debug below
        
        logger.debug('Container output:', cleanText.trim());
      });

      stream.on('end', async () => {
        clearInterval(animationInterval);
        
        try {
          const result = await exec.inspect();
          
          // Parse the output to extract workflow results
          this.parseWorkflowResults(output);
          
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

  private parseWorkflowResults(containerOutput: string): void {
    try {
      // Extract branch name
      const branchMatch = containerOutput.match(/(?:Created|Checked out|Switching to) (?:branch )?['"`]?([a-zA-Z0-9\-_/]+)['"`]?/i);
      if (branchMatch) {
        this.workflowResults.branchName = branchMatch[1];
      }

      // Extract commit hash
      const commitMatch = containerOutput.match(/(?:commit|Commit) ([a-f0-9]{7,40})/i);
      if (commitMatch) {
        this.workflowResults.commitHash = commitMatch[1];
      }

      // Extract PR number and URL
      const prMatch = containerOutput.match(/pull request.*?#(\d+)/i) || 
                     containerOutput.match(/PR.*?#(\d+)/i);
      if (prMatch) {
        this.workflowResults.prNumber = parseInt(prMatch[1]);
      }

      const prUrlMatch = containerOutput.match(/(https:\/\/github\.com\/[^\/]+\/[^\/]+\/pull\/\d+)/);
      if (prUrlMatch) {
        this.workflowResults.prUrl = prUrlMatch[1];
      }

      // Extract quality check results
      const qualityChecks: any = {};
      
      // Check for typecheck results
      if (containerOutput.includes('pnpm typecheck') || containerOutput.includes('npm run typecheck')) {
        qualityChecks.typecheck = !containerOutput.includes('typecheck failed') && 
                                  !containerOutput.includes('Type checking failed');
      }
      
      // Check for lint results  
      if (containerOutput.includes('pnpm check') || containerOutput.includes('pnpm lint')) {
        qualityChecks.lint = !containerOutput.includes('lint failed') && 
                            !containerOutput.includes('Linting failed');
      }
      
      // Check for build results
      if (containerOutput.includes('pnpm build') || containerOutput.includes('npm run build')) {
        qualityChecks.build = !containerOutput.includes('build failed') && 
                             !containerOutput.includes('Build failed');
      }

      if (Object.keys(qualityChecks).length > 0) {
        this.workflowResults.qualityChecks = qualityChecks;
      }

      // Simplify summary extraction - look for common patterns from Claude output
      // Since we're not seeing summaries, let's just skip this for now to avoid delays
      // and focus on the basic info that works (branch, commit, PR)
      
      // Uncomment below if you want to try summary extraction:
      /*
      const summaryPatterns = [
        /summary:\s*(.*)/i,
        /completed:\s*(.*)/i, 
        /implemented:\s*(.*)/i,
        /added:\s*(.*)/i,
        /fixed:\s*(.*)/i
      ];
      
      for (const pattern of summaryPatterns) {
        const match = containerOutput.match(pattern);
        if (match && match[1].trim().length > 10) {
          this.workflowResults.summary = match[1].trim().substring(0, 200);
          break;
        }
      }
      */

      logger.debug('Parsed workflow results:', JSON.stringify(this.workflowResults, null, 2));
    } catch (error: any) {
      logger.debug('Failed to parse workflow results:', error.message);
    }
  }

  private displayWorkflowSummary(): void {
    const results = this.workflowResults;
    const duration = results.endTime 
      ? Math.round((results.endTime.getTime() - results.startTime.getTime()) / 1000)
      : 0;

    console.log('\n' + '━'.repeat(80));
    console.log(chalk.cyan.bold('🤖 Autonomous Development Summary'));
    console.log('━'.repeat(80));

    if (!results.success && results.error) {
      console.log(chalk.red(`❌ Workflow failed: ${results.error}`));
      console.log('━'.repeat(80) + '\n');
      return;
    }

    // Task Information
    console.log(chalk.yellow.bold('🎯 Task:'));
    if (results.issueNumber) {
      const issueDisplay = results.issueTitle 
        ? `Issue #${results.issueNumber}: "${results.issueTitle}"${results.issueCreated ? ' (created)' : ''}`
        : `Issue #${results.issueNumber}${results.issueCreated ? ' (created)' : ''}`;
      console.log(`   • ${issueDisplay}`);
    } else if (results.prompt) {
      const truncatedPrompt = results.prompt.length > 100 
        ? results.prompt.substring(0, 100) + '...'
        : results.prompt;
      console.log(`   • Custom Task: "${truncatedPrompt}"`);
    }

    // Execution Details
    console.log(chalk.blue.bold('\n⚡ Execution:'));
    console.log(`   • Duration: ${duration}s`);
    console.log(`   • Container: ${results.containerId?.substring(0, 12) || 'unknown'}`);
    if (results.reviewer) {
      console.log(`   • Reviewer: ${results.reviewer}`);
    }

    // Success Indicators
    console.log(chalk.green.bold('\n✅ Results:'));
    console.log(`   • Status: ${results.success ? 'Completed Successfully' : 'Failed'}`);
    
    if (results.branchName) {
      console.log(`   • Branch: ${results.branchName}`);
    }
    if (results.commitHash) {
      console.log(`   • Commit: ${results.commitHash.substring(0, 8)}`);
    }
    if (results.prNumber && results.prUrl) {
      console.log(`   • Pull Request: #${results.prNumber}`);
      console.log(`   • PR URL: ${results.prUrl}`);
    }

    // Work Summary
    if (results.summary) {
      console.log(chalk.blue.bold('\n📝 Work Summary:'));
      console.log(`   • ${results.summary}`);
    }

    // Quality Checks
    if (results.qualityChecks) {
      console.log(chalk.magenta.bold('\n🔍 Quality Checks:'));
      const checks = results.qualityChecks;
      if (checks.typecheck !== undefined) {
        console.log(`   • TypeScript: ${checks.typecheck ? '✅' : '❌'}`);
      }
      if (checks.lint !== undefined) {
        console.log(`   • Linting: ${checks.lint ? '✅' : '❌'}`);
      }
      if (checks.build !== undefined) {
        console.log(`   • Build: ${checks.build ? '✅' : '❌'}`);
      }
    }

    console.log(chalk.gray('\n💡 Autonomous development workflow completed with Claude Code in isolated container'));
    console.log('━'.repeat(80) + '\n');
  }


  private async cleanupContainer(containerId: string): Promise<void> {
    if (!containerId) {
      logger.debug('No container ID provided for cleanup');
      return;
    }

    try {
      const container = this.docker.getContainer(containerId);
      
      // First, try to get container status
      let containerInfo;
      try {
        containerInfo = await container.inspect();
        logger.debug(`Container ${containerId.slice(0, 12)} status: ${containerInfo.State.Status}`);
      } catch (error: any) {
        if (error.statusCode === 404) {
          logger.debug(`Container ${containerId.slice(0, 12)} not found, already removed`);
          return;
        }
        throw error;
      }

      // Stop container gracefully if running
      if (containerInfo.State.Running) {
        logger.debug(`Stopping container ${containerId.slice(0, 12)}...`);
        try {
          await container.stop({ t: 10 }); // 10 second timeout
          logger.debug(`Container ${containerId.slice(0, 12)} stopped successfully`);
        } catch (error: any) {
          logger.warning(`Failed to stop container gracefully: ${error?.message}`);
          // Continue to force removal
        }
      }

      // Remove container
      logger.debug(`Removing container ${containerId.slice(0, 12)}...`);
      await container.remove({ force: true });
      logger.debug(`Container ${containerId.slice(0, 12)} removed successfully`);
      
    } catch (error: any) {
      if (error.statusCode === 404) {
        logger.debug(`Container ${containerId.slice(0, 12)} not found, already removed`);
      } else {
        logger.warning(`Failed to cleanup container ${containerId.slice(0, 12)}: ${error?.message}`);
        // Notify user of potential orphaned containers
        console.error(`⚠️  Container cleanup failed. You may need to manually remove container: ${containerId.slice(0, 12)}`);
        console.error(`   Run: docker rm -f ${containerId.slice(0, 12)}`);
      }
    }
    
    // Cleanup temp directories
    await this.cleanupTempDirectories();
  }

  private async cleanupTempDirectories(): Promise<void> {
    if (this.tempDockerDir) {
      try {
        await fs.rm(this.tempDockerDir, { recursive: true, force: true });
        logger.debug(`Temp docker directory cleaned up`);
      } catch (error: any) {
        logger.warning(`Failed to cleanup temp docker directory: ${error?.message}`);
      }
      this.tempDockerDir = undefined;
    }
    
    if (this.tempScriptDir) {
      try {
        await fs.rm(this.tempScriptDir, { recursive: true, force: true });
        logger.debug(`Temp script directory cleaned up`);
      } catch (error: any) {
        logger.warning(`Failed to cleanup temp script directory: ${error?.message}`);
      }
      this.tempScriptDir = undefined;
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

    // Create temporary directory for MCP config in system temp (not project directory)
    const osModule = await import('os');
    const tempDir = await fs.mkdtemp(join(osModule.tmpdir(), 'constech-mcp-'));

    // Generate MCP configuration file
    const configPath = await this.mcpManager.generateMcpConfig(tempDir);
    
    // Store temp dir for cleanup
    this.tempDockerDir = tempDir;
    
    logger.debug(`MCP configuration prepared for: ${enabledServers.join(', ')}`);
    return configPath;
  }
}