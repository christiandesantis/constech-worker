# Constech Worker

> **Autonomous GitHub project management with Claude Code integration**

Constech Worker is an open-source CLI tool that automates GitHub workflows by combining issue management, pull request automation, and Claude Code execution in isolated Docker containers. Transform any repository into an autonomous development environment with minimal setup.

[![npm version](https://badge.fury.io/js/constech-worker.svg)](https://badge.fury.io/js/constech-worker)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)

## 🚀 Quick Start

```bash
# Install globally
npm install -g constech-worker

# Navigate to your project
cd your-project

# Initialize configuration (auto-detects everything)
constech-worker init

# Start autonomous development
constech-worker dispatch --issue 42
# or
constech-worker dispatch --prompt "Add user authentication" --create-issue
```

## ✨ Features

- **🤖 Autonomous Development**: Claude Code executes complete development workflows
- **📋 GitHub Integration**: Seamless issue, PR, and project management
- **🐳 Container Isolation**: Secure execution in isolated Docker environments
- **🔍 Auto-Discovery**: Automatically detects project settings and GitHub configuration
- **⚡ Zero Setup**: Works out-of-the-box with minimal configuration
- **🎯 Project Agnostic**: Use across any repository without modification
- **📊 Progress Tracking**: Real-time workflow progress with animations
- **🔐 Bot Authentication**: Supports GitHub bot accounts for proper reviewer assignment
- **🛠️ MCP Integration**: Enhanced Claude Code with GitHub, Semgrep, and Ref MCP servers
- **📝 Hybrid CLAUDE.md**: Smart instruction filtering for optimal host/container experience

## 🛠️ How It Works

1. **Issue Processing**: Creates or processes GitHub issues with smart title extraction
2. **Container Orchestration**: Spins up isolated Docker containers using devcontainer configuration
3. **Git Isolation**: Creates clean workspace in container from fresh GitHub repository clone
4. **Persistent Authentication**: Uses Docker volume for Claude Code authentication across executions  
5. **Autonomous Development**: Claude Code implements features following your project patterns
6. **Quality Assurance**: Runs configured quality checks (typecheck, lint, biome check, build)
7. **PR Management**: Creates pull requests with proper reviewers and project status
8. **Project Updates**: Automatically updates GitHub project boards

### Container Architecture

- **Base Image**: Uses your project's `.devcontainer/Dockerfile` for consistent development environment
- **Git Isolation**: Creates isolated workspace in `/tmp/worker-shared/workspace-*` from clean GitHub clone
- **Authentication**: Persistent Docker volume (`constech-worker-claude`) maintains Claude Code authentication
- **User Context**: Runs as `worker` user with `/home/worker/.claude` configuration directory
- **Repository Access**: Read-only mount of host repository at `/workspace/repo`
- **Complete Isolation**: Host repository remains unchanged during container execution

## 📋 Requirements

- **Node.js** 20+ 
- **Docker** (running) with persistent volume support
- **GitHub CLI** (`gh`) authenticated
- **Claude Code** authenticated with persistent Docker volume setup
- **Git repository** with GitHub remote
- **`.devcontainer/` configuration** (optional but strongly recommended for consistent development environment)

## 🏗️ Installation & Setup

### Global Installation
```bash
npm install -g constech-worker
```

### Project Setup
```bash
# In your project directory
constech-worker init
```

The `init` command will:
- Auto-detect repository settings
- Discover GitHub projects and fields
- Create `.constech-worker.json` configuration
- Validate system requirements

### .devcontainer Setup (Required)

Constech Worker uses Docker containers with your project's `.devcontainer` configuration for consistent, isolated development environments. 

#### **First-time Setup**: Copy Templates to Your Project

If you don't have a `.devcontainer` directory in your project, copy the templates:

```bash
# From your project root directory
mkdir -p .devcontainer

# Copy templates from constech-worker installation
cp "$(npm root -g)/constech-worker/templates/devcontainer/"* .devcontainer/

# Verify files were copied
ls -la .devcontainer/
# Should show: devcontainer.json, Dockerfile
```

#### **Template Files Included**:

**`.devcontainer/devcontainer.json`**: Container configuration with:
- Worker user setup (`remoteUser: "worker"`)
- Persistent Docker volume for Claude authentication
- Node.js memory optimization
- PNPM configuration for frontend projects

**`.devcontainer/Dockerfile`**: Container environment with:
- Node.js 20 base image
- Claude Code installation
- GitHub MCP server (enabled by default)
- Development tools (git, gh, jq, etc.)
- Proper user permissions and environment

#### **Customization**:

**Timezone**: Update in `devcontainer.json`:
```json
"args": {
  "TZ": "${localEnv:TZ:America/Your_Timezone}"
}
```

**Additional MCP Servers**: Uncomment in `Dockerfile`:
```dockerfile
# Optional MCP servers (uncomment to enable):
RUN npm install -g @modelcontextprotocol/server-semgrep
RUN npm install -g @modelcontextprotocol/server-ref
```

Then update your `.constech-worker.json`:
```json
{
  "docker": {
    "mcpServers": {
      "github": true,
      "ref": true,      // Enable if uncommented above  
      "semgrep": true   // Enable if uncommented above
    }
  }
}
```

### Environment Variables

Create or update your `.env` file:

```bash
# GitHub bot token (required)
GITHUB_BOT_TOKEN=ghp_your_bot_token_here

# Default reviewer (required)
REVIEWER_USER=your-github-username

# Custom configuration (optional)
CONSTECH_CONFIG_PATH=.constech-worker.json
```

## 🎯 Usage

### Basic Commands

```bash
# Check system health and configuration
constech-worker doctor

# Work on existing issue
constech-worker dispatch --issue 42

# Work on custom prompt
constech-worker dispatch --prompt "Add dark mode toggle"

# Create issue first, then work on it
constech-worker dispatch --prompt "Implement user authentication" --create-issue

# Update configuration
constech-worker configure github.projectId PVT_xyz123
```

### --create-issue Behavior

When using the `--create-issue` flag with a prompt, constech-worker automatically extracts the issue title and description:

**Title Extraction**: The first sentence (before the first dot `.`) becomes the issue title
**Description**: Everything after the first dot becomes the issue description (the dot is removed)

**Example**:
```bash
constech-worker dispatch --prompt "Add user authentication system. Include login/logout functionality, password hashing, and session management." --create-issue
```

**Results in**:
- **Issue Title**: "Add user authentication system"  
- **Issue Description**: "Include login/logout functionality, password hashing, and session management."

**Fallback**: If no dot is found, the first 50 characters become the title and the full prompt becomes the description.

### Advanced Usage

```bash
# Use custom reviewer
constech-worker dispatch --issue 42 --reviewer alice

# Skip issue creation validation
constech-worker dispatch --prompt "Quick fix" --force

# Use specific branch
constech-worker dispatch --issue 42 --base main

# Custom container settings
constech-worker dispatch --issue 42 --container-memory 4g
```

### Hybrid CLAUDE.md Instructions

Constech Worker supports a **hybrid approach** for CLAUDE.md instructions that work optimally in both host and container environments:

#### Magic Comments System
Use magic comments to wrap GitHub workflow sections that should be **excluded from container execution**:

```markdown
# CLAUDE.md

## Development Guidelines
- Follow code conventions
- Write tests for new features  
- Use TypeScript strict mode

<!-- CONSTECH-WORKER-START -->
### GitHub Workflow
1. Create feature branch: `git checkout -b feat/issue-123`
2. Create PR: `gh pr create --base main --title "feat: description"`
3. Update project status in GitHub Projects
<!-- CONSTECH-WORKER-END -->

## Architecture
- Use React functional components
- Implement proper error boundaries
```

#### How It Works
- **Host Claude Code**: Sees the complete CLAUDE.md with all workflow instructions
- **Container Claude Code**: Receives filtered version with only project context
- **Result**: Both environments get exactly what they need for optimal performance

#### Why This Approach?
- **Host Environment**: Needs complete GitHub workflow instructions for manual development
- **Container Environment**: Should focus on implementation, not GitHub operations (handled by worker)
- **Single Source**: Maintain one CLAUDE.md file instead of separate versions

## ⚙️ Configuration

### Auto-Generated Configuration (`.constech-worker.json`)

```json
{
  "project": {
    "owner": "your-org",
    "name": "your-repo",
    "defaultBranch": "main",
    "workingBranch": "staging"
  },
  "github": {
    "projectId": "PVT_kwDOExample123",
    "statusFieldId": "PVTSSF_lADODJAhwc4A4gK5zgtdZMI",
    "statusOptions": {
      "backlog": "f75ad846",
      "ready": "61e4505c",
      "inProgress": "47fc9ee4",
      "inReview": "df73e18b",
      "done": "98236657"
    }
  },
  "bot": {
    "tokenEnvVar": "GITHUB_BOT_TOKEN",
    "username": "your-bot"
  },
  "workflow": {
    "qualityChecks": ["pnpm typecheck", "pnpm check", "pnpm build"],
    "packageManager": "pnpm",
    "reviewerEnvVar": "REVIEWER_USER"
  },
  "git": {
    "authorName": "your-bot",
    "authorEmail": "your-bot@users.noreply.github.com"
  }
}
```

### Git Configuration

The `git` section in the configuration is crucial for CI/CD compatibility:

```json
{
  "git": {
    "authorName": "your-bot",
    "authorEmail": "your-bot@users.noreply.github.com"
  }
}
```

**Important**: The email address must be associated with your GitHub bot account to ensure:
- ✅ Vercel deployments work correctly
- ✅ GitHub shows proper commit attribution
- ✅ CI/CD systems recognize the commits
- ✅ Commit signing and verification work

**Recommended format**: `{bot-username}@users.noreply.github.com`

### Environment Variables

| Variable | Description | Required |
|----------|-------------|----------|
| `GITHUB_BOT_TOKEN` | GitHub Personal Access Token for bot | Yes |
| `REVIEWER_USER` | Default reviewer username | No |
| `CONSTECH_CONFIG_PATH` | Custom config file path | No |

## 🔧 Bot Setup

### GitHub Bot Account Setup

1. **Create Bot Account**:
   - Create a GitHub account for your bot (e.g., `my-org-bot`)
   - Add as collaborator to your repositories with **Write** access

2. **Generate Personal Access Token**:
   - Go to bot account Settings → Developer settings → Personal access tokens
   - Create token with these scopes:
     - `repo` (Full control of private repositories)
     - `read:org` (Read org and team membership)  
     - `project` (Read and write access to projects)
     - `workflow` (Update GitHub Action workflows)

3. **Configure Environment**:
   ```bash
   # In your .env file
   GITHUB_BOT_TOKEN=ghp_your_bot_token_here
   ```

### Claude Code Setup

Claude Code authentication is handled through a **persistent Docker volume** that maintains your authentication across container executions.

1. **Authenticate Claude Code** (one-time setup):
   ```bash
   claude
   # Follow authentication prompts to authenticate on your host system
   ```

2. **Set up Docker Volume Authentication**:
   ```bash
   # If using a project with existing setup scripts
   ./scripts/setup-claude-auth.sh
   
   # Or manually create the persistent volume (first time setup)
   docker volume create constech-worker-claude
   
   # Then run an interactive container to authenticate Claude Code
   docker run -it --rm \
     --mount source=constech-worker-claude,target=/home/worker/.claude,type=volume \
     -e CLAUDE_CONFIG_DIR=/home/worker/.claude \
     --user worker \
     node:20 bash -c "
       # Install Claude Code temporarily for authentication
       npm install -g @anthropic-ai/claude-code &&
       claude --version &&
       echo 'Run: claude' &&
       echo 'Follow prompts to authenticate, then exit' &&
       bash
     "
   ```

3. **Verify Authentication**:
   ```bash
   constech-worker doctor
   ```

**How Authentication Works:**
- Claude Code authentication is stored in persistent Docker volume `constech-worker-claude`
- Authentication persists across all container executions
- No need to re-authenticate for each workflow run
- Container runs with `worker` user and `/home/worker/.claude` config directory

## 📖 Workflow Examples

### Feature Development
```bash
# Create and work on a feature
constech-worker dispatch --prompt "Add user profile settings page. Include avatar upload, email preferences, and notification settings." --create-issue

# This will:
# 1. Create GitHub issue: "feat: Add user profile settings page"
# 2. Create feature branch from staging
# 3. Implement the feature with Claude Code
# 4. Run quality checks (typecheck, lint, build)  
# 5. Create PR with proper reviewer assignment
# 6. Update GitHub project status
```

### Bug Fix
```bash
# Work on existing bug issue
constech-worker dispatch --issue 123

# Claude Code will:
# 1. Analyze the issue description
# 2. Create fix branch from staging
# 3. Implement the bug fix
# 4. Run tests and quality checks
# 5. Create PR targeting staging branch
```

### Quick Task
```bash
# Simple task without issue creation
constech-worker dispatch --prompt "Update README with new installation instructions"

# This creates a feature branch and implements the changes directly
```

## 🔍 Troubleshooting

### Common Issues

**❌ Docker not running**
```bash
# Check Docker status
docker info
# Start Docker if needed
```

**❌ GitHub CLI not authenticated**
```bash
# Authenticate with your main account
gh auth login
# Verify authentication  
gh api user --jq '.login'
```

**❌ Bot token invalid**
```bash
# Test bot token
GITHUB_TOKEN="your_bot_token" gh api user --jq '.login'
# Should return your bot username
```

**❌ Claude Code not authenticated**
```bash
# Re-authenticate Claude Code on host
claude
# Follow the prompts

# Check Docker volume authentication
docker run --rm --mount source=constech-worker-claude,target=/home/worker/.claude,type=volume alpine ls -la /home/worker/.claude/
# Should show .claude.json and other authentication files

# If volume is empty, you may need to run setup script
./scripts/setup-claude-auth.sh  # If available in your project
```

**❌ Container execution fails**
```bash
# Check Docker volume exists
docker volume ls | grep constech-worker-claude

# Check container logs
docker logs $(docker ps -q -l)

# Verify devcontainer can be built
constech-worker doctor
```

**❌ .devcontainer files missing or outdated**
```bash
# Copy latest templates from constech-worker
cp "$(npm root -g)/constech-worker/templates/devcontainer/"* .devcontainer/

# Verify templates are up to date with working configuration
# Template files should match the working plaiwoo-frontend setup
```

**❌ MCP servers not working**
```bash
# MCP configs are generated dynamically - no need for static mcp-configs/ directory
# Configuration is controlled through .constech-worker.json:
constech-worker configure docker.mcpServers.github true
constech-worker configure docker.mcpServers.semgrep false
constech-worker configure docker.mcpServers.ref false
```

**❌ Git isolation not working**
```bash
# Verify you're on the correct branch on host
git branch --show-current

# Check if workspace isolation is working
# Host repository should remain unchanged during execution
```

### Debug Commands

```bash
# Check system health
constech-worker doctor

# Verbose logging
DEBUG=constech-worker:* constech-worker dispatch --issue 42

# Validate configuration
constech-worker configure --validate
```

### Getting Help

```bash
# Command help
constech-worker --help
constech-worker dispatch --help

# Version info
constech-worker --version
```

## 📚 Documentation

- [Quick Start Guide](./docs/QUICK_START.md) - Get started in 5 minutes
- [MCP Setup Guide](./docs/MCP_SETUP.md) - Configure Model Context Protocol servers
- [Hybrid CLAUDE.md Guide](#hybrid-claudemd-instructions) - Optimize instructions for host/container environments
- [Usage Examples](./USAGE_EXAMPLES.md) - Real-world usage scenarios
- [Configuration Reference](./templates/.constech-worker.json) - Full configuration options

## 🤝 Contributing

1. Fork the repository
2. Create feature branch: `git checkout -b feat/amazing-feature`
3. Make changes and test: `pnpm test`
4. Commit changes: `git commit -m 'feat: add amazing feature'`
5. Push to branch: `git push origin feat/amazing-feature`
6. Open Pull Request

## 📄 License

MIT License - see [LICENSE](LICENSE) file for details.

## 🙏 Acknowledgments

- Powered by [Claude Code](https://claude.ai/code) for AI-driven development
- Utilizes [GitHub CLI](https://cli.github.com/) for seamless GitHub integration
- Built with Docker containers for secure, isolated execution environments

---

**Made by Christian De Santis - [constech.dev](https://constech.dev)**