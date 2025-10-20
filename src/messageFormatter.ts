import type { ChatMessage, Config, EventType } from "./types.js";

export function cleanUsername(raw: string): string {
  let result = raw;

  result = result.replace(/§#[0-9A-Fa-f]{6}/g, "");
  result = result.replace(/#[0-9A-Fa-f]{6}/g, "");
  result = result.replace(/[*~_[\]]/g, "");
  result = result.replace(/[^\p{L}\p{N}_\- ]/gu, "");

  return result.trim();
}

const censorMessage = (
  message: string,
  censorlist: readonly string[],
): string => {
  if (!message || censorlist.length === 0) {
    return message;
  }

  const normalizedTerms = censorlist
    .map((entry) => entry.trim().toLowerCase())
    .filter((entry) => entry.length > 0);

  if (normalizedTerms.length === 0) {
    return message;
  }

  return message
    .split(/(\s+)/)
    .map((segment) => {
      if (segment.trim().length === 0) {
        return segment;
      }

      const lowerSegment = segment.toLowerCase();
      const containsTerm = normalizedTerms.some((term) =>
        lowerSegment.includes(term),
      );

      return containsTerm ? "||beep||" : segment;
    })
    .join("");
};

const stripCubyzColorCodes = (value: string): string =>
  value.replace(/§#[0-9A-Fa-f]{6}/g, "").replace(/#[0-9A-Fa-f]{6}/g, "");

export function formatMessage(
  chatMessage: ChatMessage,
  config?: Config,
): string {
  const username = chatMessage.username;

  switch (chatMessage.type) {
    case "join":
      return `👋 **${username} joined the game**`;
    case "leave":
      return `🚪 **${username} left the game**`;
    case "death":
      return `💀 **${username} ${chatMessage.message ?? "died"}**`;
    case "chat":
      return `**${username}**: ${censorMessage(
        stripCubyzColorCodes(chatMessage.message ?? "").trimStart(),
        config?.censorlist ?? [],
      )}`;
    default:
      return `**${username}**: ${chatMessage.message ?? ""}`;
  }
}

export function shouldRelayEvent(
  eventType: EventType,
  config: Config,
): boolean {
  return config.events.includes(eventType);
}
