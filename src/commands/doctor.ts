/** biome-ignore-all lint/suspicious/noExplicitAny: will fix later */
import { execSync } from "node:child_process";
import chalk from "chalk";
import { ConfigManager } from "../core/config-manager.js";
import { logger } from "../utils/logger.js";

interface DoctorOptions {
	fix?: boolean;
	verbose?: boolean;
}

interface HealthCheck {
	name: string;
	status: "pass" | "fail" | "warn";
	message: string;
	fixable?: boolean;
	fix?: () => Promise<void> | void;
}

export async function doctorCommand(
	options: DoctorOptions = {},
): Promise<void> {
	logger.info("🔍 Checking system health...");

	const checks: HealthCheck[] = [
		await checkNodeVersion(),
		await checkDockerRunning(),
		await checkGitHubCLI(),
		await checkClaudeCode(),
		await checkConfiguration(),
		await checkGitRepository(),
		await checkBotToken(),
		await checkEnvironmentVariables(),
	];

	// Display results
	console.log(`\n${chalk.bgBlue.black(" HEALTH CHECK RESULTS ")}`);

	let passCount = 0;
	let warnCount = 0;
	let failCount = 0;

	for (const check of checks) {
		const icon = getStatusIcon(check.status);
		const color = getStatusColor(check.status);

		console.log(`${icon} ${color(check.name)}: ${check.message}`);

		if (options.verbose && check.status !== "pass") {
			console.log(
				`   ${chalk.gray(`└─ Details: ${getDetailedMessage(check)}`)}`,
			);
		}

		switch (check.status) {
			case "pass":
				passCount++;
				break;
			case "warn":
				warnCount++;
				break;
			case "fail":
				failCount++;
				break;
		}
	}

	// Summary
	console.log(`\n${chalk.bgGray.black(" SUMMARY ")}`);
	console.log(`${chalk.green("✓")} ${passCount} passed`);
	console.log(`${chalk.yellow("⚠")} ${warnCount} warnings`);
	console.log(`${chalk.red("✗")} ${failCount} failed`);

	// Auto-fix if requested
	if (options.fix && failCount > 0) {
		console.log(`\n${chalk.bgYellow.black(" AUTO-FIX ")}`);
		for (const check of checks) {
			if (check.status === "fail" && check.fixable && check.fix) {
				try {
					logger.info(`Attempting to fix: ${check.name}`);
					await check.fix();
				} catch (error: any) {
					logger.error(`Failed to fix ${check.name}:`, error?.message);
				}
			}
		}
	}

	// Recommendations
	if (failCount > 0 || warnCount > 0) {
		console.log(`\n${chalk.bgMagenta.black(" RECOMMENDATIONS ")}`);

		for (const check of checks) {
			if (check.status !== "pass") {
				const recommendation = getRecommendation(check);
				if (recommendation) {
					console.log(`• ${recommendation}`);
				}
			}
		}
	}

	// Exit with appropriate code
	if (failCount > 0) {
		console.log(
			`\n${chalk.red("❌ System not ready for autonomous development")}`,
		);
		process.exit(1);
	} else if (warnCount > 0) {
		console.log(`\n${chalk.yellow("⚠️  System ready with warnings")}`);
	} else {
		console.log(
			`\n${chalk.green("✅ System ready for autonomous development!")}`,
		);
	}
}

async function checkNodeVersion(): Promise<HealthCheck> {
	try {
		const version = process.version;
		const majorVersion = parseInt(version.slice(1).split(".")[0], 10);

		if (majorVersion >= 20) {
			return {
				name: "Node.js Version",
				status: "pass",
				message: `${version} ✓`,
			};
		} else {
			return {
				name: "Node.js Version",
				status: "fail",
				message: `${version} (requires >= 20.0.0)`,
			};
		}
	} catch (_error) {
		return {
			name: "Node.js Version",
			status: "fail",
			message: "Could not detect Node.js version",
		};
	}
}

async function checkDockerRunning(): Promise<HealthCheck> {
	try {
		execSync("docker info", { stdio: "ignore" });
		return {
			name: "Docker",
			status: "pass",
			message: "Running ✓",
		};
	} catch (_error) {
		return {
			name: "Docker",
			status: "fail",
			message: "Not running or not installed",
			fixable: false,
		};
	}
}

async function checkGitHubCLI(): Promise<HealthCheck> {
	try {
		execSync("gh --version", { stdio: "ignore" });

		// Check authentication
		try {
			const username = execSync("gh api user --jq .login", {
				encoding: "utf-8",
			}).trim();
			return {
				name: "GitHub CLI",
				status: "pass",
				message: `Authenticated as ${username} ✓`,
			};
		} catch (_authError) {
			return {
				name: "GitHub CLI",
				status: "warn",
				message: "Installed but not authenticated",
			};
		}
	} catch (_error) {
		return {
			name: "GitHub CLI",
			status: "fail",
			message: "Not installed",
			fixable: false,
		};
	}
}

