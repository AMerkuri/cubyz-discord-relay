#!/usr/bin/env node
import process from "node:process";
import type { Key } from "node:readline";
import readline from "node:readline";
import type { Client, Message } from "discord.js";
import { BotConnectionManager } from "./botConnection.js";
import { ConfigTemplateCreatedError, loadConfig } from "./config.js";
import {
  cleanup,
  initializeDiscordClient,
  sendMessage,
  updatePlayerCount as updateDiscordPresence,
} from "./discordClient.js";
import {
  cleanUsername,
  formatMessage,
  shouldRelayEvent,
} from "./messageFormatter.js";
import type { ChatMessage, Config } from "./types.js";
import { delay } from "./utils.js";

const DEFAULT_CONFIG_PATH = "config.json";
const DEFAULT_CUBYZ_COLOR_RESET = "#FFFFFF";
const MESSAGE_CACHE_TTL_MS = 3600000; // 1 hour

interface CachedMessage {
  rawUsername: string;
  username: string;
  content: string;
  timestamp: number;
}

const messageCache = new Map<string, CachedMessage>();

let botNormalizedName = "";

let bot: BotConnectionManager | null = null;
let keypressHandler: ((str: string, key: Key) => void) | null = null;
let rawModeEnabled = false;
let isShuttingDown = false;
let hasActiveConnection = false;

function getConfigPath(): string {
  const [, , providedPath] = process.argv;
  return providedPath ?? DEFAULT_CONFIG_PATH;
}

const collapseWhitespace = (input: string): string =>
  input.replace(/\s+/g, " ").trim();

function cleanMessageCache(): void {
  const now = Date.now();
  for (const [id, entry] of messageCache.entries()) {
    if (now - entry.timestamp > MESSAGE_CACHE_TTL_MS) {
      messageCache.delete(id);
    }
  }
}

const resolveDiscordDisplayName = (message: Message): string => {
  const preferred =
    message.member?.displayName ??
    message.author.globalName ??
    message.author.username;

  const primary = cleanUsername(preferred ?? message.author.username);
  if (primary.length > 0) {
    return primary;
  }

  const fallback = cleanUsername(message.author.username);
  if (fallback.length > 0) {
    return fallback;
  }

  return `User${message.author.id.slice(-4)}`;
};

const resolveDiscordHexColor = (message: Message): string | null => {
  const hex = message.member?.displayHexColor;
  if (!hex || hex === "#000000") {
    return null;
  }

  return hex.toUpperCase();
};

function setupDiscordChatRelay(client: Client<boolean>, config: Config): void {
  client.on("messageCreate", async (message) => {
    if (message.channelId !== config.discord.channelId) {
      return;
    }

    if (message.author.bot || message.system) {
      return;
    }

    const normalizedContent = collapseWhitespace(message.cleanContent);
    if (normalizedContent.length === 0) {
      return;
    }

    if (!bot) {
      console.warn(
        "Received Discord message before Cubyz connection was ready.",
      );
      return;
    }

    const name = resolveDiscordDisplayName(message);
    const color = resolveDiscordHexColor(message);

    let payload =
      color && color !== "#FFFFFF"
        ? `${color}${name}${DEFAULT_CUBYZ_COLOR_RESET}: ${normalizedContent}`
        : `${name}: ${normalizedContent}`;

    if (config.discord.enableReplies && message.reference?.messageId) {
      const referencedMsg = messageCache.get(message.reference.messageId);
      if (referencedMsg) {
        // Format: [Name] replying to [OriginalUser]: [OriginalMessage] - [ReplyMessage]
        const replyPrefix = `replying to ${referencedMsg.rawUsername}: *"${referencedMsg.content}"*`;
        const fullMessage = `${replyPrefix} - ${normalizedContent}`;
        payload =
          color && color !== "#FFFFFF"
            ? `${color}${name}${DEFAULT_CUBYZ_COLOR_RESET}: ${fullMessage}`
            : `${name}: ${fullMessage}`;
      }
    }

    try {
      await bot.sendChat(payload);
    } catch (error) {
      console.error("Failed to relay Discord message to Cubyz:", error);
    }
  });

  client.on("messageReactionAdd", async (reaction, user) => {
    if (!config.discord.enableReactions) {
      return;
    }

    if (reaction.partial) {
      try {
        await reaction.fetch();
      } catch (error) {
        console.error("Failed to fetch reaction:", error);
        return;
      }
    }

    if (reaction.message.channelId !== config.discord.channelId) {
      return;
    }

    if (user.bot) {
      return;
    }

    if (!bot) {
      console.warn(
        "Received Discord reaction before Cubyz connection was ready.",
      );
      return;
    }

    const guild = reaction.message.guild;
    const member = guild
      ? await guild.members.fetch(user.id).catch(() => null)
      : null;

    let nameToClean: string;
    if (member?.displayName) {
      nameToClean = member.displayName;
    } else if (user.globalName) {
      nameToClean = user.globalName;
    } else {
      nameToClean = user.username ?? `User${user.id.slice(-4)}`;
    }

    const reactorName = cleanUsername(nameToClean);

    if (reactorName.length === 0) {
      return;
    }

    const emoji = reaction.emoji.name ?? "?";

    const referencedMsg = messageCache.get(reaction.message.id);

    let payload: string;
    if (referencedMsg) {
      // Format: [Name] reacted to [OriginalUser]: [OriginalMessage] with [emoji]
      payload = `${reactorName} reacted to ${referencedMsg.rawUsername}: *"${referencedMsg.content}"* with ${emoji}`;
    } else {
      // If message not in cache, just show the reaction without context
      payload = `${reactorName} reacted with ${emoji}`;
    }

    try {
      await bot.sendChat(payload);
    } catch (error) {
      console.error("Failed to relay Discord reaction to Cubyz:", error);
    }
  });
}

