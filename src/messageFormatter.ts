import type { ChatMessage, Config, EventType } from "./types.js";

const FORMATTED_USERNAME_PATTERN =
	/(?:\*+|_+|~+)(?:#[0-9A-Fa-f]{6}.)+(?:\*+|_+|~+)(?:§#[0-9A-Fa-f]{6})?/;

export function isFormattedUsername(username: string): boolean {
	return FORMATTED_USERNAME_PATTERN.test(username);
}

export function cleanUsername(raw: string): string {
	const withoutSuffix = raw.replace(/§#[0-9A-Fa-f]{6}$/g, "");

	const colorCharMatches = [
		...withoutSuffix.matchAll(/#[0-9A-Fa-f]{6}([A-Za-z0-9_])/g),
	];
	if (colorCharMatches.length > 0) {
		return colorCharMatches.map((match) => match[1]).join("");
	}

	const stripped = withoutSuffix
		.replace(/[*~_[\]]/g, "")
		.replace(/#[0-9A-Fa-f]{6}/g, "")
		.trim();

	return stripped;
}

export function formatMessage(chatMessage: ChatMessage): string {
	const username =
		chatMessage.username || cleanUsername(chatMessage.rawUsername);

	switch (chatMessage.type) {
		case "join":
			return `👋 ${username} joined the game`;
		case "leave":
			return `👋 ${username} left the game`;
		case "death":
			return `💀 ${username} ${chatMessage.message ?? "died"}`;
		case "chat":
			return `${username}: ${chatMessage.message ?? ""}`;
		default:
			return `${username}: ${chatMessage.message ?? ""}`;
	}
}

export function shouldRelayEvent(
	eventType: EventType,
	config: Config,
): boolean {
	return config.events.includes(eventType);
}
