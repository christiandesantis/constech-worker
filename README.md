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
2. **Container Orchestration**: Spins up isolated Docker containers with Claude Code
3. **Autonomous Development**: Claude Code implements features following your project patterns
4. **Quality Assurance**: Runs configured quality checks (typecheck, lint, build)
5. **PR Management**: Creates pull requests with proper reviewers and project status
6. **Project Updates**: Automatically updates GitHub project boards

## 📋 Requirements

- **Node.js** 20+ 
- **Docker** (running)
- **GitHub CLI** (`gh`) authenticated
- **Claude Code** authenticated
- **Git repository** with GitHub remote

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

### Environment Variables

Create or update your `.env` file:

```bash
# GitHub bot token (required)
GITHUB_BOT_TOKEN=ghp_your_bot_token_here

# Default reviewer (optional)
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
    "projectId": "PVT_kwDODJAhwc4A4gK5",
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
  }
}
```

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

1. **Authenticate Claude Code**:
   ```bash
   claude
   # Follow authentication prompts
   ```

2. **Verify Authentication**:
   ```bash
   constech-worker doctor
   ```

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
# Re-authenticate Claude Code
claude
# Follow the prompts
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

- Built on the foundation of the Plaiwoo autonomous development system
- Powered by [Claude Code](https://claude.ai/code) for AI-driven development
- Utilizes [GitHub CLI](https://cli.github.com/) for seamless GitHub integration

---

**Made with ❤️ by the Constech team**