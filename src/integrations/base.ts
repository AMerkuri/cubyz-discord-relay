import type { Gamemode } from "cubyz-node-client";
import type { BotConnectionManager } from "../botConnection.js";
import type { ChatMessage } from "../types.js";

export interface IntegrationStatusContext {
  reason?: "connected" | "server" | "error" | "retries-exhausted" | "stopped";
  attempts?: number;
}

/**
 * Base interface for all integrations.
 * Integrations are modular components that can send updates to external services
 * based on server events (player joins/leaves, status changes, etc.).
 */
export interface BaseIntegration {
  /**
   * Unique identifier for this integration type.
   */
  readonly name: string;

  /**
   * Inject the active Cubyz bot connection so the integration can emit messages back to the server.
   * Called once during initialization before start().
   */
  setBotConnection(bot: BotConnectionManager): void;

  /**
   * Start the integration and establish any necessary connections.
   * Called on startup, regardless of whether the bot is connected to the Cubyz server.
   */
  start(): Promise<void>;

  /**
   * Stop the integration and clean up resources.
   * Called when the bot disconnects or shuts down.
   */
  stop(): Promise<void>;

  /**
   * Update the integration with current player list.
   * @param players - Array of currently connected player usernames
   */
  updatePlayers(players: readonly string[]): Promise<void>;

  /**
   * Update the integration with server status.
   * @param status - Server status ("online" | "offline")
   */
  updateStatus(
    status: "online" | "offline",
    context?: IntegrationStatusContext,
  ): Promise<void>;

  /**
   * Update the integration with current gamemode.
   * @param gamemode - Current server gamemode
   */
  updateGamemode(gamemode: Gamemode): Promise<void>;

  /**
   * Relay a chat message from the Cubyz server to the integration.
   * @param chatMessage - Normalized chat payload emitted by the Cubyz bot connection
   */
  relayChatMessage(chatMessage: ChatMessage): Promise<void>;

  /**
   * Deliver a plain-text message to the integration.
   * @param message - Message content to deliver
   */
  sendMessage(message: string): Promise<void>;
}
