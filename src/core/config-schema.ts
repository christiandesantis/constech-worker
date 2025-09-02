import { z } from "zod";

export const ConfigSchema = z.object({
	project: z.object({
		owner: z.string().min(1),
		name: z.string().min(1),
		defaultBranch: z.string().default("main"),
		workingBranch: z.string().default("staging"),
	}),
	github: z
		.object({
			projectId: z.string().nullable().optional(),
			statusFieldId: z.string().nullable().optional(),
			statusOptions: z
				.object({
					backlog: z.string().nullable().optional(),
					ready: z.string().nullable().optional(),
					inProgress: z.string().nullable().optional(),
					inReview: z.string().nullable().optional(),
					done: z.string().nullable().optional(),
				})
				.optional(),
		})
		.optional(),
	bot: z.object({
		tokenEnvVar: z.string().default("GITHUB_BOT_TOKEN"),
		username: z.string().nullable().optional(),
	}),
	docker: z.object({
		devContainerPath: z.string().default(".devcontainer"),
		customImage: z.string().nullable().optional(),
		nodeVersion: z.string().default("20"),
		mcpServers: z
			.object({
				github: z.boolean().default(true),
				semgrep: z.boolean().default(false),
				ref: z.boolean().default(false),
			})
			.default({
				github: true,
				semgrep: false,
				ref: false,
			}),
	}),
	workflow: z.object({
		qualityChecks: z
			.array(z.string())
			.default(["pnpm typecheck", "pnpm check", "pnpm build"]),
		packageManager: z.enum(["npm", "yarn", "pnpm"]).default("pnpm"),
		reviewerEnvVar: z.string().default("REVIEWER_USER"),
		defaultReviewer: z.string().nullable().optional(),
	}),
	git: z.object({
		authorName: z.string().default("constech-worker"),
		authorEmail: z.string().default("constech-worker@users.noreply.github.com"),
	}),
});

export type Config = z.infer<typeof ConfigSchema>;

export const DefaultConfig: Partial<Config> = {
	project: {
		defaultBranch: "main",
		workingBranch: "staging",
		owner: "auto-detect",
		name: "auto-detect",
	},
	bot: {
		tokenEnvVar: "GITHUB_BOT_TOKEN",
		username: "auto-detect",
	},
	docker: {
		devContainerPath: ".devcontainer",
		nodeVersion: "20",
		mcpServers: {
			github: true,
			semgrep: false,
			ref: false,
		},
	},
	workflow: {
		qualityChecks: ["pnpm typecheck", "pnpm check", "pnpm build"],
		packageManager: "pnpm",
		reviewerEnvVar: "REVIEWER_USER",
	},
	git: {
		authorName: "constech-worker",
		authorEmail: "constech-worker@users.noreply.github.com",
	},
};
