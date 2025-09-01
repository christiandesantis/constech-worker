#!/bin/bash
set -euo pipefail

# Container Cleanup Handler
# Ensures proper cleanup of resources and artifacts

# Color codes for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Logging functions
log_info() {
    echo -e "${BLUE}[CLEANUP]${NC} $1"
}

log_success() {
    echo -e "${GREEN}[CLEANUP]${NC} $1"
}

log_warning() {
    echo -e "${YELLOW}[CLEANUP]${NC} $1"
}

log_error() {
    echo -e "${RED}[CLEANUP]${NC} $1"
}

log_info "Starting container cleanup..."

# Save final status and logs
if [[ -d "/tmp/worker-logs" ]]; then
    log_info "Archiving logs..."
    
    # Ensure shared directory exists
    mkdir -p /tmp/worker-shared
    
    # Create final status report
    cat > /tmp/worker-shared/final_report.txt << EOF
=== Autonomous Development Worker Final Report ===
Execution completed at: $(date)
Container: $(hostname)
Working directory: $(pwd)

Environment:
- Repository: ${REPOSITORY_OWNER:-unknown}/${REPOSITORY_NAME:-unknown}
- Current user: ${CURRENT_USER:-unknown}
- Issue number: ${ISSUE_NUMBER:-none}
- Prompt: ${PROMPT:-none}
- Create issue: ${CREATE_ISSUE:-false}

Status: $(cat /tmp/worker-shared/status 2>/dev/null || echo "UNKNOWN")

Logs available in /tmp/worker-shared/
EOF

    # Copy all logs to shared directory
    cp -r /tmp/worker-logs/* /tmp/worker-shared/ 2>/dev/null || true
    
    log_success "Logs archived to shared directory"
fi

# Clean up temporary files
log_info "Cleaning up temporary files..."

# Remove any temporary git credentials
rm -f ~/.git-credentials 2>/dev/null || true
rm -f ~/.gitconfig.tmp 2>/dev/null || true

# Clean up Claude Code cache and temp files
rm -rf ~/.cache/claude-code 2>/dev/null || true
rm -rf /tmp/claude-* 2>/dev/null || true

# Clean up npm/pnpm cache if it exists
rm -rf ~/.npm/_cacache 2>/dev/null || true
rm -rf ~/.local/share/pnpm/store/v3 2>/dev/null || true

log_success "Temporary files cleaned up"

# Ensure shared directory has proper permissions
if [[ -d "/tmp/worker-shared" ]]; then
    chmod -R 755 /tmp/worker-shared 2>/dev/null || true
    log_success "Set permissions on shared directory"
fi

# Final health check
log_info "Performing final health check..."

# Check if critical files exist
CRITICAL_FILES=("/tmp/worker-shared/status" "/tmp/worker-shared/final_report.txt")
MISSING_FILES=()

for file in "${CRITICAL_FILES[@]}"; do
    if [[ ! -f "$file" ]]; then
        MISSING_FILES+=("$file")
    fi
done

if [[ ${#MISSING_FILES[@]} -gt 0 ]]; then
    log_warning "Missing critical files: ${MISSING_FILES[*]}"
    
    # Create minimal status file if missing
    if [[ ! -f "/tmp/worker-shared/status" ]]; then
        echo "INCOMPLETE" > /tmp/worker-shared/status
    fi
else
    log_success "All critical files present"
fi

# Log final container state
log_info "Container cleanup completed successfully"
log_info "Final status: $(cat /tmp/worker-shared/status 2>/dev/null || echo "UNKNOWN")"
log_info "Artifacts saved in /tmp/worker-shared/"

exit 0