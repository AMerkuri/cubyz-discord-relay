import { access, copyFile, mkdir, readFile } from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";
import type { Config, EventType } from "./types.js";

const DEFAULT_EVENTS: EventType[] = ["join", "leave", "death", "chat"];
const DEFAULT_INTERVAL_MS = 1000;
const CONFIG_TEMPLATE_PATH = fileURLToPath(
	new URL("../config.example.json", import.meta.url),
);

const isNotFoundError = (error: unknown): boolean =>
	typeof error === "object" &&
	error !== null &&
	"code" in error &&
	(error as { code?: string }).code === "ENOENT";

export class ConfigTemplateCreatedError extends Error {
	readonly configPath: string;

	constructor(configPath: string) {
		super(
			`Configuration file not found. A template has been created at ${configPath}. Update it and rerun the cli.`,
		);
		this.name = "ConfigTemplateCreatedError";
		this.configPath = configPath;
	}
}

function applyDefaults(partial: Partial<Config>): Config {
	const events =
		Array.isArray(partial.events) && partial.events.length > 0
			? [...partial.events]
			: DEFAULT_EVENTS;

	return {
		cubyzLogPath: partial.cubyzLogPath ?? "",
		discord: {
			token: partial.discord?.token ?? "",
			channelId: partial.discord?.channelId ?? "",
		},
		events: events as EventType[],
		updateIntervalMs:
			typeof partial.updateIntervalMs === "number" &&
			partial.updateIntervalMs > 0
				? Math.floor(partial.updateIntervalMs)
				: DEFAULT_INTERVAL_MS,
	};
}

async function ensureConfigFile(resolvedPath: string): Promise<void> {
	try {
		await access(resolvedPath);
	} catch (error) {
		if (isNotFoundError(error)) {
			await mkdir(path.dirname(resolvedPath), { recursive: true });
			await copyFile(CONFIG_TEMPLATE_PATH, resolvedPath);
			throw new ConfigTemplateCreatedError(resolvedPath);
		}

		throw error;
	}
}

export function validateConfig(config: Config): void {
	if (!config.cubyzLogPath || typeof config.cubyzLogPath !== "string") {
		throw new Error(
			'Configuration error: "cubyzLogPath" must be a non-empty string.',
		);
	}

	if (!config.discord?.token || typeof config.discord.token !== "string") {
		throw new Error('Configuration error: "discord.token" must be provided.');
	}

	if (
		!config.discord?.channelId ||
		typeof config.discord.channelId !== "string"
	) {
		throw new Error(
			'Configuration error: "discord.channelId" must be provided.',
		);
	}

	if (!Array.isArray(config.events) || config.events.length === 0) {
		throw new Error(
			'Configuration error: "events" must include at least one supported event type.',
		);
	}

	const unknownEvents = config.events.filter(
		(event) => !DEFAULT_EVENTS.includes(event),
	);
	if (unknownEvents.length > 0) {
		throw new Error(
			`Configuration error: unsupported event types: ${unknownEvents.join(", ")}.`,
		);
	}

	if (
		typeof config.updateIntervalMs !== "number" ||
		config.updateIntervalMs <= 0
	) {
		throw new Error(
			'Configuration error: "updateIntervalMs" must be a positive number.',
		);
	}
}

export async function loadConfig(configPath: string): Promise<Config> {
	const resolvedPath = path.resolve(process.cwd(), configPath);
	await ensureConfigFile(resolvedPath);
	const raw = await readFile(resolvedPath, "utf8");
	const parsed = JSON.parse(raw) as Partial<Config>;
	const config = applyDefaults(parsed);
	validateConfig(config);
	return config;
}

export { DEFAULT_EVENTS, DEFAULT_INTERVAL_MS };
