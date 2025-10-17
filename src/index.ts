#!/usr/bin/env node
import process from "node:process";
import type { Key } from "node:readline";
import readline from "node:readline";
import { ConfigTemplateCreatedError, loadConfig } from "./config.js";
import {
	cleanup,
	initializeDiscordClient,
	sendMessage,
	updatePresence,
} from "./discordClient.js";
import {
	initializePosition,
	parseChatLine,
	readNewLines,
	scanFullLog,
} from "./logParser.js";
import { formatMessage, shouldRelayEvent } from "./messageFormatter.js";
import type { PlayerTracker } from "./playerTracker.js";
import { createPlayerTracker } from "./playerTracker.js";
import { isServerOnline } from "./serverMonitor.js";
import type { ChatMessage, Config } from "./types.js";

const DEFAULT_CONFIG_PATH = "config.json";

let isRunning = true;
let isShuttingDown = false;
let keypressHandler: ((str: string, key: Key) => void) | null = null;
let rawModeEnabled = false;

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

async function monitorServerStatus(config: Config): Promise<void> {
	const intervalMs = config.monitoring.intervalSeconds * 1000;
	let lastKnownOnline: boolean | null = null;

	while (isRunning) {
		let online = false;

		try {
			online = await isServerOnline(config.monitoring.port);
		} catch (error) {
			console.error("Failed to check server status:", error);
		}

		const statusChanged =
			lastKnownOnline === null || online !== lastKnownOnline;

		if (statusChanged) {
			const statusText = online ? "ONLINE" : "OFFLINE";
			const message = online
				? "🟢 **Server is online**"
				: "🔴 **Server is offline**";
			console.log(
				`Server monitor: Cubyz server is ${statusText.toLowerCase()}.`,
			);

			try {
				await sendMessage(config.discord.channelId, message);
				lastKnownOnline = online;
			} catch (error) {
				console.error("Failed to send server status to Discord:", error);
			}
		}

		if (!isRunning) {
			break;
		}

		await delay(intervalMs);
	}
}

async function pollLoop(config: Config, tracker: PlayerTracker): Promise<void> {
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
				let presenceNeedsUpdate = false;

				for (const line of lines) {
					const chatMessage = parseChatLine(line);
					if (!chatMessage) {
						continue;
					}

					messages.push(chatMessage);

					if (chatMessage.type === "join") {
						const previousCount = tracker.count;
						const newCount = tracker.increment(chatMessage.username);
						if (newCount !== previousCount) {
							presenceNeedsUpdate = true;
						}
					} else if (chatMessage.type === "leave") {
						const previousCount = tracker.count;
						const newCount = tracker.decrement(chatMessage.username);
						if (newCount !== previousCount) {
							presenceNeedsUpdate = true;
						}
					}
				}

				if (presenceNeedsUpdate && config.updatePresence) {
					try {
						await updatePresence(tracker.count);
					} catch (error) {
						console.error("Failed to update Discord presence:", error);
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

	if (keypressHandler) {
		process.stdin.off("keypress", keypressHandler);
		keypressHandler = null;
	}

	if (
		rawModeEnabled &&
		process.stdin.isTTY &&
		typeof process.stdin.setRawMode === "function"
	) {
		process.stdin.setRawMode(false);
		rawModeEnabled = false;
	}

	process.stdin.pause();

	try {
		await cleanup();
	} catch (error) {
		console.error("Error during cleanup:", error);
	}
}

function setupQuitHandler(): void {
	readline.emitKeypressEvents(process.stdin);

	if (process.stdin.isTTY && typeof process.stdin.setRawMode === "function") {
		process.stdin.setRawMode(true);
		rawModeEnabled = true;
	}

	process.stdin.resume();

	keypressHandler = (_input: string, key: Key) => {
		if (key.sequence === "\u0003" || (key.name === "c" && key.ctrl)) {
			process.emit("SIGINT");
			return;
		}

		if (key.name === "q" && !key.ctrl && !key.meta) {
			void shutdown();
		}
	};

	process.stdin.on("keypress", keypressHandler);

	process.on("SIGINT", () => {
		console.log("\nReceived SIGINT. Shutting down...");
		void shutdown();
	});

	console.log("Press q to quit.");
}

async function main(): Promise<void> {
	try {
		const configPath = getConfigPath();
		const config = await loadConfig(configPath);

		console.log("Connecting to Discord...");
		await initializeDiscordClient(config.discord.token);
		console.log("Connected to Discord.");

		console.info("Performing initial log scan to determine player count...");
		const tracker = createPlayerTracker();
		tracker.reset();

		const initialEvents = await scanFullLog(config.cubyzLogPath);
		for (const event of initialEvents) {
			if (event.type === "join") {
				tracker.increment(event.username);
			} else if (event.type === "leave") {
				tracker.decrement(event.username);
			}
		}

		console.info(`Initial player count: ${tracker.count}`);
		if (config.updatePresence) {
			try {
				await updatePresence(tracker.count);
			} catch (error) {
				console.error("Failed to set initial Discord presence:", error);
			}
		}

		setupQuitHandler();

		console.log(`Monitoring log file: ${config.cubyzLogPath}`);

		const tasks: Promise<void>[] = [pollLoop(config, tracker)];

		if (config.monitoring.enabled) {
			tasks.push(monitorServerStatus(config));
		}

		await Promise.all(tasks);
	} catch (error) {
		if (error instanceof ConfigTemplateCreatedError) {
			console.warn(error.message);
			console.warn(
				"Update the generated config file and run the command again.",
			);
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
