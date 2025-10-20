export type EventType = "join" | "leave" | "death" | "chat";

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

export interface Config {
  cubyz: CubyzConnectionConfig;
  connection: ConnectionRetryConfig;
  discord: {
    token: string;
    channelId: string;
  };
  events: EventType[];
  censorlist: string[];
  excludeBotFromCount: boolean;
}

export interface ChatMessage {
  type: EventType;
  username: string;
  rawUsername: string;
  message?: string;
  timestamp: Date;
  metadata?: Record<string, string>;
}
