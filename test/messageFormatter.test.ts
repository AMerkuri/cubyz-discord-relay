import { strict as assert } from "node:assert";
import test from "node:test";
import {
	cleanUsername,
	formatMessage,
	isFormattedUsername,
} from "../src/messageFormatter.js";
import type { ChatMessage } from "../src/types.js";

test("detects formatted usernames", () => {
	const formatted = "***#6A5ACDM#8A2BE2e***§#ffff00";
	assert.equal(isFormattedUsername(formatted), true);
});

test("cleanUsername strips Cubyz formatting", () => {
	const raw = "***#6A5ACDM#8A2BE2e#9932CCr#C71585c***§#ffff00";
	const cleaned = cleanUsername(raw);
	assert.equal(cleaned, "Merc");
});

test("cleanUsername preserves plain usernames", () => {
	const raw = "Player123";
	const cleaned = cleanUsername(raw);
	assert.equal(cleaned, "Player123");
});

const timestamp = new Date("2024-01-01T00:00:00Z");

test("formats join messages", () => {
	const message: ChatMessage = {
		type: "join",
		rawUsername: "***#FF0000H#00FF00i***",
		username: "Hi",
		timestamp,
	};

	assert.equal(formatMessage(message), "👋 Hi joined the game");
});

test("formats chat messages", () => {
	const message: ChatMessage = {
		type: "chat",
		rawUsername: "Player123",
		username: "Player123",
		message: "hello world",
		timestamp,
	};

	assert.equal(formatMessage(message), "Player123: hello world");
});

test("formats death messages", () => {
	const message: ChatMessage = {
		type: "death",
		rawUsername: "***#FF0000B#00FF00o#0000FFb***",
		username: "Bob",
		message: "died of fall damage",
		timestamp,
	};

	assert.equal(formatMessage(message), "💀 Bob died of fall damage");
});