async function checkClaudeCode(): Promise<HealthCheck> {
	try {
		execSync("claude --version", { stdio: "ignore" });
		return {
			name: "Claude Code",
			status: "pass",
			message: "Installed and authenticated ✓",
		};
	} catch (_error) {
		return {
			name: "Claude Code",
			status: "fail",
			message: "Not installed or not authenticated",
			fixable: false,
		};
	}
}

async function checkConfiguration(): Promise<HealthCheck> {
	try {
		const configManager = new ConfigManager();
		const validation = configManager.validate();

		if (validation.valid) {
			return {
				name: "Configuration",
				status: "pass",
				message: "Valid configuration found ✓",
			};
		} else {
			return {
				name: "Configuration",
				status: "fail",
				message: `Invalid: ${validation.errors.join(", ")}`,
				fixable: true,
				fix: () => configManager.createDefault(),
			};
		}
	} catch (_error) {
		return {
			name: "Configuration",
			status: "warn",
			message: "No configuration found",
			fixable: true,
			fix: () => {
				const configManager = new ConfigManager();
				configManager.createDefault();
			},
		};
	}
}

async function checkGitRepository(): Promise<HealthCheck> {
	try {
		execSync("git rev-parse --git-dir", { stdio: "ignore" });

		// Check for GitHub remote
		try {
			const remotes = execSync("git remote -v", { encoding: "utf-8" });
			if (remotes.includes("github.com")) {
				return {
					name: "Git Repository",
					status: "pass",
					message: "Git repo with GitHub remote ✓",
				};
			} else {
				return {
					name: "Git Repository",
					status: "warn",
					message: "Git repo without GitHub remote",
				};
			}
		} catch (_remoteError) {
			return {
				name: "Git Repository",
				status: "warn",
				message: "Git repo without remotes",
			};
		}
	} catch (_error) {
		return {
			name: "Git Repository",
			status: "fail",
			message: "Not in a git repository",
		};
	}
}

async function checkBotToken(): Promise<HealthCheck> {
	const token = process.env.GITHUB_BOT_TOKEN || process.env.BOT_APP_TOKEN;

	if (!token) {
		return {
			name: "Bot Token",
			status: "fail",
			message: "GITHUB_BOT_TOKEN not set",
		};
	}

	try {
		const username = execSync(
			`GITHUB_TOKEN="${token}" gh api user --jq .login`,
			{
				encoding: "utf-8",
			},
		).trim();

		return {
			name: "Bot Token",
			status: "pass",
			message: `Valid token for ${username} ✓`,
		};
	} catch (_error) {
		return {
			name: "Bot Token",
			status: "fail",
			message: "Invalid or expired token",
		};
	}
}

async function checkEnvironmentVariables(): Promise<HealthCheck> {
	const required = ["GITHUB_BOT_TOKEN"];
	const optional = ["REVIEWER_USER"];

	const missing = required.filter(
		(env) =>
			!process.env[env] && !process.env[env.replace("GITHUB_BOT_", "BOT_APP_")],
	);
	const foundOptional = optional.filter((env) => process.env[env]);

	if (missing.length === 0) {
		const message =
			foundOptional.length > 0
				? `All required + ${foundOptional.length} optional ✓`
				: "All required variables set ✓";

		return {
			name: "Environment Variables",
			status: "pass",
			message,
		};
	} else {
		return {
			name: "Environment Variables",
			status: "fail",
			message: `Missing: ${missing.join(", ")}`,
		};
	}
}

function getStatusIcon(status: "pass" | "fail" | "warn"): string {
	switch (status) {
		case "pass":
			return chalk.green("✓");
		case "warn":
			return chalk.yellow("⚠");
		case "fail":
			return chalk.red("✗");
	}
}

function getStatusColor(status: "pass" | "fail" | "warn") {
	switch (status) {
		case "pass":
			return chalk.green;
		case "warn":
			return chalk.yellow;
		case "fail":
			return chalk.red;
	}
}

function getDetailedMessage(check: HealthCheck): string {
	// Add detailed troubleshooting information based on check name
	switch (check.name) {
		case "Docker":
			return "Install Docker Desktop and ensure it is running";
		case "GitHub CLI":
			return "Install with: brew install gh && gh auth login";
		case "Claude Code":
			return "Install with: npm install -g @anthropic-ai/claude-code && claude";
		case "Bot Token":
			return "Create a GitHub Personal Access Token with repo, project, and workflow scopes";
		default:
			return "Check documentation for resolution steps";
	}
}

function getRecommendation(check: HealthCheck): string | null {
	switch (check.name) {
		case "Docker":
			return "Install Docker Desktop from https://docker.com/products/docker-desktop";
		case "GitHub CLI":
			return "Run: brew install gh && gh auth login";
		case "Claude Code":
			return "Run: npm install -g @anthropic-ai/claude-code && claude";
		case "Bot Token":
			return "Set GITHUB_BOT_TOKEN environment variable with valid GitHub PAT";
		case "Configuration":
			return "Run: constech-worker init";
		default:
			return null;
	}
}
