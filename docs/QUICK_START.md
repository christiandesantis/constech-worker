# Quick Start Guide

This guide will get you up and running with Constech Worker in under 5 minutes.

## Prerequisites

Before starting, ensure you have:
- **Node.js 20+** installed
- **Docker** running on your system with volume support
- **GitHub CLI** (`gh`) installed and authenticated
- **Claude Code** installed and authenticated
- A **GitHub repository** you want to automate
- **Devcontainer** configuration (`.devcontainer/`) in your project (optional but recommended)

## Step 1: Install Constech Worker

```bash
npm install -g constech-worker
```

Verify installation:
```bash
constech-worker --version
```

## Step 2: Set Up Your Environment

### GitHub Bot Account (Recommended)

For the best experience, create a dedicated bot account:

1. **Create Bot Account**: Create a new GitHub account (e.g. `my-org-bot`)
2. **Add as Collaborator**: Add the bot to your repository with **Write** permissions
3. **Create Token**: Generate a Personal Access Token with these scopes:
   - `repo` (Full control of private repositories) 
   - `read:org` (Read org and team membership)
   - `project` (Read and write access to projects)
   - `workflow` (Update GitHub Action workflows)

### Environment Variables

Create or update your `.env` file:

```bash
# Required: GitHub bot token
GITHUB_BOT_TOKEN=ghp_your_bot_token_here

# Optional: Default reviewer  
REVIEWER_USER=your-github-username
```

## Step 3: Initialize Your Project

Navigate to your project directory and run:

```bash
constech-worker init
```

This will:
- ✅ Auto-detect your repository settings
- ✅ Discover GitHub projects and field configurations  
- ✅ Create `.constech-worker.json` configuration file
- ✅ Validate system requirements

## Step 4: Health Check

Verify everything is working:

```bash
constech-worker doctor
```

This checks:
- Node.js version
- Docker status and volume support
- GitHub CLI authentication  
- Claude Code authentication (persistent volume)
- Devcontainer configuration
- Configuration validity
- Environment variables

## Step 5: Your First Autonomous Workflow

### Option A: Work on Existing Issue
```bash
constech-worker dispatch --issue 42
```

### Option B: Create Issue and Work on It
```bash
constech-worker dispatch --prompt "Add user profile settings page with avatar upload and email preferences" --create-issue
```

### Option C: Custom Development Task
```bash
constech-worker dispatch --prompt "Refactor authentication middleware to support JWT tokens"
```

## What Happens Next?

The autonomous workflow will:

1. **🐳 Prepare Container** using your devcontainer configuration
2. **🔐 Load Authentication** from persistent Docker volume
3. **📂 Create Isolated Workspace** from clean GitHub repository clone
4. **🌿 Create Feature Branch** from your working branch (usually `staging`)
5. **🤖 Execute Claude Code** with complete project context and instructions
6. **⚙️ Run Quality Checks** (typecheck, lint, build)
7. **📝 Create Pull Request** with proper reviewers assigned
8. **📋 Update Project Status** to "In Review"

## Example Output

```bash
$ constech-worker dispatch --prompt "Add dark mode toggle" --create-issue

🚀 Starting Constech Worker dispatch...
📋 Workflow: Create issue + Development
💭 Prompt: "Add dark mode toggle"
✓ Created issue #123: feat: Add dark mode toggle
✓ Container prepared and ready
🔄 [██████████] 02:15
✓ Claude Code execution completed
✓ Workflow completed successfully!

✅ SUCCESS 
✅ Autonomous development workflow completed
📋 Check your GitHub repository for:
   • New feature branch
   • Pull request with proper reviewers  
   • Updated project status
   • Created GitHub issue
```

## Next Steps

- **Review the PR**: Check the generated pull request and code changes
- **Customize Configuration**: Run `constech-worker configure --list` to see options
- **Read Documentation**: Explore advanced features in the full documentation
- **Set Up CI/CD**: Configure automated testing and deployment

## Troubleshooting

### Common Issues

**❌ "Docker not running"**
```bash
# Start Docker Desktop or Docker daemon
docker info  # Should show system info
```

**❌ "GITHUB_BOT_TOKEN not set"**
```bash
# Add to your .env file
echo "GITHUB_BOT_TOKEN=ghp_your_token" >> .env
```

**❌ "Configuration validation failed"**
```bash
# Reset and reinitialize
constech-worker configure --reset
constech-worker init
```

**❌ "Claude Code not authenticated"**
```bash
# Re-authenticate Claude Code on host
claude
# Follow the authentication prompts

# Check Docker volume contains authentication
docker volume ls | grep constech-worker-claude
docker run --rm --mount source=constech-worker-claude,target=/home/worker/.claude,type=volume alpine ls -la /home/worker/.claude/

# If volume is empty, you may need to set up authentication
# Check if your project has setup scripts available
```

### Get Help

```bash
# System health check
constech-worker doctor

# View configuration
constech-worker configure --list

# Command help
constech-worker --help
constech-worker dispatch --help
```

---

🎉 **Congratulations!** You now have autonomous GitHub development set up. Your repository will handle feature development, testing, and PR creation automatically.