import {
  ActivityType,
  Client,
  GatewayIntentBits,
  type Message,
  type TextBasedChannel,
} from "discord.js";
import { createLogger, type Logger } from "./logger.js";
import type { AllowedMentionType, LogLevel } from "./types.js";

type SendableChannel = TextBasedChannel & {
  send: (content: string) => Promise<Message>;
};

const channelCache = new Map<string, SendableChannel>();
let clientInstance: Client<boolean> | null = null;
let logger: Logger;

function log(level: LogLevel, ...args: unknown[]): void {
  logger(level, "[DiscordClient]", ...args);
}

function ensureClient(): Client<boolean> {
  if (!clientInstance) {
    throw new Error("Discord client has not been initialized.");
  }

  return clientInstance;
}

function assertSendable(
  channel: TextBasedChannel,
  channelId: string,
): asserts channel is SendableChannel {
  if (typeof (channel as SendableChannel).send !== "function") {
    throw new Error(`Channel ${channelId} cannot send messages.`);
  }
}

async function getChannel(channelId: string): Promise<SendableChannel> {
  const client = ensureClient();
  const cached = channelCache.get(channelId);
  if (cached) {
    return cached;
  }

  const channel = await client.channels.fetch(channelId);
  if (!channel || !channel.isTextBased()) {
    throw new Error(
      `Channel ${channelId} is not a text-based channel or could not be fetched.`,
    );
  }

  assertSendable(channel, channelId);
  channelCache.set(channelId, channel);
  return channel;
}

export async function initializeDiscordClient(
  token: string,
  allowedMentions: readonly AllowedMentionType[],
  logLevel: LogLevel,
): Promise<Client<boolean>> {
  if (clientInstance) {
    return clientInstance;
  }

  logger = createLogger(logLevel);
  clientInstance = new Client({
    intents: [
      GatewayIntentBits.Guilds,
      GatewayIntentBits.GuildMessages,
      GatewayIntentBits.MessageContent,
      GatewayIntentBits.GuildMessageReactions,
    ],
    allowedMentions: { parse: [...allowedMentions] },
    partials: [],
  });

  await clientInstance.login(token);
  return clientInstance;
}

export async function sendMessage(
  channelId: string,
  message: string,
): Promise<Message> {
  const channel = await getChannel(channelId);

  const maxAttempts = 3;
  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    try {
      const sentMessage = await channel.send(message);
      return sentMessage;
    } catch (error) {
      if (attempt === maxAttempts) {
        throw error;
      }

      const delay = 500 * attempt;
      await new Promise((resolve) => setTimeout(resolve, delay));
    }
  }

  throw new Error("Failed to send message after all retry attempts");
}

export async function cleanup(): Promise<void> {
  if (!clientInstance) {
    return;
  }

  channelCache.clear();
  await clientInstance.destroy();
  clientInstance = null;
}

export async function updatePlayerCount(playerCount: number): Promise<void> {
  const client = ensureClient();
  const user = client.user;

  if (!user) {
    log("warn", "Discord client is not ready to update presence yet.");
    return;
  }

  user.setPresence({
    activities: [
      {
        name: `Players Online: ${playerCount}`,
        type: ActivityType.Custom,
      },
    ],
    status: "online",
  });
}
