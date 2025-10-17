export type EventType = "join" | "leave" | "death" | "chat";

export interface ServerMonitoringConfig {
	enabled: boolean;
	port: number;
	intervalSeconds: number;
}

export interface Config {
	cubyzLogPath: string;
	discord: {
		token: string;
		channelId: string;
	};
	events: EventType[];
	updateIntervalMs: number;
	updatePresence: boolean;
	monitoring: ServerMonitoringConfig;
}

export interface ChatMessage {
	type: EventType;
	username: string;
	rawUsername: string;
	message?: string;
	timestamp: Date;
}
