import type { Gamemode } from "cubyz-node-client";
import type {
  Client,
  Message,
  MessageReaction,
  PartialMessageReaction,
  PartialUser,
  User,
} from "discord.js";
import type { BotConnectionManager } from "../botConnection.js";
import {
  cleanup as cleanupDiscordClient,
  initializeDiscordClient,
  sendMessage,
  updatePlayerCount as updateDiscordPresence,
} from "../discordClient.js";
import { createLogger, type Logger } from "../logger.js";
import {
  cleanUsername,
  formatMessage,
  shouldRelayEvent,
} from "../messageFormatter.js";
import type { ChatMessage, Config, LogLevel } from "../types.js";
import type { BaseIntegration, IntegrationStatusContext } from "./base.js";

interface CachedMessage {
  rawUsername: string;
  username: string;
  content: string;
  timestamp: number;
}

const MESSAGE_CACHE_TTL_MS = 60 * 60 * 1000; // 1 hour
const DEFAULT_CUBYZ_COLOR_RESET = "#FFFFFF";

const collapseWhitespace = (input: string): string =>
  input.replace(/\s+/g, " ").trim();

export class DiscordIntegration implements BaseIntegration {
  readonly name = "Discord";

  private readonly config: Config;
  private readonly messageCache = new Map<string, CachedMessage>();
  private readonly botNormalizedName: string;
  private client: Client<boolean> | null = null;
  private bot: BotConnectionManager | null = null;
  private isReady = false;
  private readonly logger: Logger;

  constructor(config: Config) {
    this.config = config;
    this.botNormalizedName = cleanUsername(config.cubyz.botName).toLowerCase();
    this.logger = createLogger(config.logLevel);
  }

  private log(level: LogLevel, ...args: unknown[]) {
    this.logger(level, `[${this.name}]`, ...args);
  }

  setBotConnection(bot: BotConnectionManager): void {
    this.bot = bot;
  }

  async start(): Promise<void> {
    if (!this.config.discord.enabled || this.isReady) {
      return;
    }

    this.log("info", "Connecting to Discord...");
    const client = await initializeDiscordClient(
      this.config.discord.token,
      this.config.discord.allowedMentions,
      this.config.logLevel,
    );
    this.client = client;
    this.log("info", "Connected to Discord.");

    client.on("messageCreate", this.handleMessageCreate);
    client.on("messageReactionAdd", this.handleReactionAdd);

    this.isReady = true;
    await this.sendMessage("**🤖 Bot has joined chat**");
    await this.updatePresence(0);
  }

  async stop(): Promise<void> {
    if (!this.config.discord.enabled || !this.isReady) {
      return;
    }

    await this.sendMessage("**🤖 Bot has left chat**");

    this.isReady = false;
    const client = this.client;
    if (client) {
      client.off("messageCreate", this.handleMessageCreate);
      client.off("messageReactionAdd", this.handleReactionAdd);
    }

    this.messageCache.clear();
    this.client = null;
    await cleanupDiscordClient();
  }

  async updatePlayers(players: readonly string[]): Promise<void> {
    if (!this.isActive()) {
      return;
    }

    await this.updatePresence(players.length);
  }

  async updateStatus(
    status: "online" | "offline",
    context?: IntegrationStatusContext,
  ): Promise<void> {
    if (!this.isActive()) {
      return;
    }

    if (status === "offline") {
      await this.updatePresence(0);
    }

    const statusMessage = this.resolveStatusMessage(status, context);
    if (statusMessage) {
      await this.sendMessage(statusMessage);
    }
  }

  async updateGamemode(_gamemode: Gamemode) {}

  async relayChatMessage(chatMessage: ChatMessage): Promise<void> {
    if (!this.isActive()) {
      return;
    }

    if (!shouldRelayEvent(chatMessage.type, this.config)) {
      return;
    }

    if (
      chatMessage.type === "chat" &&
      this.botNormalizedName.length > 0 &&
      chatMessage.username.toLowerCase() === this.botNormalizedName
    ) {
      return;
    }

    try {
      const payload = formatMessage(chatMessage, this.config);
      const sentMessage = await sendMessage(
        this.config.discord.channelId,
        payload,
      );

      if (chatMessage.type === "chat" && chatMessage.message) {
        this.messageCache.set(sentMessage.id, {
          rawUsername: chatMessage.rawUsername,
          username: chatMessage.username,
          content: chatMessage.message,
          timestamp: Date.now(),
        });

        if (this.messageCache.size % 50 === 0) {
          this.cleanMessageCache();
        }
      }
    } catch (error) {
      this.log("error", "Failed to send message to Discord:", error);
    }
  }

  async sendMessage(message: string): Promise<void> {
    if (!this.isActive() || message.trim().length === 0) {
      return;
    }

    try {
      await sendMessage(this.config.discord.channelId, message);
    } catch (error) {
      this.log("error", "Failed to send notification to Discord:", error);
    }
  }

