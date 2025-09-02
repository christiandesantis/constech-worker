import { logger } from "./logger.js";

export type CleanupFunction = () => Promise<void> | void;

class CleanupManager {
	private static instance: CleanupManager;
	private cleanupFunctions: CleanupFunction[] = [];
	private isShuttingDown = false;
	private signalHandlersRegistered = false;

	static getInstance(): CleanupManager {
		if (!CleanupManager.instance) {
			CleanupManager.instance = new CleanupManager();
		}
		return CleanupManager.instance;
	}

	registerCleanup(cleanup: CleanupFunction): void {
		this.cleanupFunctions.push(cleanup);
	}

	unregisterCleanup(cleanup: CleanupFunction): void {
		const index = this.cleanupFunctions.indexOf(cleanup);
		if (index > -1) {
			this.cleanupFunctions.splice(index, 1);
		}
	}

	registerSignalHandlers(): void {
		if (this.signalHandlersRegistered) {
			return;
		}

		const signalHandler = async (signal: string) => {
			if (this.isShuttingDown) {
				// Force exit if already shutting down
				logger.error("⚠️  Force terminating...");
				process.exit(1);
			}

			this.isShuttingDown = true;
			logger.info(`\n📴 Received ${signal}, cleaning up...`);

			try {
				await this.executeCleanup();
				logger.success("✅ Cleanup completed successfully");
				process.exit(0);
				// biome-ignore lint/suspicious/noExplicitAny: will fix later
			} catch (error: any) {
				logger.error("✖ Cleanup failed:", error.message);
				process.exit(1);
			}
		};

		// Handle various termination signals
		process.on("SIGINT", () => signalHandler("SIGINT"));
		process.on("SIGTERM", () => signalHandler("SIGTERM"));
		process.on("SIGHUP", () => signalHandler("SIGHUP"));

		// Handle uncaught exceptions and unhandled rejections
		process.on("uncaughtException", async (error) => {
			logger.error("Uncaught Exception:", error);
			if (!this.isShuttingDown) {
				await this.executeCleanup().catch(() => {});
			}
			process.exit(1);
		});

		process.on("unhandledRejection", async (reason) => {
			logger.error("Unhandled Rejection:", reason);
			if (!this.isShuttingDown) {
				await this.executeCleanup().catch(() => {});
			}
			process.exit(1);
		});

		this.signalHandlersRegistered = true;
	}

	async executeCleanup(): Promise<void> {
		if (this.cleanupFunctions.length === 0) {
			logger.debug("No cleanup functions registered");
			return;
		}

		logger.debug(
			`Executing ${this.cleanupFunctions.length} cleanup functions...`,
		);

		const cleanupPromises = this.cleanupFunctions.map(
			async (cleanup, index) => {
				try {
					await cleanup();
					logger.debug(`Cleanup function ${index + 1} completed`);
					// biome-ignore lint/suspicious/noExplicitAny: will fix later
				} catch (error: any) {
					logger.warning(
						`Cleanup function ${index + 1} failed:`,
						error.message,
					);
				}
			},
		);

		// Wait for all cleanup functions to complete (or fail)
		await Promise.allSettled(cleanupPromises);
	}

	isShutdown(): boolean {
		return this.isShuttingDown;
	}
}

export const cleanupManager = CleanupManager.getInstance();

// Utility function to exit gracefully with cleanup
export async function exitGracefully(
	code: number = 0,
	message?: string,
): Promise<never> {
	if (message) {
		if (code === 0) {
			logger.success(message);
		} else {
			logger.error(message);
		}
	}

	try {
		await cleanupManager.executeCleanup();
		process.exit(code);
		// biome-ignore lint/suspicious/noExplicitAny: will fix later
	} catch (error: any) {
		logger.error("Cleanup failed during exit:", error.message);
		process.exit(1);
	}
}
