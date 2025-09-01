import { promises as fs } from 'fs';
import { join } from 'path';
import { logger } from '../utils/logger.js';

export class ClaudeMdParser {
  private projectPath: string;

  constructor(projectPath: string = process.cwd()) {
    this.projectPath = projectPath;
  }

  /**
   * Read and parse CLAUDE.md file
   */
  async readClaudeInstructions(): Promise<{
    full: string;
    filtered: string;
    hasWorkerSections: boolean;
  }> {
    const claudeMdPath = join(this.projectPath, 'CLAUDE.md');
    
    try {
      const fullContent = await fs.readFile(claudeMdPath, 'utf-8');
      const filteredContent = this.removeWorkerSections(fullContent);
      const hasWorkerSections = fullContent !== filteredContent;

      logger.debug(`CLAUDE.md found at: ${claudeMdPath}`);
      if (hasWorkerSections) {
        logger.debug('CLAUDE.md contains worker sections that will be filtered for container');
      }

      return {
        full: fullContent,
        filtered: filteredContent,
        hasWorkerSections,
      };
    } catch (error: any) {
      if (error?.code === 'ENOENT') {
        logger.debug('No CLAUDE.md found in project');
        return {
          full: '',
          filtered: '',
          hasWorkerSections: false,
        };
      }
      throw new Error(`Failed to read CLAUDE.md: ${error.message}`);
    }
  }

  /**
   * Remove sections marked for exclusion from worker containers
   */
  private removeWorkerSections(content: string): string {
    // Remove sections between magic comments
    const filtered = content.replace(
      /<!--\s*CONSTECH-WORKER-START\s*-->[\s\S]*?<!--\s*CONSTECH-WORKER-END\s*-->/g,
      ''
    );

    // Clean up multiple consecutive newlines
    return filtered.replace(/\n\s*\n\s*\n/g, '\n\n').trim();
  }

  /**
   * Generate enhanced system prompt combining worker workflow with project context
   */
  generateSystemPrompt(options: {
    workflowType: 'issue' | 'prompt';
    issueNumber?: number;
    prompt?: string;
    workingBranch: string;
    qualityChecks: string[];
    filteredInstructions: string;
    reviewerEnvVar?: string;
    defaultReviewer?: string;
    projectId?: string;
    statusFieldId?: string;
    inReviewStatusId?: string;
  }): string {
    const { workflowType, issueNumber, prompt, workingBranch, qualityChecks, filteredInstructions, reviewerEnvVar, defaultReviewer, projectId, statusFieldId, inReviewStatusId } = options;

    // Generate reviewer instruction
    let reviewerInstruction = 'Get reviewer from configuration';
    if (reviewerEnvVar) {
      reviewerInstruction = `Get reviewer from ${reviewerEnvVar} env var`;
      if (defaultReviewer) {
        reviewerInstruction += ` or use default: ${defaultReviewer}`;
      }
    } else if (defaultReviewer) {
      reviewerInstruction = `Use configured reviewer: ${defaultReviewer}`;
    }

    let workflowInstructions = `You are an autonomous development worker. Follow the complete workflow autonomously.

IMPORTANT: You are starting on a clean, up-to-date ${workingBranch} branch. Verify with \`git branch\` and \`git status\`.

WORKFLOW STEPS:
`;

    if (workflowType === 'issue') {
      workflowInstructions += `
1. Work on GitHub issue #${issueNumber}
2. Create feature branch from ${workingBranch} (git checkout -b feat/${issueNumber}-description)
3. Implement the solution following project conventions below
4. Run quality checks (${qualityChecks.join(', ')})
5. Use /review for code review
6. Create PR using bot authentication with BASE BRANCH: ${workingBranch}
   - ${reviewerInstruction}
   - Use --assignee and --reviewer flags in gh pr create (--reviewer requests review)
   - Include proper PR body with issue reference
7. Add PR to configured GitHub Project (MANDATORY)
8. Set PR project status to "In review" (MANDATORY)
9. Set issue status to "In review" (MANDATORY)

CRITICAL: When creating PR, use --base ${workingBranch}. All PRs target ${workingBranch} branch.
`;
    } else {
      workflowInstructions += `
1. Task: ${prompt}
2. Create feature branch from ${workingBranch} (git checkout -b feat/prompt-based-description)
3. Implement the solution following project conventions below
4. Run quality checks (${qualityChecks.join(', ')})
5. Use /review for code review
6. Create PR using bot authentication with BASE BRANCH: ${workingBranch}
   - ${reviewerInstruction}
   - Use --assignee and --reviewer flags in gh pr create (--reviewer requests review)
   - Include proper PR body with task description

CRITICAL: When creating PR, use --base ${workingBranch}. All PRs target ${workingBranch} branch.
`;
    }

    const projectContext = filteredInstructions.trim();
    const separator = projectContext ? '\n\n' : '';

    // Generate project configuration section if available
    let projectConfigSection = '';
    if (projectId || statusFieldId || inReviewStatusId) {
      projectConfigSection = '\n\nGITHUB PROJECT CONFIGURATION:\n';
      if (projectId) {
        projectConfigSection += `- Project ID: ${projectId}\n`;
      }
      if (statusFieldId) {
        projectConfigSection += `- Status Field ID: ${statusFieldId}\n`;
      }
      if (inReviewStatusId) {
        projectConfigSection += `- Status: "In review" = ${inReviewStatusId}\n`;
      }
    }

    const finalPrompt = `${workflowInstructions}

PROJECT CONTEXT & CONVENTIONS:${separator}${projectContext}${projectConfigSection}

Complete the entire workflow autonomously without asking for confirmation.`;

    return finalPrompt;
  }

  /**
   * Validate CLAUDE.md structure and provide recommendations
   */
  validateStructure(content: string): {
    isValid: boolean;
    recommendations: string[];
    hasWorkerSections: boolean;
  } {
    const recommendations: string[] = [];
    const hasWorkerSections = /<!--\s*CONSTECH-WORKER-START\s*-->/.test(content);

    // Check for common GitHub workflow patterns
    const hasGitHubWorkflow = /git checkout|gh pr create|GitHub\s+CLI|pull request/i.test(content);
    const hasBranchInstructions = /git checkout -b|feature branch|branch.*from/i.test(content);
    const hasPRInstructions = /pr create|pull request.*create|create.*pr/i.test(content);

    if (hasGitHubWorkflow && !hasWorkerSections) {
      recommendations.push('Consider wrapping GitHub workflow instructions with magic comments for optimal container experience');
      recommendations.push('Add <!-- CONSTECH-WORKER-START --> and <!-- CONSTECH-WORKER-END --> around workflow sections');
    }

    if (hasBranchInstructions && !hasWorkerSections) {
      recommendations.push('Branch creation instructions detected - these are handled automatically by Constech Worker');
    }

    if (hasPRInstructions && !hasWorkerSections) {
      recommendations.push('PR creation instructions detected - these are handled automatically by Constech Worker');
    }

    // Check for good project context
    const hasCodeStyle = /code style|convention|pattern|architecture/i.test(content);
    const hasFramework = /framework|library|typescript|react|vue|angular/i.test(content);
    const hasTesting = /test|spec|jest|vitest|cypress/i.test(content);

    if (!hasCodeStyle) {
      recommendations.push('Consider adding code style and convention guidelines');
    }

    if (!hasFramework) {
      recommendations.push('Consider documenting framework and technology stack information');
    }

    if (!hasTesting) {
      recommendations.push('Consider adding testing guidelines and strategies');
    }

    return {
      isValid: true, // Structure is always valid, recommendations are optional
      recommendations,
      hasWorkerSections,
    };
  }
}