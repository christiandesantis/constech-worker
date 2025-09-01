# MCP (Model Context Protocol) Integration Guide

This guide explains how to use MCP servers with Constech Worker for enhanced Claude Code functionality in containers.

## Overview

MCP servers provide additional capabilities to Claude Code, such as:
- **GitHub MCP**: Enhanced GitHub operations and API access
- **Semgrep MCP**: Security scanning and code analysis 
- **Ref MCP**: Documentation search and reference lookup

## Default Configuration

By default, Constech Worker enables only the **GitHub MCP** server:

```json
{
  "docker": {
    "mcpServers": {
      "github": true,     // ✅ Enabled by default
      "semgrep": false,   // ❌ Disabled by default  
      "ref": false        // ❌ Disabled by default
    }
  }
}
```

## Enabling Additional MCPs

### Method 1: Configuration File

Edit `.constech-worker.json`:

```json
{
  "docker": {
    "mcpServers": {
      "github": true,
      "semgrep": true,    // Enable security scanning
      "ref": true         // Enable documentation search
    }
  }
}
```

### Method 2: CLI Commands

```bash
# Enable Semgrep MCP
constech-worker configure docker.mcpServers.semgrep true

# Enable Ref MCP  
constech-worker configure docker.mcpServers.ref true

# Disable GitHub MCP (if needed)
constech-worker configure docker.mcpServers.github false
```

### Method 3: During Init

When running `constech-worker init`, the tool will detect MCPs installed on your host machine and prompt to enable them:

```bash
constech-worker init

# Output:
✓ Detected MCP servers on host:
  - GitHub MCP (recommended for worker)
  - Semgrep MCP (optional: security scanning)
  
? Enable GitHub MCP in worker containers? (Y/n) Y
? Enable Semgrep MCP in worker containers? (y/N) N
```

## MCP Server Details

### GitHub MCP Server

**Purpose**: Enhanced GitHub operations  
**Package**: `@modelcontextprotocol/server-github`  
**Benefits**:
- Better error handling for GitHub API calls
- Access to advanced GitHub features
- Improved rate limiting management

**Environment**: Uses `GITHUB_BOT_TOKEN` from your configuration

### Semgrep MCP Server

**Purpose**: Security scanning and code analysis  
**Package**: `@modelcontextprotocol/server-semgrep`  
**Benefits**:
- Automatic security vulnerability detection
- Code quality analysis during development
- Integration with CI/CD security checks

**Environment**: No additional configuration needed

### Ref MCP Server

**Purpose**: Documentation search and reference lookup  
**Package**: `@modelcontextprotocol/server-ref`  
**Benefits**:
- Access to framework documentation
- API reference lookup
- Code example retrieval

**Environment**: No additional configuration needed

## Container Impact

### With GitHub MCP Only (Default)
- Container size: +~50MB
- Startup time: +2-3 seconds
- Memory usage: +~100MB

### With All MCPs Enabled
- Container size: +~150MB
- Startup time: +5-7 seconds  
- Memory usage: +~300MB

### Installation Process

When MCPs are enabled, the container will:

1. **Install MCP packages** during image build:
   ```dockerfile
   RUN npm install -g @modelcontextprotocol/server-github
   RUN npm install -g @modelcontextprotocol/server-semgrep
   RUN npm install -g @modelcontextprotocol/server-ref
   ```

2. **Configure MCP servers** at runtime:
   - Copy MCP configuration to `/home/worker/.claude/config.json`
   - Set up environment variables
   - Verify MCP server availability

## Usage Examples

### With GitHub MCP (Default)

```bash
# Normal workflow with enhanced GitHub operations
constech-worker dispatch --issue 42
```

Claude Code will have access to advanced GitHub operations for better issue/PR management.

### With Semgrep MCP

```bash
# Enable security scanning
constech-worker configure docker.mcpServers.semgrep true

# Dispatch with security analysis
constech-worker dispatch --prompt "Add user authentication system"
```

Claude Code can now run security scans and catch vulnerabilities during development.

### With All MCPs

```json
{
  "docker": {
    "mcpServers": {
      "github": true,
      "semgrep": true, 
      "ref": true
    }
  }
}
```

```bash
constech-worker dispatch --prompt "Implement JWT authentication with security best practices"
```

Claude Code will have access to:
- Enhanced GitHub operations
- Security vulnerability scanning  
- Documentation lookup for JWT libraries

## Troubleshooting

### MCP Server Not Found

```bash
# Check if MCP server is installed
constech-worker doctor

# Output shows:
❌ Semgrep MCP: Not installed in container
```

**Solution**: Rebuild container after enabling MCP:
```bash
constech-worker configure docker.mcpServers.semgrep true
# Container will be rebuilt on next dispatch
```

### MCP Configuration Errors

```bash
# Check MCP configuration
constech-worker configure --list

# Validate configuration
constech-worker configure --validate
```

### Authentication Issues

For GitHub MCP, ensure `GITHUB_BOT_TOKEN` is properly set:

```bash
# Test bot token
GITHUB_TOKEN="$GITHUB_BOT_TOKEN" gh api user --jq .login

# Should return your bot username
```

### Performance Issues

If containers are too slow with all MCPs:

```bash
# Disable unnecessary MCPs
constech-worker configure docker.mcpServers.ref false
constech-worker configure docker.mcpServers.semgrep false

# Keep only essential GitHub MCP
constech-worker configure docker.mcpServers.github true
```

## Best Practices

### Development Projects
- **Enable**: GitHub MCP (always)
- **Consider**: Semgrep MCP for security-sensitive code
- **Skip**: Ref MCP unless heavy documentation lookup needed

### Production Projects  
- **Enable**: GitHub MCP + Semgrep MCP
- **Consider**: Ref MCP for complex integrations
- **Monitor**: Container resource usage

### Team Settings
Create team-wide defaults in `.constech-worker.json`:

```json
{
  "docker": {
    "mcpServers": {
      "github": true,
      "semgrep": true,  // Team security standard
      "ref": false      // Project-specific
    }
  }
}
```

Commit this file to share MCP preferences across team members.

## Migration from Non-MCP Setup

If you're upgrading from a version without MCP support:

1. **Backup configuration**:
   ```bash
   cp .constech-worker.json .constech-worker.json.backup
   ```

2. **Update configuration schema**:
   ```bash
   constech-worker configure --reset
   constech-worker init --force
   ```

3. **Test with default MCPs**:
   ```bash
   constech-worker dispatch --issue 42 --dry-run
   ```

4. **Enable additional MCPs as needed**:
   ```bash
   constech-worker configure docker.mcpServers.semgrep true
   ```

The upgrade is backward compatible - projects without MCP configuration will continue working with GitHub MCP enabled by default.