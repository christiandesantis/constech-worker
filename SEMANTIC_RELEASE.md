# Semantic Release Configuration

This project uses [semantic-release](https://semantic-release.gitbook.io/) to automate version management and package publishing.

## How It Works

Semantic-release automatically:
- Determines the next version number based on commit messages
- Generates release notes
- Updates CHANGELOG.md
- Creates git tags
- Publishes to npm
- Creates GitHub releases

## Commit Message Format

We use [Conventional Commits](https://conventionalcommits.org/) format:

```
<type>[optional scope]: <description>

[optional body]

[optional footer(s)]
```

### Version Bumping Rules

- **Major version** (1.0.0 → 2.0.0): 
  - `feat!: breaking change` 
  - Any commit with `BREAKING CHANGE:` in footer
- **Minor version** (1.0.0 → 1.1.0): 
  - `feat: add new feature`
- **Patch version** (1.0.0 → 1.0.1): 
  - `fix: bug fix`
  - `perf: performance improvement`
  - `docs: update README` (only README changes)

### Commit Types

- `feat`: New feature (minor bump)
- `fix`: Bug fix (patch bump)  
- `perf`: Performance improvement (patch bump)
- `docs`: Documentation changes
- `style`: Code style changes (formatting, etc.)
- `refactor`: Code refactoring
- `test`: Adding or updating tests
- `chore`: Maintenance tasks
- `ci`: CI/CD changes
- `build`: Build system changes

### Examples

```bash
# Patch release (1.0.0 → 1.0.1)
git commit -m "fix: resolve container cleanup issue"

# Minor release (1.0.0 → 1.1.0)  
git commit -m "feat: add banner animations to workflow"

# Major release (1.0.0 → 2.0.0)
git commit -m "feat!: change CLI argument structure

BREAKING CHANGE: --issue flag is now required"
```

## Required GitHub Secrets

### 1. NPM_TOKEN (Required)
- **Purpose**: Publishes package to npm registry
- **How to get**: 
  1. Login to [npmjs.com](https://npmjs.com)
  2. Go to Access Tokens → Generate New Token
  3. Choose "Automation" type
  4. Copy the token
- **GitHub Settings**: Repository Settings → Secrets and variables → Actions → New repository secret
- **Name**: `NPM_TOKEN`
- **Value**: Your npm automation token

### 2. GITHUB_TOKEN (Automatic)
- **Purpose**: Creates GitHub releases, updates repository
- **Setup**: No setup required - GitHub automatically provides this
- **Permissions**: The workflow has the necessary permissions configured

## Workflow Files

### `.github/workflows/ci.yml`
- Runs on pull requests to main
- Tests, builds, and type-checks the code
- Must pass before merging

### `.github/workflows/publish.yml` (renamed to Release)
- Runs on push to main branch
- Runs all tests and builds
- Executes semantic-release if tests pass
- Automatically publishes to npm if there are releasable commits

## Configuration Files

### `.releaserc.json`
- Semantic-release configuration
- Defines plugins and their options
- Configures conventional commits parsing
- Sets up changelog generation

### Key Features:
- **Changelog**: Auto-generated from commit messages
- **GitHub Releases**: Created with release notes  
- **Version Tagging**: Git tags created automatically
- **NPM Publishing**: Package published to npm registry
- **Skip Releases**: Use `[skip ci]` in commit message to skip

## Testing Locally

```bash
# Dry run to see what would be released
npm run release -- --dry-run

# Check what the next version would be
npx semantic-release --dry-run
```

## Branch Strategy

- **main**: Production branch, triggers releases
- **Feature branches**: Create PRs to main
- **Release commits**: Semantic-release commits back to main with `[skip ci]`

## Migration Notes

This setup replaces the previous manual version bumping workflow that used:
- Manual `npm version` commands
- Custom version detection logic
- Manual tag creation

Now everything is automated based on commit message conventions!