import { access, copyFile, mkdir, readFile } from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";
import type {
  AllowedMentionType,
  Config,
  ConnectionRetryConfig,
  CubyzConnectionConfig,
  EventType,
} from "./types.js";

const DEFAULT_EVENTS: EventType[] = ["join", "leave", "death", "chat"];
const SUPPORTED_EVENTS: EventType[] = [...DEFAULT_EVENTS];
const DEFAULT_CENSORLIST: string[] = [];
const DEFAULT_EXCLUDED_USERNAMES: string[] = [];
const DEFAULT_CUBYZ: CubyzConnectionConfig = {
  host: "127.0.0.1",
  port: 47649,
  botName: "Discord",
  version: "0.0.0",
  logLevel: "info",
};
const DEFAULT_CONNECTION: ConnectionRetryConfig = {
  reconnect: true,
  maxRetries: 0,
  retryDelayMs: 30000,
};
const DEFAULT_ALLOWED_MENTIONS: AllowedMentionType[] = [];
const DEFAULT_EXCLUDE_BOT_FROM_COUNT = true;
const DEFAULT_STARTUP_MESSAGE_DELAY = 0;
const CONFIG_TEMPLATE_PATH = fileURLToPath(
  new URL("../config.example.json", import.meta.url),
);

const ALLOWED_MENTION_TYPES: AllowedMentionType[] = [
  "roles",
  "users",
  "everyone",
];

const isAllowedMentionType = (value: unknown): value is AllowedMentionType =>
  typeof value === "string" &&
  ALLOWED_MENTION_TYPES.includes(value as AllowedMentionType);

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

function coercePort(value: unknown, fallback: number): number {
  if (
    typeof value === "number" &&
    Number.isInteger(value) &&
    value > 0 &&
    value <= 65535
  ) {
    return value;
  }
  return fallback;
}

function coerceString(value: unknown, fallback: string): string {
  return typeof value === "string" && value.trim().length > 0
    ? value.trim()
    : fallback;
}