  private cleanMessageCache(): void {
    const now = Date.now();
    for (const [id, entry] of this.messageCache.entries()) {
      if (now - entry.timestamp > MESSAGE_CACHE_TTL_MS) {
        this.messageCache.delete(id);
      }
    }
  }

  private async updatePresence(playerCount: number): Promise<void> {
    if (!this.isActive()) {
      return;
    }

    try {
      await updateDiscordPresence(playerCount);
    } catch (error) {
      this.log("error", "Failed to update Discord presence:", error);
    }
  }

  private readonly handleMessageCreate = async (
    message: Message,
  ): Promise<void> => {
    if (!this.isActive()) {
      return;
    }

    if (message.channelId !== this.config.discord.channelId) {
      return;
    }

    if (message.author.bot || message.system) {
      return;
    }

    const normalizedContent = collapseWhitespace(message.cleanContent);
    if (normalizedContent.length === 0) {
      return;
    }

    if (!this.bot) {
      this.log(
        "warn",
        "Received Discord message before Cubyz connection was ready.",
      );
      return;
    }

    const name = this.resolveDiscordDisplayName(message);
    const color = this.resolveDiscordHexColor(message);

    let payload =
      color && color !== "#FFFFFF"
        ? `${color}${name}${DEFAULT_CUBYZ_COLOR_RESET}: ${normalizedContent}`
        : `${name}: ${normalizedContent}`;

    if (this.config.discord.enableReplies && message.reference?.messageId) {
      const referencedMsg = this.messageCache.get(message.reference.messageId);
      if (referencedMsg) {
        const replyPrefix = `replying to ${referencedMsg.rawUsername}: *"${referencedMsg.content}"*`;
        const fullMessage = `${replyPrefix} - ${normalizedContent}`;
        payload =
          color && color !== "#FFFFFF"
            ? `${color}${name}${DEFAULT_CUBYZ_COLOR_RESET}: ${fullMessage}`
            : `${name}: ${fullMessage}`;
      }
    }

    try {
      await this.bot.sendChat(payload);
    } catch (error) {
      this.log("error", "Failed to relay Discord message to Cubyz:", error);
    }
  };

  private readonly handleReactionAdd = async (
    reaction: MessageReaction | PartialMessageReaction,
    user: User | PartialUser,
  ): Promise<void> => {
    if (!this.config.discord.enableReactions || !this.isActive()) {
      return;
    }

    if (reaction.partial) {
      try {
        await reaction.fetch();
      } catch (error) {
        this.log("error", "Failed to fetch reaction:", error);
        return;
      }
    }

    if (reaction.message.channelId !== this.config.discord.channelId) {
      return;
    }

    if ("bot" in user && user.bot) {
      return;
    }

    if (!this.bot) {
      this.log(
        "warn",
        "Received Discord reaction before Cubyz connection was ready.",
      );
      return;
    }

    const guild = reaction.message.guild;
    const member = guild
      ? await guild.members.fetch(user.id).catch(() => null)
      : null;

    const candidateName =
      member?.displayName ??
      ("globalName" in user && user.globalName) ??
      ("username" in user && user.username) ??
      (user.id ? `User${user.id.slice(-4)}` : null);

    if (!candidateName) {
      return;
    }

    const reactorName = cleanUsername(candidateName);
    if (reactorName.length === 0) {
      return;
    }

    const emoji = reaction.emoji.name ?? "?";
    const referencedMsg = this.messageCache.get(reaction.message.id);

    let payload: string;
    if (referencedMsg) {
      payload = `${reactorName} reacted to ${referencedMsg.rawUsername}: *"${referencedMsg.content}"* with ${emoji}`;
    } else {
      payload = `${reactorName} reacted with ${emoji}`;
    }

    try {
      await this.bot.sendChat(payload);
    } catch (error) {
      this.log("error", "Failed to relay Discord reaction to Cubyz:", error);
    }
  };

  private resolveDiscordDisplayName(message: Message): string {
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
  }

  private resolveDiscordHexColor(message: Message): string | null {
    const hex = message.member?.displayHexColor;
    if (!hex || hex === "#000000") {
      return null;
    }

    return hex.toUpperCase();
  }

  private isActive(): boolean {
    return this.config.discord.enabled && this.isReady && this.client !== null;
  }

  private resolveStatusMessage(
    status: "online" | "offline",
    context?: IntegrationStatusContext,
  ): string | null {
    if (status === "online") {
      return context?.reason === "connected"
        ? "🟢 **Bot connected to server**"
        : null;
    }

    switch (context?.reason) {
      case "retries-exhausted": {
        const attemptText =
          typeof context.attempts === "number" && context.attempts > 0
            ? ` after ${context.attempts} attempts`
            : "";
        return `❌ **Failed to reconnect${attemptText}**`;
      }
      case "server":
        return "🔴 **Bot disconnected from server**";
      case "error":
        return "⚠️ **Bot connection failed**";
      default:
        return null;
    }
  }
}
