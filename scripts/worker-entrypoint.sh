#!/bin/bash
set -euo pipefail

# Worker Container Entrypoint
# This script runs inside the worker container and orchestrates the complete
# development workflow with containerized Claude Code execution

# Color codes for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Logging functions
log_info() {
    echo -e "${BLUE}[WORKER]${NC} $1" | tee -a /tmp/worker-logs/worker.log
}

log_success() {
    echo -e "${GREEN}[WORKER]${NC} $1" | tee -a /tmp/worker-logs/worker.log
}

log_warning() {
    echo -e "${YELLOW}[WORKER]${NC} $1" | tee -a /tmp/worker-logs/worker.log
}

log_error() {
    echo -e "${RED}[WORKER]${NC} $1" | tee -a /tmp/worker-logs/worker.log
}

# Initialize logging in container temp directory
mkdir -p /tmp/worker-logs
echo "Worker started at $(date)" > /tmp/worker-logs/worker.log

log_info "Autonomous Development Worker starting in container-based isolation mode..."
log_info "Container: $(hostname)"
log_info "User: $(whoami)"

# Validate environment
required_vars=("GITHUB_TOKEN" "BOT_APP_TOKEN" "CURRENT_USER" "REPOSITORY_OWNER" "REPOSITORY_NAME" "REVIEWER_USER")
for var in "${required_vars[@]}"; do
    if [[ -z "${!var:-}" ]]; then
        log_error "Missing required environment variable: $var"
        exit 1
    fi
done

log_info "Environment validated"
log_info "Repository: $REPOSITORY_OWNER/$REPOSITORY_NAME"
log_info "Current user: $CURRENT_USER"
log_info "Reviewer: $REVIEWER_USER"

# Configure git with plaiwoo-bot account for consistency with PR creation
log_info "Configuring git with plaiwoo-bot account..."
git config --global user.name "plaiwoo-bot"
git config --global user.email "plaiwoo-bot@users.noreply.github.com"

log_success "Git configured for plaiwoo-bot (current user: $CURRENT_USER will be reviewer)"

# Verify Claude Code authentication
log_info "Verifying Claude Code authentication..."
if claude --version >/dev/null 2>&1; then
    log_success "Claude Code is available and ready"
    log_info "Claude config directory: ${CLAUDE_CONFIG_DIR:-/home/worker/.claude}"
else
    log_error "Claude Code authentication failed"
    log_error "Please authenticate Claude Code by running: claude"
    log_error "Follow the authentication prompts to complete setup"
    exit 1
fi

# Determine workflow scenario first to pass to workflow engine
SCENARIO=""
if [[ -n "${ISSUE_NUMBER:-}" && -n "${PROMPT:-}" ]]; then
    SCENARIO="combined"
    log_info "Scenario: Combined (Issue #$ISSUE_NUMBER + Custom prompt)"
elif [[ -n "${ISSUE_NUMBER:-}" ]]; then
    SCENARIO="issue"
    log_info "Scenario: Issue-based (#$ISSUE_NUMBER)"
elif [[ -n "${PROMPT:-}" && "${CREATE_ISSUE:-false}" == "true" ]]; then
    SCENARIO="create_issue"
    log_info "Scenario: Create issue + Development ('$PROMPT')"
elif [[ -n "${PROMPT:-}" ]]; then
    SCENARIO="prompt_only"
    log_info "Scenario: Prompt-only ('$PROMPT')"
else
    log_error "Invalid scenario parameters"
    exit 1
fi

# Handle issue creation scenario
if [[ "$SCENARIO" == "create_issue" ]]; then
    log_info "Creating GitHub issue first..."
    /workspace/scripts/worker/create-github-issue.sh || {
        log_error "Failed to create GitHub issue"
        exit 1
    }
    # Issue number will be set by create-issue script
    ISSUE_NUMBER=$(cat /tmp/worker-shared/created_issue_number 2>/dev/null || echo "")
    if [[ -z "$ISSUE_NUMBER" ]]; then
        log_error "Failed to get created issue number"
        exit 1
    fi
    log_success "Created issue #$ISSUE_NUMBER"
    # Update environment for workflow engine
    export ISSUE_NUMBER="$ISSUE_NUMBER"
    # Continue with issue-based workflow
    SCENARIO="issue"
fi

# Execute container-based workflow with Claude Code
log_info "Starting container-based workflow execution with direct Claude Code execution..."

# Determine workflow type for the workflow engine
WORKFLOW_TYPE=""
case "$SCENARIO" in
    "issue"|"combined")
        WORKFLOW_TYPE="issue"
        ;;
    "prompt_only")
        WORKFLOW_TYPE="prompt"
        ;;
    *)
        log_error "Unknown scenario: $SCENARIO"
        exit 1
        ;;
esac

# Execute workflow engine with container-based Claude Code execution
/workspace/scripts/worker/workflow-engine.sh "$WORKFLOW_TYPE" || {
    log_error "Container-based workflow failed"
    exit 1
}

log_success "Container-based workflow completed successfully!"
log_info "Worker container finished with Claude Code executed in complete isolation"
log_info "Container execution completed (artifacts in container temp directories)"