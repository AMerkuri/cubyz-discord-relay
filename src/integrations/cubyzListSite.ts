import net from "node:net";
import type { Gamemode } from "cubyz-node-client";
import type { BotConnectionManager } from "../botConnection.js";
import { createLogger, type Logger } from "../logger.js";
import type {
  ChatMessage,
  Config,
  CubyzListSiteConfig,
  LogLevel,
} from "../types.js";
import type { BaseIntegration, IntegrationStatusContext } from "./base.js";

/**
 * Integration that sends server status updates to the Cubyz list site
 * via TCP socket connection to api.ashframe.net:5001.
 * Sends periodic updates every 5 minutes to keep the listing fresh.
 * @link https://cubyzlist.site
 */
export class CubyzListSiteIntegration implements BaseIntegration {
  readonly name = "CubyzListSite";

  private currentPlayers: Set<string> = new Set();
  private currentStatus: "online" | "offline" = "offline";
  private gamemode: string | null = null;
  private lastUpdateTime = 0;
  private periodicUpdateInterval: NodeJS.Timeout | null = null;
  private readonly UPDATE_INTERVAL_MS = 5 * 60 * 1000; // 5 minutes
  private isReady = false;
  private readonly config: CubyzListSiteConfig;
  private readonly logger: Logger;

  constructor(config: Config) {
    this.config = config.integration.cubyzlistSite;
    this.logger = createLogger(config.logLevel);
  }

  private log(level: LogLevel, ...args: unknown[]) {
    this.logger(level, `[${this.name}]`, ...args);
  }

  setBotConnection(_bot: BotConnectionManager) {}

  async start(): Promise<void> {
    this.log("info", "Integration started");
    this.isReady = true;
    await this.sendUpdate();
    this.startPeriodicUpdates();
  }

  async stop(): Promise<void> {
    this.log("info", "Integration stopped");
    this.stopPeriodicUpdates();
    this.currentStatus = "offline";
    this.currentPlayers.clear();
    await this.sendUpdate();
    this.isReady = false;
  }

  async updatePlayers(players: readonly string[]): Promise<void> {
    this.currentPlayers = new Set(players);
    await this.sendUpdate();
  }

  async updateStatus(
    status: "online" | "offline",
    _context?: IntegrationStatusContext,
  ): Promise<void> {
    this.currentStatus = status;
    if (this.currentStatus === "offline") {
      this.currentPlayers.clear();
    }
    await this.sendUpdate();
  }

  async updateGamemode(gamemode: Gamemode): Promise<void> {
    switch (gamemode) {
      case 0:
        this.gamemode = "survival";
        break;
      case 1:
        this.gamemode = "creative";
        break;
    }
    await this.sendUpdate();
  }

  async relayChatMessage(_chatMessage: ChatMessage) {}

  async sendMessage(_message: string) {}

  private startPeriodicUpdates(): void {
    this.stopPeriodicUpdates();

    this.periodicUpdateInterval = setInterval(() => {
      const timeSinceLastUpdate = Date.now() - this.lastUpdateTime;
      if (timeSinceLastUpdate >= this.UPDATE_INTERVAL_MS) {
        this.log("debug", "Sending periodic update (5 minutes elapsed)");
        this.sendUpdate().catch((error) => {
          this.log("error", "Periodic update failed:", error);
        });
      }
    }, 60000);

    // Prevent the interval from keeping the process alive
    this.periodicUpdateInterval.unref?.();
  }

  private stopPeriodicUpdates(): void {
    if (this.periodicUpdateInterval) {
      clearInterval(this.periodicUpdateInterval);
      this.periodicUpdateInterval = null;
    }
  }

  private async sendUpdate(): Promise<void> {
    if (!this.isReady) {
      return;
    }

    const payload = {
      server_id: this.config.serverName,
      player_count: this.currentPlayers.size,
      status: this.currentStatus,
      gamemode: this.gamemode,
      ip:
        this.config.serverIp +
        (this.config.serverPort ? `:${this.config.serverPort}` : ""),
      icon: this.config.iconUrl ?? "",
      client_download: this.config.customClientDownloadUrl ?? "",
      script_version: "1.4",
      timestamp: Math.floor(Date.now() / 1000),
    };

    const dataString = JSON.stringify(payload);

    return new Promise((resolve, reject) => {
      const socket = net.createConnection(
        { host: "api.ashframe.net", port: 5001 },
        () => {
          this.log("debug", "Sending update:", dataString);
          socket.write(dataString, "utf-8");
          socket.end();
        },
      );

      socket.on("error", (error) => {
        this.log("error", "TCP connection error:", error.message);
        reject(error);
      });

      socket.on("close", () => {
        this.lastUpdateTime = Date.now();
        resolve();
      });

      // Timeout after 5 seconds
      socket.setTimeout(5000, () => {
        socket.destroy();
        reject(new Error("[CubyzListSite] Connection timeout"));
      });
    });
  }
}
