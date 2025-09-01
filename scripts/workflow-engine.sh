#!/bin/bash
set -euo pipefail

# Autonomous Development Workflow Engine
# Executes Claude Code directly within the container for complete isolation
# Supports both issue-based and prompt-only workflows with mounted credentials

# Color codes for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Logging functions
log_info() {
    echo -e "${BLUE}[WORKFLOW]${NC} $1" | tee -a /tmp/worker-logs/workflow.log
}

log_success() {
    echo -e "${GREEN}[WORKFLOW]${NC} $1" | tee -a /tmp/worker-logs/workflow.log
}

log_warning() {
    echo -e "${YELLOW}[WORKFLOW]${NC} $1" | tee -a /tmp/worker-logs/workflow.log
}

log_error() {
    echo -e "${RED}[WORKFLOW]${NC} $1" | tee -a /tmp/worker-logs/workflow.log
}

# Initialize logging in container temp directory
mkdir -p /tmp/worker-logs
echo "Workflow started at $(date)" > /tmp/worker-logs/workflow.log

WORKFLOW_TYPE=${1:-"unknown"}

log_info "Starting autonomous development workflow"
log_info "Workflow type: $WORKFLOW_TYPE"

# No need to validate directory - we'll create our own workspace from GitHub

# Prepare Claude Code system prompt based on workflow type
SYSTEM_PROMPT=""
if [[ "$WORKFLOW_TYPE" == "issue" ]]; then
    if [[ -z "${ISSUE_NUMBER:-}" ]]; then
        log_error "ISSUE_NUMBER required for issue workflow"
        exit 1
    fi
    
    CUSTOM_CONTEXT=""
    if [[ -n "${PROMPT:-}" ]]; then
        CUSTOM_CONTEXT="Additional context: $PROMPT"
    fi
    
    SYSTEM_PROMPT="You are an autonomous development worker. Follow the complete CLAUDE.md workflow:

