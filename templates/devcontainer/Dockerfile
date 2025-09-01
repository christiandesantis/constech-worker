FROM node:20

ARG TZ
ENV TZ="$TZ"

ARG CLAUDE_CODE_VERSION=latest

# Install basic development tools and iptables/ipset
RUN apt-get update && apt-get install -y --no-install-recommends \
  less \
  git \
  procps \
  sudo \
  fzf \
  zsh \
  man-db \
  unzip \
  gnupg2 \
  gh \
  iptables \
  ipset \
  iproute2 \
  dnsutils \
  aggregate \
  jq \
  nano \
  vim \
  && apt-get clean && rm -rf /var/lib/apt/lists/*

# Use existing node user from base image and rename to worker
ARG USERNAME=worker
RUN usermod -l $USERNAME node \
  && groupmod -n $USERNAME node \
  && echo "$USERNAME ALL=(ALL) NOPASSWD:ALL" >> /etc/sudoers \
  && mkdir -p /home/$USERNAME \
  && chown $USERNAME:$USERNAME /home/$USERNAME

# Ensure worker user has access to /usr/local/share
RUN mkdir -p /usr/local/share/npm-global && \
  chown -R $USERNAME:$USERNAME /usr/local/share

# Persist bash history
RUN SNIPPET="export PROMPT_COMMAND='history -a' && export HISTFILE=/commandhistory/.bash_history" \
  && mkdir /commandhistory \
  && touch /commandhistory/.bash_history \
  && chown -R $USERNAME /commandhistory

# Set `DEVCONTAINER` environment variable to help with orientation
ENV DEVCONTAINER=true

# Create workspace and config directories and set permissions
RUN mkdir -p /workspace /home/$USERNAME/.claude && \
  chown -R $USERNAME:$USERNAME /workspace /home/$USERNAME/.claude

# Create pnpm directories in container-only locations
RUN mkdir -p /tmp/pnpm-store /tmp/pnpm-cache /tmp/pnpm-state && \
  chown -R $USERNAME:$USERNAME /tmp/pnpm-store /tmp/pnpm-cache /tmp/pnpm-state

WORKDIR /workspace

ARG GIT_DELTA_VERSION=0.18.2
RUN ARCH=$(dpkg --print-architecture) && \
  wget "https://github.com/dandavison/delta/releases/download/${GIT_DELTA_VERSION}/git-delta_${GIT_DELTA_VERSION}_${ARCH}.deb" && \
  sudo dpkg -i "git-delta_${GIT_DELTA_VERSION}_${ARCH}.deb" && \
  rm "git-delta_${GIT_DELTA_VERSION}_${ARCH}.deb"

# Set up non-root user
USER $USERNAME

# Install global packages
ENV NPM_CONFIG_PREFIX=/usr/local/share/npm-global
ENV PATH=$PATH:/usr/local/share/npm-global/bin

# Configure pnpm to use container-only directories to prevent host filesystem pollution
ENV PNPM_HOME=/usr/local/share/pnpm
ENV PATH=$PATH:$PNPM_HOME
# Set pnpm store to container-only location (not in mounted /workspace)
ENV PNPM_STORE_PATH=/tmp/pnpm-store
# Set pnpm cache to container-only location  
ENV PNPM_CACHE_PATH=/tmp/pnpm-cache
# Set pnpm state directory to container-only location
ENV PNPM_STATE_DIR=/tmp/pnpm-state


# Set the default shell to zsh rather than sh
ENV SHELL=/bin/zsh

# Set the default editor and visual
ENV EDITOR=nano
ENV VISUAL=nano

# Install zsh-in-docker for better shell experience
RUN sh -c "$(wget -O- https://github.com/deluan/zsh-in-docker/releases/download/v1.2.0/zsh-in-docker.sh)" -- \
  -p git \
  -p fzf \
  -a "source /usr/share/doc/fzf/examples/key-bindings.zsh" \
  -a "source /usr/share/doc/fzf/examples/completion.zsh" \
  -a "export PROMPT_COMMAND='history -a' && export HISTFILE=/commandhistory/.bash_history" \
  -x

# Install Claude Code
RUN npm install -g @anthropic-ai/claude-code@${CLAUDE_CODE_VERSION}

# Copy and set up firewall script
COPY init-firewall.sh /usr/local/bin/
USER root
RUN chmod +x /usr/local/bin/init-firewall.sh && \
  echo "$USERNAME ALL=(root) NOPASSWD: /usr/local/bin/init-firewall.sh" > /etc/sudoers.d/$USERNAME-firewall && \
  chmod 0440 /etc/sudoers.d/$USERNAME-firewall

# Configure git with plaiwoo-bot for consistency  
RUN git config --system user.name "plaiwoo-bot" && \
  git config --system user.email "plaiwoo-bot@users.noreply.github.com"

# Prevent accidental npm usage - alias npm to pnpm (while still root)
RUN echo '#!/bin/bash' > /usr/local/bin/npm && \
    echo 'echo "⚠️  Using pnpm instead of npm in this project"' >> /usr/local/bin/npm && \
    echo 'exec pnpm "$@"' >> /usr/local/bin/npm && \
    chmod +x /usr/local/bin/npm

USER $USERNAME