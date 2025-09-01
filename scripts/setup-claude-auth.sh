#!/bin/bash
set -euo pipefail

# Claude Code Authentication Setup for Worker
# This script sets up Claude Code authentication in a persistent Docker volume
# for use with the autonomous development worker

# Color codes for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Logging functions
log_info() {
    echo -e "${BLUE}[SETUP]${NC} $1"
}

log_success() {
    echo -e "${GREEN}[SETUP]${NC} $1"
}

log_warning() {
    echo -e "${YELLOW}[SETUP]${NC} $1"
}

log_error() {
    echo -e "${RED}[SETUP]${NC} $1"
}

log_info "Claude Code Authentication Setup for Autonomous Worker"
echo "============================================================="
echo
log_info "This script will set up Claude Code authentication in a persistent"
log_info "Docker volume that will be used by all future worker runs."
echo

# Check if Docker is running
if ! docker info >/dev/null 2>&1; then
    log_error "Docker is not running. Please start Docker and try again."
    exit 1
fi

# Build the dev container image
log_info "Building Claude Code dev container image..."
npx --yes @devcontainers/cli build --workspace-folder . || {
    log_error "Failed to build dev container"
    exit 1
}

log_success "Dev container image built successfully"
echo

# Get the image name
IMAGE_NAME="vsc-plaiwoo-frontend-2200c65a08c85860d28e3b6b5bf2b4af4dbd02d10a630869dcdfa5205fab6367"

log_info "Starting interactive Claude Code authentication..."
log_warning "You will be prompted to authenticate with Claude Code."
log_warning "Follow the on-screen instructions to complete setup."
log_warning "When finished, type 'exit' to close the session."
echo

# Run the container interactively for authentication
docker run -it --rm \
    --mount source="$(pwd)",target=/workspace,type=bind,consistency=delegated \
    --mount source=plaiwoo-worker-history,target=/commandhistory,type=volume \
    --mount source=plaiwoo-worker-claude,target=/home/worker/.claude,type=volume \
    -e NODE_OPTIONS=--max-old-space-size=4096 \
    -e CLAUDE_CONFIG_DIR=/home/worker/.claude \
    -e POWERLEVEL9K_DISABLE_GITSTATUS=true \
    -e DEVCONTAINER=true \
    --cap-add=NET_ADMIN \
    --cap-add=NET_RAW \
    --user worker \
    --workdir /workspace \
    "$IMAGE_NAME" \
    /bin/bash -c "claude --version && echo && echo 'Run: claude' && echo 'to start authentication' && echo && /bin/bash"

echo
log_success "Claude Code authentication setup completed!"
log_success "Your authentication is now stored in a persistent Docker volume."
log_success "You can now run the autonomous worker with:"
log_info "  ./dispatch-worker.sh --issue <number>"
log_info "  ./dispatch-worker.sh --prompt \"<description>\""
echo