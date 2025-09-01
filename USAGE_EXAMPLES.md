# Constech Worker - Usage Examples

This document provides real-world examples of using Constech Worker for different development scenarios.

## Basic Usage Patterns

### 1. Working on Existing Issues

```bash
# Work on a specific GitHub issue
constech-worker dispatch --issue 42

# Work on issue with custom reviewer
constech-worker dispatch --issue 42 --reviewer alice-developer

# Target a different base branch  
constech-worker dispatch --issue 42 --base main
```

**What happens:**
- Fetches issue #42 details from GitHub
- Creates feature branch: `feat/42-issue-description`  
- Claude Code implements the solution
- Creates PR targeting staging branch
- Updates issue status to "In Review"

### 2. Custom Development Tasks

```bash
# Simple feature request
constech-worker dispatch --prompt "Add logout button to navigation bar"

# Complex feature with details
constech-worker dispatch --prompt "Implement user authentication system. Include login/logout functionality, password hashing, session management, and protected route middleware."

# Bug fix scenario
constech-worker dispatch --prompt "Fix memory leak in WebSocket connection handler. The connection isn't being properly cleaned up on disconnect."
```

**What happens:**
- Creates feature branch: `feat/prompt-based-description`
- Claude Code analyzes requirements and implements solution
- Runs quality checks (typecheck, lint, build)
- Creates PR with generated commit messages

### 3. Issue Creation + Development

```bash
# Create issue first, then implement
constech-worker dispatch --prompt "Add dark mode toggle to settings page. Users should be able to switch between light and dark themes with persistent storage." --create-issue

# Create bug report and fix
constech-worker dispatch --prompt "Form validation error messages not displaying correctly. Error state styling is missing and messages appear behind modal overlay." --create-issue
```

**What happens:**
- Extracts title from first sentence: "feat: Add dark mode toggle to settings page"
- Creates GitHub issue with structured description
- Adds issue to project board with "Ready" status
- Proceeds with normal development workflow
- Links PR to created issue

## Advanced Scenarios

### 4. Configuration and Setup

```bash
# Initial project setup
constech-worker init
constech-worker doctor

# View and modify configuration
constech-worker configure --list
constech-worker configure github.projectId PVT_kwDODJAhwc4A4gK5
constech-worker configure workflow.qualityChecks '["npm test", "npm run lint", "npm run build"]'

# Reset configuration to defaults
constech-worker configure --reset
```

### 5. Development Workflow Examples

#### Frontend Feature Development
```bash
constech-worker dispatch --prompt "Create a responsive product card component. Include product image, title, price, rating stars, and add-to-cart button. Use Tailwind CSS for styling and make it mobile-friendly." --create-issue
```

#### Backend API Development  
```bash
constech-worker dispatch --prompt "Implement REST API endpoints for user management. Include CRUD operations: GET /users, POST /users, PUT /users/:id, DELETE /users/:id. Add input validation, error handling, and proper HTTP status codes."
```

#### Bug Fix Workflow
```bash
constech-worker dispatch --issue 156  # Existing bug report
# or
constech-worker dispatch --prompt "Fix race condition in payment processing. Orders are sometimes processed twice when users click submit rapidly. Add proper request debouncing and lock mechanisms." --create-issue
```

#### Refactoring Task
```bash
constech-worker dispatch --prompt "Refactor authentication middleware to use JWT tokens instead of sessions. Maintain backward compatibility and update all protected routes. Include token refresh mechanism."
```

### 6. Team Collaboration

```bash
# Assign to specific team member
constech-worker dispatch --prompt "Update user profile page with new design mockups" --reviewer senior-developer

# Emergency hotfix workflow
constech-worker dispatch --prompt "Critical: Fix XSS vulnerability in comment system" --base main --reviewer security-team-lead
```

### 7. Quality Assurance Scenarios

```bash
# Dry run to see what would happen
constech-worker dispatch --prompt "Add unit tests for payment processing module" --dry-run

# Force execution despite configuration warnings
constech-worker dispatch --issue 89 --force

# Override quality checks for specific scenarios
constech-worker configure workflow.qualityChecks '["npm run test:unit"]'
constech-worker dispatch --prompt "Add integration tests for user registration flow"
```

## Project-Specific Examples

### 8. E-commerce Project

