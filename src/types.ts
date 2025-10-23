export type EventType = "join" | "leave" | "death" | "chat";

export type AllowedMentionType = "roles" | "users" | "everyone";

export interface CubyzConnectionConfig {
  host: string;
  port: number;
  botName: string;
  version: string;
  logLevel?: "error" | "debug" | "info" | "warn" | "silent";
}

export interface ConnectionRetryConfig {
  reconnect: boolean;
  maxRetries: number;
  retryDelayMs: number;
}

export interface Config {
  cubyz: CubyzConnectionConfig;
  connection: ConnectionRetryConfig;
  discord: {
    token: string;
    channelId: string;
    allowedMentions: AllowedMentionType[];
  };
  startupMessages: string[];
  startupMessageDelay: number;
  events: EventType[];
  censorlist: string[];
  excludeBotFromCount: boolean;
  excludedUsernames: string[];
}

export interface ChatMessage {
  type: EventType;
  username: string;
  rawUsername: string;
  message?: string;
  timestamp: Date;
  metadata?: Record<string, string>;
}
