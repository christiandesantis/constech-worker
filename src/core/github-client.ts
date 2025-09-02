/** biome-ignore-all lint/suspicious/noExplicitAny: will fix later */
import { graphql } from "@octokit/graphql";
import { Octokit } from "@octokit/rest";
import { logger } from "../utils/logger.js";

export interface CreateIssueOptions {
	owner: string;
	repo: string;
	title: string;
	body: string;
	assignees?: string[];
	labels?: string[];
}

export interface Issue {
	number: number;
	title: string;
	body: string;
	html_url: string;
}

export class GitHubClient {
	private octokit: Octokit;
	private graphqlWithAuth: any;

	constructor(token: string) {
		this.octokit = new Octokit({ auth: token });
		this.graphqlWithAuth = graphql.defaults({
			headers: {
				authorization: `token ${token}`,
			},
		});
	}

	/**
	 * Create a GitHub issue
	 */
	async createIssue(options: CreateIssueOptions): Promise<Issue> {
		try {
			const { data: issue } = await this.octokit.rest.issues.create({
				owner: options.owner,
				repo: options.repo,
				title: options.title,
				body: options.body,
				assignees: options.assignees,
				labels: options.labels,
			});

			logger.debug(`Created issue #${issue.number}: ${issue.title}`);

			return {
				number: issue.number,
				title: issue.title,
				body: issue.body || "",
				html_url: issue.html_url,
			};
		} catch (error: any) {
			logger.error("Failed to create issue:", error.message);
			throw new Error(`Failed to create GitHub issue: ${error.message}`);
		}
	}

	/**
	 * Get issue by number
	 */
	async getIssue(
		owner: string,
		repo: string,
		issueNumber: number,
	): Promise<Issue> {
		try {
			const { data: issue } = await this.octokit.rest.issues.get({
				owner,
				repo,
				issue_number: issueNumber,
			});

			return {
				number: issue.number,
				title: issue.title,
				body: issue.body || "",
				html_url: issue.html_url,
			};
		} catch (error: any) {
			throw new Error(`Failed to get issue #${issueNumber}: ${error.message}`);
		}
	}

	/**
	 * Add issue to GitHub project
	 */
	async addIssueToProject(
		issueNumber: number,
		projectId: string,
		owner: string,
		repo: string,
	): Promise<void> {
		try {
			// First get the issue's node_id
			const { data: issue } = await this.octokit.rest.issues.get({
				owner,
				repo,
				issue_number: issueNumber,
			});

			await this.graphqlWithAuth(`
        mutation {
          addProjectV2ItemById(input: {
            projectId: "${projectId}"
            contentId: "${issue.node_id}"
          }) {
            item {
              id
            }
          }
        }
      `);

			logger.debug(`Added issue #${issueNumber} to project ${projectId}`);
		} catch (error: any) {
			logger.warning(`Failed to add issue to project: ${error.message}`);
			// Don't throw - project management is optional
		}
	}

	/**
	 * Update project item status
	 */
	async updateProjectItemStatus(
		itemNumber: number,
		projectId: string,
		statusFieldId: string,
		statusOptionId: string,
		itemType: "issue" | "pr",
		owner: string,
		repo: string,
	): Promise<void> {
		try {
			// Get the project item ID
			const itemQuery = itemType === "issue" ? "issue" : "pullRequest";
			const response: any = await this.graphqlWithAuth(
				`
        query($itemNumber: Int!, $owner: String!, $repo: String!) {
          repository(owner: $owner, name: $repo) {
            ${itemQuery}(number: $itemNumber) {
              projectItems(first: 10) {
                nodes {
                  id
                }
              }
            }
          }
        }
      `,
				{ itemNumber, owner, repo },
			);

			const projectItems = response.repository[itemQuery].projectItems.nodes;
			if (projectItems.length === 0) {
				logger.warning(`No project items found for ${itemType} #${itemNumber}`);
				return;
			}

			const itemId = projectItems[0].id;

			// Update the status
			await this.graphqlWithAuth(`
        mutation {
          updateProjectV2ItemFieldValue(
            input: {
              projectId: "${projectId}"
              itemId: "${itemId}"
              fieldId: "${statusFieldId}"
              value: {
                singleSelectOptionId: "${statusOptionId}"
              }
            }
          ) {
            projectV2Item {
              id
            }
          }
        }
      `);

			logger.debug(`Updated ${itemType} #${itemNumber} status in project`);
		} catch (error: any) {
			logger.warning(`Failed to update project item status: ${error.message}`);
			// Don't throw - project management is optional
		}
	}

