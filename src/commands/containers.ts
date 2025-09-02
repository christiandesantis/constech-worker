/** biome-ignore-all lint/suspicious/noExplicitAny: will fix later */
import chalk from "chalk";
import Docker from "dockerode";
import { exitGracefully } from "../utils/cleanup-manager.js";
import { logger } from "../utils/logger.js";

interface ContainerOptions {
	all?: boolean;
	clean?: boolean;
	force?: boolean;
}

export async function containersCommand(
	options: ContainerOptions = {},
): Promise<void> {
	const docker = new Docker();

	try {
		if (options.clean) {
			await cleanupOrphanedContainers(docker, options.force || false);
			return;
		}

		await listConsWorkerContainers(docker, options.all);
	} catch (error: any) {
		logger.error("Failed to manage containers:", error.message);
		await exitGracefully(1);
	}
}

async function listConsWorkerContainers(
	docker: Docker,
	showAll: boolean = false,
): Promise<void> {
	console.log("\n📦 Constech Worker Containers");
	console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");

	try {
		const containers = await docker.listContainers({ all: showAll });

		// Filter containers that look like constech-worker containers
		const workerContainers = containers.filter(
			(container) =>
				container.Names.some(
					(name) =>
						name.includes("constech") ||
						name.includes("worker") ||
						container.Image.includes("constech"),
				) ||
				// Look for containers using our typical patterns
				(container.Image.includes("node") &&
					container.Mounts?.some(
						(mount) => mount.Destination === "/workspace",
					)),
		);

		if (workerContainers.length === 0) {
			console.log(chalk.green("✅ No constech-worker containers found"));
			return;
		}

		console.log(`Found ${workerContainers.length} container(s):\n`);

		workerContainers.forEach((container) => {
			const id = container.Id.slice(0, 12);
			const name = container.Names[0]?.replace("/", "") || "unnamed";
			const status = container.State;
			const created = new Date(container.Created * 1000).toLocaleString();

			const statusColor =
				status === "running"
					? chalk.green
					: status === "exited"
						? chalk.yellow
						: chalk.red;

			console.log(`${chalk.bold("Container:")} ${id}`);
			console.log(`  ${chalk.gray("Name:")} ${name}`);
			console.log(`  ${chalk.gray("Status:")} ${statusColor(status)}`);
			console.log(`  ${chalk.gray("Image:")} ${container.Image}`);
			console.log(`  ${chalk.gray("Created:")} ${created}`);

			if (container.Ports && container.Ports.length > 0) {
				const ports = container.Ports.map((p) =>
					p.PublicPort ? `${p.PublicPort}:${p.PrivatePort}` : p.PrivatePort,
				).join(", ");
				console.log(`  ${chalk.gray("Ports:")} ${ports}`);
			}

			console.log(); // Empty line between containers
		});

		// Show cleanup suggestions
		const stoppedContainers = workerContainers.filter(
			(c) => c.State === "exited",
		);
		if (stoppedContainers.length > 0) {
			console.log(chalk.yellow("💡 Cleanup suggestions:"));
			console.log(
				`   • Remove stopped containers: ${chalk.cyan("constech-worker containers --clean")}`,
			);
			console.log(
				`   • Force remove all (including running): ${chalk.cyan("constech-worker containers --clean --force")}`,
			);
		}
	} catch (error: any) {
		logger.error("Failed to list containers:", error.message);
		throw error;
	}
}

async function cleanupOrphanedContainers(
	docker: Docker,
	force: boolean,
): Promise<void> {
	console.log("\n🧹 Cleaning up orphaned constech-worker containers");
	console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");

	try {
		const containers = await docker.listContainers({ all: true });

		// Filter containers that look like constech-worker containers
		const workerContainers = containers.filter(
			(container) =>
				container.Names.some(
					(name) => name.includes("constech") || name.includes("worker"),
				) ||
				container.Image.includes("constech") ||
				(container.Image.includes("node") &&
					container.Mounts?.some(
						(mount) => mount.Destination === "/workspace",
					)),
		);

		if (workerContainers.length === 0) {
			console.log(chalk.green("✅ No containers to clean up"));
			return;
		}

		console.log(`Found ${workerContainers.length} container(s) to clean up:\n`);

		let cleaned = 0;
		let failed = 0;

		for (const containerInfo of workerContainers) {
			const id = containerInfo.Id.slice(0, 12);
			const name = containerInfo.Names[0]?.replace("/", "") || "unnamed";
			const isRunning = containerInfo.State === "running";

			console.log(`Processing: ${name} (${id}) - ${containerInfo.State}`);

			if (isRunning && !force) {
				console.log(
					`  ${chalk.yellow("⚠️  Skipping running container (use --force to remove)")}`,
				);
				continue;
			}

			try {
				const container = docker.getContainer(containerInfo.Id);

				// Stop if running
				if (isRunning) {
					console.log(`  ${chalk.blue("⏹  Stopping container...")}`);
					await container.stop({ t: 5 });
				}

				// Remove container
				console.log(`  ${chalk.blue("🗑  Removing container...")}`);
				await container.remove({ force: true });
				console.log(`  ${chalk.green("✅ Removed successfully")}`);
				cleaned++;
			} catch (error: any) {
				console.log(`  ${chalk.red("✖ Failed to remove:")} ${error.message}`);
				failed++;
			}

			console.log(); // Empty line between containers
		}

		// Summary
		console.log(chalk.bold("Cleanup Summary:"));
		console.log(`  ${chalk.green("✅ Cleaned:")} ${cleaned}`);
		if (failed > 0) {
			console.log(`  ${chalk.red("✖ Failed:")} ${failed}`);
		}

		if (cleaned > 0) {
			console.log(`\n${chalk.green("🎉 Cleanup completed!")}`);
		}
	} catch (error: any) {
		logger.error("Failed to cleanup containers:", error.message);
		throw error;
	}
}
