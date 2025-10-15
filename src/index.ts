#!/usr/bin/env node
import process from "node:process";
import readline from "node:readline";
import { ConfigTemplateCreatedError, loadConfig } from "./config.js";
import {
	cleanup,
	initializeDiscordClient,
	sendMessage,
} from "./discordClient.js";
import {
	initializePosition,
	parseChatLine,
	readNewLines,
} from "./logParser.js";
import { formatMessage, shouldRelayEvent } from "./messageFormatter.js";
import type { ChatMessage, Config } from "./types.js";

const DEFAULT_CONFIG_PATH = "config.json";

let isRunning = true;
let isShuttingDown = false;
let readlineInterface: readline.Interface | null = null;

const delay = (ms: number): Promise<void> =>
	new Promise((resolve) => {
		setTimeout(resolve, ms);
	});

function getConfigPath(): string {
	const [, , providedPath] = process.argv;
	return providedPath ?? DEFAULT_CONFIG_PATH;
}

async function relayMessages(
	config: Config,
	chatMessages: ChatMessage[],
): Promise<void> {
	for (const chatMessage of chatMessages) {
		if (!shouldRelayEvent(chatMessage.type, config)) {
			continue;
		}

		const payload = formatMessage(chatMessage);
		try {
			await sendMessage(config.discord.channelId, payload);
		} catch (error) {
			console.error("Failed to send message to Discord:", error);
		}
	}
}

async function pollLoop(config: Config): Promise<void> {
	let lastPosition = await initializePosition(config.cubyzLogPath);
	let warnedMissingFile = false;

	while (isRunning) {
		try {
			const previousPosition = lastPosition;
			const { lines, newPosition, fileMissing } = await readNewLines(
				config.cubyzLogPath,
				lastPosition,
			);

			if (fileMissing && !warnedMissingFile) {
				console.warn("Log file not found. Waiting for it to appear...");
				warnedMissingFile = true;
			}

			if (!fileMissing && warnedMissingFile) {
				console.info("Log file detected. Resuming monitoring.");
				warnedMissingFile = false;
				lastPosition = await initializePosition(config.cubyzLogPath);
				await delay(config.updateIntervalMs);
				continue;
			}

			if (!fileMissing && newPosition < previousPosition) {
				console.info(
					"Log file size decreased. Assuming rotation and continuing from new end.",
				);
			}

			lastPosition = newPosition;

			if (lines.length > 0) {
				const messages: ChatMessage[] = [];
				for (const line of lines) {
					const chatMessage = parseChatLine(line);
					if (chatMessage) {
						messages.push(chatMessage);
					}
				}

				if (messages.length > 0) {
					await relayMessages(config, messages);
				}
			}
		} catch (error) {
			console.error("Error while processing log file:", error);
		}

		await delay(config.updateIntervalMs);
	}
}

async function shutdown(): Promise<void> {
	if (isShuttingDown) {
		return;
	}

	isShuttingDown = true;
	isRunning = false;

	if (readlineInterface) {
		readlineInterface.close();
		readlineInterface = null;
	}

	try {
		await cleanup();
	} catch (error) {
		console.error("Error during cleanup:", error);
	}
}

function setupQuitHandler(): void {
	readlineInterface = readline.createInterface({
		input: process.stdin,
		output: process.stdout,
		terminal: false,
	});

	readlineInterface.on("line", (input: string) => {
		if (input.trim().toLowerCase() === "q") {
			void shutdown();
		}
	});

	process.on("SIGINT", () => {
		console.log("\nReceived SIGINT. Shutting down...");
		void shutdown();
	});

	console.log("Press q + Enter to quit.");
}

async function main(): Promise<void> {
	try {
		const configPath = getConfigPath();
		const config = await loadConfig(configPath);

		console.log("Connecting to Discord...");
		await initializeDiscordClient(config.discord.token);
		console.log("Connected to Discord.");

		setupQuitHandler();

		console.log(`Monitoring log file: ${config.cubyzLogPath}`);
		await pollLoop(config);
	} catch (error) {
		if (error instanceof ConfigTemplateCreatedError) {
			console.warn(error.message);
			console.warn("Update the generated config file and run the command again.");
			process.exitCode = 1;
		} else {
			console.error("Fatal error:", error);
			process.exitCode = 1;
		}
	} finally {
		await shutdown();
	}
}

void main();