	/**
	 * Create pull request
	 */
	async createPullRequest(options: {
		owner: string;
		repo: string;
		title: string;
		body: string;
		head: string;
		base: string;
		assignees?: string[];
		reviewers?: string[];
		labels?: string[];
	}): Promise<{ number: number; html_url: string }> {
		try {
			const { data: pr } = await this.octokit.rest.pulls.create({
				owner: options.owner,
				repo: options.repo,
				title: options.title,
				body: options.body,
				head: options.head,
				base: options.base,
			});

			// Add assignees if specified
			if (options.assignees && options.assignees.length > 0) {
				await this.octokit.rest.issues.addAssignees({
					owner: options.owner,
					repo: options.repo,
					issue_number: pr.number,
					assignees: options.assignees,
				});
			}

			// Add reviewers if specified
			if (options.reviewers && options.reviewers.length > 0) {
				await this.octokit.rest.pulls.requestReviewers({
					owner: options.owner,
					repo: options.repo,
					pull_number: pr.number,
					reviewers: options.reviewers,
				});
			}

			// Add labels if specified
			if (options.labels && options.labels.length > 0) {
				await this.octokit.rest.issues.addLabels({
					owner: options.owner,
					repo: options.repo,
					issue_number: pr.number,
					labels: options.labels,
				});
			}

			logger.debug(`Created PR #${pr.number}: ${pr.title}`);

			return {
				number: pr.number,
				html_url: pr.html_url,
			};
		} catch (error: any) {
			throw new Error(`Failed to create pull request: ${error.message}`);
		}
	}

	/**
	 * Get authenticated user info
	 */
	async getCurrentUser(): Promise<{ login: string; name: string | null }> {
		try {
			const { data: user } = await this.octokit.rest.users.getAuthenticated();
			return {
				login: user.login,
				name: user.name,
			};
		} catch (error: any) {
			throw new Error(`Failed to get current user: ${error.message}`);
		}
	}

	/**
	 * Discover GitHub projects for a repository
	 */
	async discoverProjects(
		owner: string,
		repo: string,
	): Promise<
		{
			id: string;
			title: string;
			statusFieldId?: string;
			statusOptions?: Record<string, string>;
		}[]
	> {
		try {
			const response: any = await this.graphqlWithAuth(
				`
        query($owner: String!, $repo: String!) {
          repository(owner: $owner, name: $repo) {
            issues(first: 5) {
              nodes {
                projectItems(first: 10) {
                  nodes {
                    project {
                      id
                      title
                      fields(first: 20) {
                        nodes {
                          ... on ProjectV2SingleSelectField {
                            id
                            name
                            options {
                              id
                              name
                            }
                          }
                        }
                      }
                    }
                  }
                }
              }
            }
          }
        }
      `,
				{ owner, repo },
			);

			const projects = new Map();

			// Collect unique projects
			response.repository.issues.nodes.forEach((issue: any) => {
				issue.projectItems.nodes.forEach((item: any) => {
					if (item.project) {
						projects.set(item.project.id, item.project);
					}
				});
			});

			return Array.from(projects.values()).map((project: any) => {
				const statusField = project.fields.nodes.find(
					(field: any) => field.name === "Status" && field.options,
				);

				const statusOptions: Record<string, string> = {};
				if (statusField) {
					statusField.options.forEach((option: any) => {
						const key = option.name.toLowerCase().replace(/[^a-z]/g, "");
						statusOptions[key] = option.id;
					});
				}

				return {
					id: project.id,
					title: project.title,
					statusFieldId: statusField?.id,
					statusOptions:
						Object.keys(statusOptions).length > 0 ? statusOptions : undefined,
				};
			});
		} catch (error: any) {
			logger.debug(`Failed to discover projects: ${error.message}`);
			return [];
		}
	}
}
