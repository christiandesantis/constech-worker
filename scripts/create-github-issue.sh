#!/bin/bash
set -euo pipefail

# Bot-Authenticated GitHub Issue Creation
# Creates GitHub issues using plaiwoo-bot account, assigns to current user,
# and configures project status following CLAUDE.md patterns

# Color codes for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Logging functions
log_info() {
    echo -e "${BLUE}[ISSUE]${NC} $1" | tee -a /tmp/worker-logs/issue-creation.log
}

log_success() {
    echo -e "${GREEN}[ISSUE]${NC} $1" | tee -a /tmp/worker-logs/issue-creation.log
}

log_warning() {
    echo -e "${YELLOW}[ISSUE]${NC} $1" | tee -a /tmp/worker-logs/issue-creation.log
}

log_error() {
    echo -e "${RED}[ISSUE]${NC} $1" | tee -a /tmp/worker-logs/issue-creation.log
}

# Initialize logging
mkdir -p /tmp/worker-logs
echo "Issue creation started at $(date)" > /tmp/worker-logs/issue-creation.log

log_info "Starting bot-authenticated GitHub issue creation..."

# Validate environment
if [[ -z "${PROMPT:-}" ]]; then
    log_error "PROMPT environment variable is required"
    exit 1
fi

required_vars=("BOT_APP_TOKEN" "CURRENT_USER" "REPOSITORY_OWNER" "REPOSITORY_NAME")
for var in "${required_vars[@]}"; do
    if [[ -z "${!var:-}" ]]; then
        log_error "Missing required environment variable: $var"
        exit 1
    fi
done

log_info "Creating issue with bot authentication..."
log_info "Prompt: $PROMPT"
log_info "Assignee: $CURRENT_USER"
log_info "Repository: $REPOSITORY_OWNER/$REPOSITORY_NAME"

# Test bot access first (following CLAUDE.md pattern)
log_info "Validating bot access..."
BOT_USER=$(GITHUB_TOKEN="$BOT_APP_TOKEN" gh api user --jq '.login' 2>/dev/null || echo "")
if [[ "$BOT_USER" != "plaiwoo-bot" ]]; then
    log_error "Bot authentication failed. Expected 'plaiwoo-bot', got '$BOT_USER'"
    exit 1
fi
log_success "Bot authenticated: $BOT_USER"


# Extract title and description parts
if [[ "$PROMPT" =~ \. ]]; then
    # Split at first dot
    ISSUE_TITLE=$(echo "$PROMPT" | sed 's/\..*$//' | sed 's/^[[:space:]]*//;s/[[:space:]]*$//')
    ISSUE_TITLE="feat: $ISSUE_TITLE"
    ISSUE_DESCRIPTION=$(echo "$PROMPT" | sed 's/^[^.]*\.\s*//')
else
    # No dot found, use fallback
    ISSUE_TITLE="feat: $(echo "$PROMPT" | sed -E 's/^[Ww]e need to |^[Pp]lease |^[Cc]an you //' | head -c 50)"
    ISSUE_DESCRIPTION="$PROMPT"
fi

log_info "Generated title: $ISSUE_TITLE"

# Create issue body with structured format
ISSUE_BODY="## Description
$ISSUE_DESCRIPTION

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
*This issue was created automatically by the Plaiwoo autonomous development worker.*"

# Create the issue using bot token (inline pattern from CLAUDE.md)
log_info "Creating GitHub issue..."

ISSUE_URL=$(GITHUB_TOKEN="$BOT_APP_TOKEN" gh issue create \
    --repo "$REPOSITORY_OWNER/$REPOSITORY_NAME" \
    --title "$ISSUE_TITLE" \
    --body "$ISSUE_BODY" \
    --assignee "plaiwoo-bot" \
    --label "enhancement" 2>&1 || echo "")

if [[ -z "$ISSUE_URL" ]]; then
    log_error "Failed to create GitHub issue: Check if bot has proper permissions and labels exist"
    exit 1
