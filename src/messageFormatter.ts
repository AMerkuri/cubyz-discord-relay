import type { ChatMessage, Config, EventType } from "./types.js";

export function cleanUsername(raw: string): string {
	let result = raw;

	result = result.replace(/§#[0-9A-Fa-f]{6}/g, "");
	result = result.replace(/#[0-9A-Fa-f]{6}/g, "");
	result = result.replace(/[*~_[\]]/g, "");
	result = result.replace(/[^\p{L}\p{N}_\- ]/gu, "");

	return result.trim();
}

export function formatMessage(chatMessage: ChatMessage): string {
	const username =
		chatMessage.username || cleanUsername(chatMessage.rawUsername);

	switch (chatMessage.type) {
		case "join":
			return `👋 **${username} joined the game**`;
		case "leave":
			return `🚪 **${username} left the game**`;
		case "death":
			return `💀 **${username} ${chatMessage.message ?? "died"}**`;
		case "chat":
			return `**${username}**: ${chatMessage.message ?? ""}`;
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
