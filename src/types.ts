export type EventType = "join" | "leave" | "death" | "chat";

export interface Config {
	cubyzLogPath: string;
	discord: {
		token: string;
		channelId: string;
	};
	events: EventType[];
	updateIntervalMs: number;
	updatePresence: boolean;
}

export interface ChatMessage {
	type: EventType;
	username: string;
	rawUsername: string;
	message?: string;
	timestamp: Date;
}