async function relayMessage(
  config: Config,
  chatMessage: ChatMessage,
): Promise<void> {
  if (!shouldRelayEvent(chatMessage.type, config)) {
    return;
  }

  if (
    chatMessage.type === "chat" &&
    botNormalizedName.length > 0 &&
    chatMessage.username.toLowerCase() === botNormalizedName
  ) {
    return;
  }

  const payload = formatMessage(chatMessage, config);
  try {
    const sentMessage = await sendMessage(config.discord.channelId, payload);

    if (chatMessage.type === "chat" && chatMessage.message) {
      messageCache.set(sentMessage.id, {
        rawUsername: chatMessage.rawUsername,
        username: chatMessage.username,
        content: chatMessage.message,
        timestamp: Date.now(),
      });

      if (messageCache.size % 50 === 0) {
        cleanMessageCache();
      }
    }
  } catch (error) {
    console.error("Failed to send message to Discord:", error);
  }
}

async function updatePlayerCount(players: readonly string[]): Promise<void> {
  try {
    await updateDiscordPresence(players.length);
  } catch (error) {
    console.error("Failed to update Discord presence:", error);
  }
}

async function handleDisconnection(
  config: Config,
  { reason, attempts }: { reason: string; attempts?: number },
): Promise<void> {
  try {
    await updateDiscordPresence(0);
  } catch (error) {
    console.error("Failed to update Discord presence:", error);
  }

  let message: string | null = null;
  if (reason === "retries-exhausted") {
    const attemptText =
      typeof attempts === "number" && attempts > 0
        ? ` after ${attempts} attempts`
        : "";
    message = `❌ **Failed to reconnect${attemptText}**`;
  } else if (reason === "server") {
    message = "🔴 **Bot disconnected from server**";
  } else if (reason === "error") {
    message = "⚠️ **Bot connection failed**";
  }

  if (message) {
    try {
      await sendMessage(config.discord.channelId, message);
    } catch (error) {
      console.error("Failed to send disconnection message to Discord:", error);
    }
  }
}

async function shutdown(): Promise<void> {
  if (isShuttingDown) {
    return;
  }

  isShuttingDown = true;

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
    if (bot) {
      await bot.stop();
      bot = null;
    }
  } catch (error) {
    console.error("Failed to stop bot:", error);
  }

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
    botNormalizedName = cleanUsername(config.cubyz.botName).toLowerCase();

    console.log("Connecting to Discord...");
    const discordClient = await initializeDiscordClient(
      config.discord.token,
      config.discord.allowedMentions,
    );
    console.log("Connected to Discord.");

    try {
      await updateDiscordPresence(0);
    } catch (error) {
      console.error("Failed to set initial Discord presence:", error);
    }

    bot = new BotConnectionManager(
      config.cubyz,
      config.connection,
      config.excludeBotFromCount,
      config.excludedUsernames,
    );

    setupDiscordChatRelay(discordClient, config);

    bot.on("connected", async () => {
      console.log("Bot connected to Cubyz server.");
      hasActiveConnection = true;
      const activeBot = bot;
      if (activeBot && config.startupMessages.length > 0) {
        for (const message of config.startupMessages) {
          if (config.startupMessageDelay > 0) {
            await delay(config.startupMessageDelay);
          }
          try {
            await activeBot.sendChat(message);
          } catch (error) {
            console.error("Failed to send startup message to Cubyz:", error);
          }
        }
      }
      try {
        await sendMessage(
          config.discord.channelId,
          "🟢 **Bot connected to server**",
        );
      } catch (error) {
        console.error("Failed to send connection message to Discord:", error);
      }
    });

    bot.on("disconnected", (payload) => {
      if (!hasActiveConnection) {
        return;
      }
      hasActiveConnection = false;
      void handleDisconnection(config, payload);
    });

    bot.on("chat", (chatMessage) => {
      void relayMessage(config, chatMessage);
    });

    bot.on("players", (payload) => {
      void updatePlayerCount(payload.players);
    });

    bot.on("reconnecting", ({ attempt, maxRetries, delayMs }) => {
      const total = maxRetries === null ? "∞" : maxRetries;
      console.log(`Reconnecting in ${delayMs}ms (attempt ${attempt}/${total})`);
    });

    bot.on("error", (error) => {
      console.error("Bot connection error:", error);
    });

    setupQuitHandler();

    await bot.start();
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
    await shutdown();
  }
}

void main();