IMPORTANT: You are starting on a clean, up-to-date staging branch. Verify with \`git branch\` and \`git status\`.

1. Work on GitHub issue #$ISSUE_NUMBER
2. Create feature branch from staging (git checkout -b feat/$ISSUE_NUMBER-description)
3. Implement the solution following project conventions
4. Run quality checks (typecheck, check, build)
5. Use /review for code review
6. Create PR using bot authentication with BASE BRANCH: staging (NOT main)
7. Set proper project status

CRITICAL: When creating PR, use --base staging (NOT --base main). All PRs target staging branch.

$CUSTOM_CONTEXT

Complete the entire workflow autonomously without asking for confirmation."
    
    log_info "Working on issue #$ISSUE_NUMBER"
    
elif [[ "$WORKFLOW_TYPE" == "prompt" ]]; then
    if [[ -z "${PROMPT:-}" ]]; then
        log_error "PROMPT required for prompt workflow"
        exit 1
    fi
    
    SYSTEM_PROMPT="You are an autonomous development worker. Complete this development task:

Task: $PROMPT

IMPORTANT: You are starting on a clean, up-to-date staging branch. Verify with \`git branch\` and \`git status\`.

Follow these steps:
1. Create feature branch from staging (git checkout -b feat/prompt-based-description)
2. Implement the solution following project conventions
3. Run quality checks (typecheck, check, build)
4. Use /review for code review
5. Create PR using bot authentication with BASE BRANCH: staging (NOT main)

CRITICAL: When creating PR, use --base staging (NOT --base main). All PRs target staging branch.

Follow CLAUDE.md conventions but skip issue-related steps.
Complete the entire workflow autonomously without asking for confirmation."
    
    log_info "Working on custom prompt: $PROMPT"
    
else
    log_error "Unknown workflow type: $WORKFLOW_TYPE"
    exit 1
fi

# Prepare container-based Claude Code execution  
log_info "Preparing Claude Code execution within container..."

# Create workspace directory in container temp location
mkdir -p /tmp/worker-shared
WORK_DIR="/tmp/worker-shared/workspace-$(date +%s)"
log_info "Creating workspace directory: $WORK_DIR"
mkdir -p "$WORK_DIR"

# Create completely clean workspace from GitHub
log_info "Creating clean isolated workspace from GitHub..."
cd "$WORK_DIR"

# Initialize empty git repo
git init
git config user.name "plaiwoo-bot"
git config user.email "plaiwoo-bot@users.noreply.github.com"

# Configure git authentication for fetching from origin
log_info "Configuring git authentication..."
git config credential.helper store
echo "https://plaiwoo-bot:${BOT_APP_TOKEN}@github.com" > ~/.git-credentials

# Add GitHub remote
git remote add origin "https://github.com/Plaiwoo/plaiwoo-frontend.git"

# Fetch staging branch from GitHub (clean, no uncommitted changes)
log_info "Fetching clean staging branch from GitHub..."
git fetch origin staging || {
    log_error "Failed to fetch staging branch from GitHub"
    exit 1
}

# Checkout clean staging branch
log_info "Checking out clean staging branch..."
git checkout staging || {
    log_error "Failed to checkout staging branch"
    exit 1
}

# Verify we have clean staging
CURRENT_BRANCH=$(git branch --show-current)
if [[ "$CURRENT_BRANCH" != "staging" ]]; then
    log_error "Failed to checkout staging branch, currently on: $CURRENT_BRANCH"
    exit 1
fi

# Ensure working directory is completely clean
UNTRACKED_FILES=$(git status --porcelain)
if [[ -n "$UNTRACKED_FILES" ]]; then
    log_error "Workspace should be clean but has changes: $UNTRACKED_FILES"
    exit 1
fi

log_success "Workspace prepared on clean staging branch: $(git log --oneline -1)"

# Execute Claude Code directly within the container for complete isolation
log_info "Executing Claude Code within container for complete isolation..."

# Set up environment for Claude Code authentication
# Claude Code credentials should be mounted from host
export HOME="/home/worker"

# Combine prompts into a single message  
FULL_PROMPT="$SYSTEM_PROMPT

I am the autonomous development worker. I need to complete the full development workflow as specified above.

Please:
1. Start by reading CLAUDE.md to understand the workflow
2. Follow the exact steps for the workflow type (issue-based or prompt-based)
3. Execute each step completely without asking for confirmation
4. Use the bot authentication patterns for GitHub operations
5. Complete the entire workflow from start to PR creation

Begin now."

log_info "Starting Claude Code execution..."

# Progress animation function
show_progress() {
    local animations=(
        "[████░░░░░░] "
        "[█████░░░░░] "
        "[██████░░░░] "
        "[███████░░░] "
        "[████████░░] "
        "[█████████░] "
        "[██████████] "
        "[░█████████] "
        "[░░████████] "
        "[░░░███████] "
        "[░░░░██████] "
        "[░░░░░█████] "
        "[░░░░░░████] "
        "[░░░░░░░███] "
        "[░░░░░░░░██] "
        "[░░░░░░░░░█] "
        "[░░░░░░░░░░] "
        "[█░░░░░░░░░] "
        "[██░░░░░░░░] "
        "[███░░░░░░░] "
    )
    local frame=0
    
    while kill -0 $1 2>/dev/null; do
        local current_time=$(date +%s)
        local elapsed=$((current_time - EXECUTION_START))
        local minutes=$((elapsed / 60))
        local seconds=$((elapsed % 60))
        
        printf "\r${BLUE}[BUILDING]${NC} ${animations[$frame]} %02d:%02d" $minutes $seconds
        frame=$(((frame + 1) % ${#animations[@]}))
        sleep 0.3
    done
    echo "" # New line after progress
}

# Record execution start time
EXECUTION_START=$(date +%s)

# Execute Claude Code with progress display
echo "$FULL_PROMPT" | claude \
    --print \
    --verbose \
    --permission-mode bypassPermissions \
    --dangerously-skip-permissions 2>&1 | tee /tmp/worker-shared/claude-execution.log &

# Get the PID of Claude Code process
CLAUDE_PID=$!

# Start progress animation in background
show_progress $CLAUDE_PID &
PROGRESS_PID=$!

# Wait for Claude Code to complete
wait $CLAUDE_PID
CLAUDE_EXIT_CODE=$?

# Stop progress animation and show completion
if [[ -n "${PROGRESS_PID:-}" ]]; then
    kill $PROGRESS_PID 2>/dev/null || true
    wait $PROGRESS_PID 2>/dev/null || true
fi

# Calculate and show total execution time
EXECUTION_END=$(date +%s)
TOTAL_TIME=$((EXECUTION_END - EXECUTION_START))
TOTAL_MINUTES=$((TOTAL_TIME / 60))
TOTAL_SECONDS=$((TOTAL_TIME % 60))

printf "\r${GREEN}[COMPLETE]${NC} [██████████] Build finished! Total time: %02d:%02d\n" $TOTAL_MINUTES $TOTAL_SECONDS

# Save exit code and results
echo $CLAUDE_EXIT_CODE > /tmp/worker-shared/claude_exit_code
echo "$(date)" > /tmp/worker-shared/execution_completion_time

if [[ $CLAUDE_EXIT_CODE -eq 0 ]]; then
    log_success "Claude Code execution completed successfully within container"
    echo "SUCCESS" > /tmp/worker-shared/status
else
    log_error "Claude Code execution failed with exit code: $CLAUDE_EXIT_CODE"
    echo "FAILED" > /tmp/worker-shared/status
fi

# Create execution summary
cat > /tmp/worker-shared/execution_summary.txt << EOF
Container-Based Claude Code Execution Summary
Generated: $(date)

Workflow Type: $WORKFLOW_TYPE
Issue Number: ${ISSUE_NUMBER:-N/A}
Custom Prompt: ${PROMPT:-N/A}

Execution Details:
- Container: $(hostname)  
- Working Directory: $(pwd)
- Exit Code: $CLAUDE_EXIT_CODE
- Status: $(cat /tmp/worker-shared/status)
- Log File: claude-execution.log

Container provided complete isolation from host filesystem.
No access to host uncommitted changes or credentials.

Completed: $(date)
EOF

log_info "Container-based Claude Code execution completed successfully"

# Create execution report
cat > /tmp/worker-shared/execution_report.txt << EOF
Container-Based Claude Code Execution Report
Generated: $(date)

Workflow Type: $WORKFLOW_TYPE
Issue Number: ${ISSUE_NUMBER:-N/A}
Custom Prompt: ${PROMPT:-N/A}

Execution Details:
- Container: $(hostname)
- Working Directory: $(pwd)
- Claude Code Version: $(claude --version 2>/dev/null || echo "Unknown")
- Exit Code: $CLAUDE_EXIT_CODE
- Status: $(cat /tmp/worker-shared/status)

Container provided complete isolation from host filesystem.
No access to host uncommitted changes or credentials.

Execution completed: $(date)
EOF

# Exit with the same code as Claude Code
exit $CLAUDE_EXIT_CODE