function applyDefaults(partial: Partial<Config>): Config {
  const events =
    Array.isArray(partial.events) && partial.events.length > 0
      ? [...partial.events]
      : DEFAULT_EVENTS;

  const censorlistSource = Array.isArray(partial.censorlist)
    ? partial.censorlist
    : DEFAULT_CENSORLIST;

  const censorlist = censorlistSource
    .filter((entry): entry is string => typeof entry === "string")
    .map((entry) => entry.trim())
    .filter((entry) => entry.length > 0);

  const startupMessages = Array.isArray(partial.startupMessages)
    ? partial.startupMessages
        .filter((entry): entry is string => typeof entry === "string")
        .map((entry) => entry.trim())
        .filter((entry) => entry.length > 0)
    : [];

  const excludedUsernamesSource = Array.isArray(partial.excludedUsernames)
    ? partial.excludedUsernames
    : DEFAULT_EXCLUDED_USERNAMES;

  const excludedUsernames = excludedUsernamesSource
    .filter((entry): entry is string => typeof entry === "string")
    .map((entry) => entry.trim())
    .filter((entry) => entry.length > 0);

  const cubyz: CubyzConnectionConfig = {
    host: coerceString(partial.cubyz?.host, DEFAULT_CUBYZ.host),
    port: coercePort(partial.cubyz?.port, DEFAULT_CUBYZ.port),
    botName: coerceString(partial.cubyz?.botName, DEFAULT_CUBYZ.botName),
    version: coerceString(partial.cubyz?.version, DEFAULT_CUBYZ.version),
    logLevel: (() => {
      const v = partial.cubyz?.logLevel;
      return typeof v === "string" && v.trim().length > 0
        ? (v.trim() as CubyzConnectionConfig["logLevel"])
        : DEFAULT_CUBYZ.logLevel;
    })(),
  };

  const allowedMentionsSource = Array.isArray(partial.discord?.allowedMentions)
    ? partial.discord.allowedMentions
    : DEFAULT_ALLOWED_MENTIONS;

  const allowedMentions = Array.from(
    new Set(allowedMentionsSource.filter(isAllowedMentionType)),
  );

  const connection: ConnectionRetryConfig = {
    reconnect:
      typeof partial.connection?.reconnect === "boolean"
        ? partial.connection.reconnect
        : DEFAULT_CONNECTION.reconnect,
    maxRetries:
      typeof partial.connection?.maxRetries === "number" &&
      Number.isInteger(partial.connection.maxRetries) &&
      partial.connection.maxRetries >= 0
        ? partial.connection.maxRetries
        : DEFAULT_CONNECTION.maxRetries,
    retryDelayMs:
      typeof partial.connection?.retryDelayMs === "number" &&
      partial.connection.retryDelayMs >= 0
        ? Math.floor(partial.connection.retryDelayMs)
        : DEFAULT_CONNECTION.retryDelayMs,
  };

  return {
    cubyz,
    connection,
    discord: {
      token: coerceString(partial.discord?.token, ""),
      channelId: coerceString(partial.discord?.channelId, ""),
      allowedMentions,
    },
    events: events as EventType[],
    censorlist,
    startupMessages,
    startupMessageDelay:
      typeof partial.startupMessageDelay === "number" &&
      partial.startupMessageDelay >= 0
        ? Math.floor(partial.startupMessageDelay)
        : DEFAULT_STARTUP_MESSAGE_DELAY,
    excludeBotFromCount:
      typeof partial.excludeBotFromCount === "boolean"
        ? partial.excludeBotFromCount
        : DEFAULT_EXCLUDE_BOT_FROM_COUNT,
    excludedUsernames,
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
  if (!config.cubyz || typeof config.cubyz !== "object") {
    throw new Error('Configuration error: "cubyz" section is required.');
  }

  if (
    typeof config.cubyz.host !== "string" ||
    config.cubyz.host.trim().length === 0
  ) {
    throw new Error(
      'Configuration error: "cubyz.host" must be a non-empty string.',
    );
  }

  if (
    typeof config.cubyz.port !== "number" ||
    !Number.isInteger(config.cubyz.port) ||
    config.cubyz.port <= 0 ||
    config.cubyz.port > 65535
  ) {
    throw new Error(
      'Configuration error: "cubyz.port" must be an integer between 1 and 65535.',
    );
  }

  if (
    typeof config.cubyz.botName !== "string" ||
    config.cubyz.botName.trim().length === 0
  ) {
    throw new Error(
      'Configuration error: "cubyz.botName" must be a non-empty string.',
    );
  }

  if (
    typeof config.cubyz.version !== "string" ||
    config.cubyz.version.trim().length === 0
  ) {
    throw new Error(
      'Configuration error: "cubyz.version" must be a non-empty string.',
    );
  }

  // Validate optional logLevel if provided
  const allowedLogLevels = [
    "error",
    "debug",
    "info",
    "warn",
    "silent",
  ] as const;
  if (
    typeof config.cubyz.logLevel !== "string" ||
    !(allowedLogLevels as readonly string[]).includes(config.cubyz.logLevel)
  ) {
    throw new Error(
      `Configuration error: "cubyz.logLevel" must be one of: ${allowedLogLevels.join(", ")}.`,
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

  if (!Array.isArray(config.discord.allowedMentions)) {
    throw new Error(
      'Configuration error: "discord.allowedMentions" must be an array.',
    );
  }

  const unsupportedAllowedMentions = config.discord.allowedMentions.filter(
    (entry) => !ALLOWED_MENTION_TYPES.includes(entry),
  );

  if (unsupportedAllowedMentions.length > 0) {
    throw new Error(
      `Configuration error: "discord.allowedMentions" contains unsupported entries: ${unsupportedAllowedMentions.join(", ")}.`,
    );
  }

  if (!Array.isArray(config.events) || config.events.length === 0) {
    throw new Error(
      'Configuration error: "events" must include at least one supported event type.',
    );
  }

  const unknownEvents = config.events.filter(
    (event) => !SUPPORTED_EVENTS.includes(event),
  );
  if (unknownEvents.length > 0) {
    throw new Error(
      `Configuration error: unsupported event types: ${unknownEvents.join(", ")}.`,
    );
  }

  if (!Array.isArray(config.censorlist)) {
    throw new Error(
      'Configuration error: "censorlist" must be an array of non-empty strings.',
    );
  }

  const invalidCensorlistEntries = config.censorlist.filter(
    (entry) => typeof entry !== "string" || entry.trim().length === 0,
  );
  if (invalidCensorlistEntries.length > 0) {
    throw new Error(
      'Configuration error: "censorlist" must contain only non-empty strings.',
    );
  }

  if (!Array.isArray(config.startupMessages)) {
    throw new Error(
      'Configuration error: "startupMessages" must be an array of non-empty strings.',
    );
  }

  const invalidStartupMessages = config.startupMessages.filter(
    (entry) => typeof entry !== "string" || entry.trim().length === 0,
  );

  if (invalidStartupMessages.length > 0) {
    throw new Error(
      'Configuration error: "startupMessages" must contain only non-empty strings.',
    );
  }

  if (typeof config.excludeBotFromCount !== "boolean") {
    throw new Error(
      'Configuration error: "excludeBotFromCount" must be a boolean value.',
    );
  }

  if (!Array.isArray(config.excludedUsernames)) {
    throw new Error(
      'Configuration error: "excludedUsernames" must be an array of non-empty strings.',
    );
  }

  const invalidExcludedUsernames = config.excludedUsernames.filter(
    (entry) => typeof entry !== "string" || entry.trim().length === 0,
  );

  if (invalidExcludedUsernames.length > 0) {
    throw new Error(
      'Configuration error: "excludedUsernames" must contain only non-empty strings.',
    );
  }

  if (typeof config.connection?.reconnect !== "boolean") {
    throw new Error(
      'Configuration error: "connection.reconnect" must be a boolean value.',
    );
  }

  if (
    typeof config.connection.maxRetries !== "number" ||
    !Number.isInteger(config.connection.maxRetries) ||
    config.connection.maxRetries < 0
  ) {
    throw new Error(
      'Configuration error: "connection.maxRetries" must be a non-negative integer.',
    );
  }

  if (
    typeof config.connection.retryDelayMs !== "number" ||
    config.connection.retryDelayMs < 0
  ) {
    throw new Error(
      'Configuration error: "connection.retryDelayMs" must be a non-negative number.',
    );
  }
}

export async function loadConfig(configPath: string): Promise<Config> {
  const resolvedPath = path.resolve(process.cwd(), configPath);
  await ensureConfigFile(resolvedPath);
  const raw = await readFile(resolvedPath, "utf8");
  const parsedUnknown = JSON.parse(raw) as Record<string, unknown>;
  if ("cubyzLogPath" in parsedUnknown) {
    throw new Error(
      "Configuration error: detected legacy log-based settings. Update the configuration file to use the bot connection schema.",
    );
  }
  const config = applyDefaults(parsedUnknown as Partial<Config>);
  validateConfig(config);
  return config;
}
