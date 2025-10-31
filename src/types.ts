export type EventType = "join" | "leave" | "death" | "chat";

export type AllowedMentionType = "roles" | "users" | "everyone";

export type LogLevel = "error" | "debug" | "info" | "warn" | "silent";

export interface CubyzConnectionConfig {
  host: string;
  port: number;
  botName: string;
  version: string;
}

export interface ConnectionRetryConfig {
  reconnect: boolean;
  maxRetries: number;
  retryDelayMs: number;
}

export interface CubyzListSiteConfig {
  enabled: boolean;
  serverName: string;
  serverIp: string;
  serverPort: number;
  iconUrl?: string;
  customClientDownloadUrl?: string;
}

export interface IntegrationConfig {
  cubyzlistSite: CubyzListSiteConfig;
}

export interface Config {
  logLevel: LogLevel;
  cubyz: CubyzConnectionConfig;
  connection: ConnectionRetryConfig;
  discord: {
    enabled: boolean;
    token: string;
    channelId: string;
    allowedMentions: AllowedMentionType[];
    enableReactions: boolean;
    enableReplies: boolean;
  };
  startupMessages: string[];
  startupMessageDelay: number;
  events: EventType[];
  censorlist: string[];
  excludeBotFromCount: boolean;
  excludedUsernames: string[];
  integration: IntegrationConfig;
}

export interface ChatMessage {
  type: EventType;
  username: string;
  rawUsername: string;
  message?: string;
  timestamp: Date;
  metadata?: Record<string, string>;
}