fi

# Check if ISSUE_URL contains an error message instead of URL
if [[ "$ISSUE_URL" != *"github.com"* ]]; then
    log_error "GitHub API error: $ISSUE_URL"
    exit 1
fi

# Extract issue number from URL
ISSUE_NUMBER=$(echo "$ISSUE_URL" | grep -o '[0-9]*$')
if [[ -z "$ISSUE_NUMBER" ]]; then
    log_error "Failed to extract issue number from URL: $ISSUE_URL"
    exit 1
fi

log_success "Created issue #$ISSUE_NUMBER: $ISSUE_URL"

# Add issue to GitHub Project "Plaiwoo Marketplace" using GraphQL API
log_info "Adding issue to GitHub project..."

# First get the issue's node_id
ISSUE_NODE_ID=$(GITHUB_TOKEN="$BOT_APP_TOKEN" gh api repos/$REPOSITORY_OWNER/$REPOSITORY_NAME/issues/$ISSUE_NUMBER --jq '.node_id' 2>/dev/null || echo "")

if [[ -n "$ISSUE_NODE_ID" ]]; then
    GITHUB_TOKEN="$BOT_APP_TOKEN" gh api graphql -f query="
    mutation {
      addProjectV2ItemById(input: {
        projectId: \"PVT_kwDODJAhwc4A4gK5\"
        contentId: \"$ISSUE_NODE_ID\"
      }) {
        item {
          id
        }
      }
    }" >/dev/null 2>&1 || {
        log_warning "Failed to add issue to project (continuing anyway)"
    }
else
    log_warning "Failed to get issue node ID (continuing anyway)"
fi

# Set issue status to "Ready" initially (following CLAUDE.md project configuration)
log_info "Setting issue status to 'Ready'..."

# Give a moment for the project item to be created
sleep 2

# Get the issue's project item ID (retry with a small delay)
ISSUE_ITEM_ID=$(GITHUB_TOKEN="$BOT_APP_TOKEN" gh api graphql -f query="
query {
  repository(owner: \"$REPOSITORY_OWNER\", name: \"$REPOSITORY_NAME\") {
    issue(number: $ISSUE_NUMBER) {
      projectItems(first: 10) {
        nodes {
          id
        }
      }
    }
  }
}" --jq '.data.repository.issue.projectItems.nodes[0].id' 2>/dev/null || echo "")

if [[ -n "$ISSUE_ITEM_ID" ]]; then
    # Set issue status to "Ready" using project configuration from CLAUDE.md
    GITHUB_TOKEN="$BOT_APP_TOKEN" gh api graphql -f query="
    mutation {
      updateProjectV2ItemFieldValue(
        input: {
          projectId: \"PVT_kwDODJAhwc4A4gK5\"
          itemId: \"$ISSUE_ITEM_ID\"
          fieldId: \"PVTSSF_lADODJAhwc4A4gK5zgtdZMI\"
          value: {
            singleSelectOptionId: \"61e4505c\"
          }
        }
      ) {
        projectV2Item {
          id
        }
      }
    }" --jq '.data.updateProjectV2ItemFieldValue.projectV2Item.id' >/dev/null 2>&1 || {
        log_warning "Failed to set issue status (continuing anyway)"
    }
    log_success "Issue status set to 'Ready'"
else
    log_warning "Could not get project item ID for status and type updates (will be set later in workflow)"
fi

# Save issue number for workflow engine
mkdir -p /tmp/worker-shared
echo "$ISSUE_NUMBER" > /tmp/worker-shared/created_issue_number
echo "$ISSUE_URL" > /tmp/worker-shared/created_issue_url

# Export for use by other scripts
export ISSUE_NUMBER="$ISSUE_NUMBER"

log_success "Issue creation completed successfully!"
log_info "Issue #$ISSUE_NUMBER is ready for development"
log_info "Assigned to: $CURRENT_USER"
log_info "Status: In progress"