```bash
# Product management
constech-worker dispatch --prompt "Implement product search with filters. Include category, price range, brand, and rating filters. Add sorting by price, popularity, and date added." --create-issue

# Shopping cart functionality  
constech-worker dispatch --prompt "Add shopping cart persistence. Save cart contents to localStorage and restore on page reload. Handle quantity updates and item removal."

# Payment integration
constech-worker dispatch --prompt "Integrate Stripe payment gateway. Add credit card form validation, payment processing, and order confirmation email system."
```

### 9. SaaS Application

```bash
# User onboarding
constech-worker dispatch --prompt "Create multi-step onboarding flow. Include welcome screen, account setup, feature tour, and initial project creation." --create-issue

# Subscription management
constech-worker dispatch --prompt "Implement subscription billing system. Handle plan upgrades/downgrades, prorated billing, and payment failure recovery."

# Analytics dashboard
constech-worker dispatch --prompt "Build analytics dashboard with charts. Show user activity, revenue metrics, and system performance using Chart.js or similar library."
```

### 10. API Development

```bash
# Database schema
constech-worker dispatch --prompt "Design and implement database schema for blog system. Include posts, comments, categories, tags, and user relationships with proper foreign keys." --create-issue

# Authentication system
constech-worker dispatch --prompt "Implement OAuth2 authentication with Google and GitHub providers. Include user account linking and role-based permissions."

# API documentation
constech-worker dispatch --prompt "Add OpenAPI/Swagger documentation for all REST endpoints. Include request/response examples and authentication requirements."
```

## Troubleshooting Examples

### 11. Common Issues and Solutions

```bash
# System health check
constech-worker doctor

# Fix configuration issues
constech-worker doctor --fix

# Verbose debugging
DEBUG=constech-worker:* constech-worker dispatch --issue 42

# Reset and reinitialize
constech-worker configure --reset
constech-worker init --force
```

### 12. Environment-Specific Commands

```bash
# Development environment
GITHUB_BOT_TOKEN=ghp_dev_token constech-worker dispatch --prompt "Add feature flags system"

# Production hotfix
constech-worker dispatch --prompt "Critical security patch for user input validation" --base main --reviewer security-team

# Staging deployment
constech-worker dispatch --prompt "Update API documentation for v2 endpoints" --base staging
```

## Integration Examples

### 13. CI/CD Pipeline Integration

```bash
# In GitHub Actions workflow
- name: Autonomous Development
  run: |
    constech-worker dispatch --prompt "Automated dependency updates" --create-issue
  env:
    GITHUB_BOT_TOKEN: ${{ secrets.BOT_TOKEN }}
    REVIEWER_USER: ${{ github.actor }}
```

### 14. Custom Workflows

```bash
# Multi-issue workflow
for issue in 45 46 47; do
  constech-worker dispatch --issue $issue &
done
wait

# Batch feature development
constech-worker dispatch --prompt "Implement user preferences page" --create-issue
sleep 10
constech-worker dispatch --prompt "Add email notification settings" --create-issue
```

## Best Practices

### 15. Effective Prompt Writing

```bash
# ✅ Good: Specific and actionable
constech-worker dispatch --prompt "Add input validation to registration form. Validate email format, password strength (8+ chars, numbers, symbols), and check for existing usernames."

# ❌ Avoid: Vague or too broad  
constech-worker dispatch --prompt "Make the app better"

# ✅ Good: Include context and requirements
constech-worker dispatch --prompt "Optimize database queries in user dashboard. Focus on the user stats query which takes 3+ seconds. Consider adding indexes and query optimization."

# ✅ Good: Clear acceptance criteria
constech-worker dispatch --prompt "Implement file upload functionality. Support images up to 10MB, validate file types (jpg, png, gif), show upload progress, and display preview."
```

### 16. Project Organization

```bash
# Feature branches for related work
constech-worker dispatch --prompt "User authentication - Step 1: Login form and validation" --create-issue
constech-worker dispatch --prompt "User authentication - Step 2: JWT token handling and storage" --create-issue
constech-worker dispatch --prompt "User authentication - Step 3: Protected routes and middleware" --create-issue

# Bug fix categorization
constech-worker dispatch --prompt "UI Bug: Button alignment issues on mobile devices" --create-issue
constech-worker dispatch --prompt "Performance: Slow loading on products page" --create-issue
constech-worker dispatch --prompt "Security: Sanitize user input in comment system" --create-issue
```

---

These examples demonstrate the flexibility and power of Constech Worker for automating development workflows across different project types and development scenarios.