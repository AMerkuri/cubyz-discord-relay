#!/usr/bin/env node
import process from "node:process";
import type { Key } from "node:readline";
import readline from "node:readline";
import { BotConnectionManager } from "./botConnection.js";
import { ConfigTemplateCreatedError, loadConfig } from "./config.js";
import type { IntegrationStatusContext } from "./integrations/base.js";
import { IntegrationManager } from "./integrations/index.js";
import { createLogger, type Logger } from "./logger.js";
import { delay } from "./utils.js";

const DEFAULT_CONFIG_PATH = "config.json";

let bot: BotConnectionManager | null = null;
let log: Logger;
let integrationManager: IntegrationManager | null = null;
let keypressHandler: ((str: string, key: Key) => void) | null = null;
let rawModeEnabled = false;
let isShuttingDown = false;
let hasActiveConnection = false;

type DisconnectionContext = {
  reason: Exclude<NonNullable<IntegrationStatusContext["reason"]>, "connected">;
  attempts?: number;
};

function getConfigPath(): string {
  const [, , providedPath] = process.argv;
  return providedPath ?? DEFAULT_CONFIG_PATH;
}

async function handleDisconnectionEvent(
  payload: DisconnectionContext,
): Promise<void> {
  if (integrationManager) {
    try {
      await integrationManager.updateStatus("offline", payload);
    } catch (error) {
      log("error", "Failed to update integrations on disconnect:", error);
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
    log("error", "Failed to stop bot:", error);
  }

  try {
    if (integrationManager) {
      await integrationManager.stopAll();
      integrationManager = null;
    }
  } catch (error) {
    log("error", "Failed to stop integrations:", error);
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
    log("info", "\nReceived SIGINT. Shutting down...");
    void shutdown();
  });

  log("info", "Press q to quit.");
}

async function main(): Promise<void> {
  try {
    const configPath = getConfigPath();
    const config = await loadConfig(configPath);
    log = createLogger(config.logLevel);

    bot = new BotConnectionManager(
      config.cubyz,
      config.connection,
      config.logLevel,
      config.excludeBotFromCount,
      config.excludedUsernames,
    );

    integrationManager = new IntegrationManager(config, { bot });

    bot.on("connected", async () => {
      log("info", "Bot connected to Cubyz server.");
      hasActiveConnection = true;

      if (integrationManager) {
        try {
          await integrationManager.updateStatus("online", {
            reason: "connected",
          });
        } catch (error) {
          log("error", "Failed to notify integrations of connection:", error);
        }
      }

      const activeBot = bot;
      if (activeBot && config.startupMessages.length > 0) {
        for (const message of config.startupMessages) {
          if (config.startupMessageDelay > 0) {
            await delay(config.startupMessageDelay);
          }
          try {
            await activeBot.sendChat(message);
          } catch (error) {
            log("error", "Failed to send startup message to Cubyz:", error);
          }
        }
      }
    });

    bot.on("disconnected", (payload) => {
      log("debug", "Bot disconnected from Cubyz server.");
      if (!hasActiveConnection) {
        return;
      }
      hasActiveConnection = false;
      void handleDisconnectionEvent(payload);
    });

    bot.on("chat", (chatMessage) => {
      if (!integrationManager) {
        return;
      }
      void integrationManager.relayChatMessage(chatMessage);
    });

    bot.on("players", (payload) => {
      log(
        "debug",
        `Received players update: ${payload.players.length} player(s) online.`,
      );
      if (!integrationManager) {
        return;
      }
      void integrationManager.updatePlayers(payload.players);
    });

    bot.on("gamemode", (gamemode) => {
      log("debug", `Received gamemode update: ${gamemode}`);
      if (!integrationManager) {
        return;
      }
      void integrationManager.updateGamemode(gamemode);
    });

    bot.on("reconnecting", ({ attempt, maxRetries, delayMs }) => {
      const total = maxRetries === null ? "∞" : maxRetries;
      log("info", `Reconnecting in ${delayMs}ms (attempt ${attempt}/${total})`);
    });

    bot.on("error", (error) => {
      log("error", "Bot connection error:", error);
    });

    setupQuitHandler();

    await integrationManager.startAll();
    await bot.start();
  } catch (error) {
    if (error instanceof ConfigTemplateCreatedError) {
      log("warn", error.message);
      log(
        "warn",
        "Update the generated config file and run the command again.",
      );
      process.exitCode = 1;
    } else {
      log("error", "Fatal error:", error);
      process.exitCode = 1;
    }
    await shutdown();
  }
}

void main();
