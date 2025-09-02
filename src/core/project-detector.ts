/** biome-ignore-all lint/suspicious/noExplicitAny: will fix later */
import { graphql } from "@octokit/graphql";
import { Octokit } from "@octokit/rest";
import simpleGit from "simple-git";
import { logger } from "../utils/logger.js";
import type { Config } from "./config-schema.js";

export interface DetectedProject {
	owner: string;
	name: string;
	defaultBranch: string;
	workingBranch?: string;
	githubProject?: {
		id: string;
		statusFieldId: string;
		statusOptions: Record<string, string>;
	};
	botUsername?: string;
}

export class ProjectDetector {
	private git = simpleGit();

	/**
	 * Detect project settings from git repository and GitHub
	 */
	async detect(botToken?: string): Promise<DetectedProject> {
		const repoInfo = await this.detectRepository();
		logger.debug(`Detected repository: ${repoInfo.owner}/${repoInfo.name}`);

		let githubProject: any;
		let botUsername: any;

		if (botToken) {
			try {
				botUsername = await this.detectBotUsername(botToken);
				logger.debug(`Detected bot username: ${botUsername}`);

				githubProject = await this.detectGitHubProject(
					repoInfo.owner,
					repoInfo.name,
					botToken,
				);
				if (githubProject) {
					logger.debug(`Detected GitHub project: ${githubProject.id}`);
				}
			} catch (error: any) {
				logger.warning(`Failed to detect GitHub settings: ${error?.message}`);
			}
		}

		return {
			...repoInfo,
			githubProject,
			botUsername,
		};
	}

	/**
	 * Detect repository information from git remote
	 */
	private async detectRepository(): Promise<{
		owner: string;
		name: string;
		defaultBranch: string;
		workingBranch?: string;
	}> {
		try {
			const remotes = await this.git.getRemotes(true);
			const origin = remotes.find((r) => r.name === "origin");

			if (!origin?.refs?.fetch) {
				throw new Error("No origin remote found");
			}

			const match = origin.refs.fetch.match(
				/github\.com[/:]([^/]+)\/([^/]+?)(?:\.git)?$/,
			);
			if (!match) {
				throw new Error("Not a GitHub repository");
			}

			const [, owner, name] = match;

			// Detect branches
			const branches = await this.git.branch(["-a"]);
			const defaultBranch = branches.current || "main";
			const workingBranch = branches.all.includes("staging")
				? "staging"
				: undefined;

			return {
				owner,
				name,
				defaultBranch,
				workingBranch,
			};
		} catch (error) {
			logger.error("Failed to detect repository information:", error);
			throw new Error(
				"Could not detect repository. Make sure you are in a git repository with GitHub remote.",
			);
		}
	}

	/**
	 * Detect bot username from token
	 */
	private async detectBotUsername(token: string): Promise<string> {
		try {
			const octokit = new Octokit({ auth: token });
			const { data: user } = await octokit.rest.users.getAuthenticated();
			return user.login;
		} catch (error: any) {
			throw new Error(
				`Failed to authenticate with bot token: ${error?.message}`,
			);
		}
	}

	/**
	 * Detect GitHub project settings by finding projects that contain repository issues
	 */
	private async detectGitHubProject(
		owner: string,
		name: string,
		token: string,
	): Promise<
		| {
				id: string;
				statusFieldId: string;
				statusOptions: Record<string, string>;
		  }
		| undefined
	> {
		try {
			const graphqlWithAuth = graphql.defaults({
				headers: {
					authorization: `token ${token}`,
				},
			});

			// Find projects that contain issues from this repository
			const response: any = await graphqlWithAuth(
				`
        query($owner: String!, $name: String!) {
          repository(owner: $owner, name: $name) {
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
				{ owner, name },
			);

			// Find the first project with a Status field
			const projects = response.repository.issues.nodes
				.flatMap((issue: any) =>
					issue.projectItems.nodes.map((item: any) => item.project),
				)
				.filter((project: any) => project);

			for (const project of projects) {
				const statusField = project.fields.nodes.find(
					(field: any) => field.name === "Status" && field.options,
				);

				if (statusField) {
					const statusOptions: Record<string, string> = {};
					for (const option of statusField.options) {
						const key = option.name.toLowerCase().replace(/[^a-z]/g, "");
						statusOptions[key] = option.id;
					}

					return {
						id: project.id,
						statusFieldId: statusField.id,
						statusOptions,
					};
				}
			}

			logger.debug("No GitHub project with Status field found");
			return undefined;
		} catch (error: any) {
			logger.debug(`Failed to detect GitHub project: ${error?.message}`);
			return undefined;
		}
	}

	/**
	 * Create configuration from detected values
	 */
	createConfig(detected: DetectedProject): Partial<Config> {
		const config: Partial<Config> = {
			project: {
				owner: detected.owner,
				name: detected.name,
				defaultBranch: detected.defaultBranch,
				workingBranch: detected.workingBranch || "staging",
			},
		};

		// Always create github config object, even if project detection failed
		config.github = {
			projectId: detected.githubProject?.id || null,
			statusFieldId: detected.githubProject?.statusFieldId || null,
			statusOptions: detected.githubProject?.statusOptions || {},
		};

		if (detected.botUsername) {
			config.bot = {
				tokenEnvVar: "GITHUB_BOT_TOKEN",
				username: detected.botUsername,
			};
		}

		return config;
	}
}
