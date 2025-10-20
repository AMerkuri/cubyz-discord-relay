import { cleanUsername } from "./messageFormatter.js";
import type { ChatMessage } from "./types.js";

export function parseChatMessage(message: string): ChatMessage | null {
  const timestamp = new Date();

  const chatMatch = /^\[(.+?)\]\s*([\s\S]*)$/.exec(message);
  if (chatMatch) {
    const rawUsername = chatMatch[1].trim();
    const message = chatMatch[2].trim();
    return {
      type: "chat",
      rawUsername,
      username: cleanUsername(rawUsername),
      message,
      timestamp,
    };
  }

  const joinMatch = /^(.+?) joined$/.exec(message);
  if (joinMatch) {
    const rawUsername = joinMatch[1].trim();
    return {
      type: "join",
      rawUsername,
      username: cleanUsername(rawUsername),
      timestamp,
    };
  }

  const leaveMatch = /^(.+?) left$/.exec(message);
  if (leaveMatch) {
    const rawUsername = leaveMatch[1].trim();
    return {
      type: "leave",
      rawUsername,
      username: cleanUsername(rawUsername),
      timestamp,
    };
  }

  const deathMatch = /^(.+?) died(.*)$/.exec(message);
  if (deathMatch) {
    const rawUsername = deathMatch[1].trim();
    const message = `died${deathMatch[2]}`.trim();
    return {
      type: "death",
      rawUsername,
      username: cleanUsername(rawUsername),
      message,
      timestamp,
    };
  }

  return null;
}
