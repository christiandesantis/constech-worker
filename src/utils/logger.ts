/** biome-ignore-all lint/suspicious/noExplicitAny: will fix later */
import chalk from "chalk";

export interface Logger {
	info(message: string, ...args: any[]): void;
	success(message: string, ...args: any[]): void;
	warning(message: string, ...args: any[]): void;
	error(message: string, ...args: any[]): void;
	debug(message: string, ...args: any[]): void;
}

class ConsoleLogger implements Logger {
	private debugEnabled =
		process.env.DEBUG?.includes("constech-worker") || false;

	info(message: string, ...args: any[]): void {
		console.log(chalk.blue("[INFO]"), message, ...args);
	}

	success(message: string, ...args: any[]): void {
		console.log(chalk.green("[SUCCESS]"), message, ...args);
	}

	warning(message: string, ...args: any[]): void {
		console.log(chalk.yellow("[WARNING]"), message, ...args);
	}

	error(message: string, ...args: any[]): void {
		console.error(chalk.red("[ERROR]"), message, ...args);
	}

	debug(message: string, ...args: any[]): void {
		if (this.debugEnabled) {
			console.log(chalk.gray("[DEBUG]"), message, ...args);
		}
	}
}

export const logger = new ConsoleLogger();
