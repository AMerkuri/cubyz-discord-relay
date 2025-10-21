import {
  ActivityType,
  Client,
  GatewayIntentBits,
  type TextBasedChannel,
} from "discord.js";
import type { AllowedMentionType } from "./types.js";

type SendableChannel = TextBasedChannel & {
  send: (content: string) => Promise<unknown>;
};

const channelCache = new Map<string, SendableChannel>();
let clientInstance: Client<boolean> | null = null;

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
): Promise<Client<boolean>> {
  if (clientInstance) {
    return clientInstance;
  }

  clientInstance = new Client({
    intents: [
      GatewayIntentBits.Guilds,
      GatewayIntentBits.GuildMessages,
      GatewayIntentBits.MessageContent,
    ],
    allowedMentions: { parse: [...allowedMentions] },
  });

  await clientInstance.login(token);
  return clientInstance;
}

export async function sendMessage(
  channelId: string,
  message: string,
): Promise<void> {
  const channel = await getChannel(channelId);

  const maxAttempts = 3;
  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    try {
      await channel.send(message);
      return;
    } catch (error) {
      if (attempt === maxAttempts) {
        throw error;
      }

      const delay = 500 * attempt;
      await new Promise((resolve) => setTimeout(resolve, delay));
    }
  }
}

export async function cleanup(): Promise<void> {
  if (!clientInstance) {
    return;
  }

  channelCache.clear();
  await clientInstance.destroy();
  clientInstance = null;
}

export async function updatePresence(playerCount: number): Promise<void> {
  const client = ensureClient();
  const user = client.user;

  if (!user) {
    console.warn("Discord client is not ready to update presence yet.");
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
