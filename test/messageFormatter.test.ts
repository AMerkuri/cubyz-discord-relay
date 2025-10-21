import { strict as assert } from "node:assert";
import test from "node:test";
import { cleanUsername, formatMessage } from "../src/messageFormatter.js";
import type { ChatMessage, Config } from "../src/types.js";

const baseConfig: Config = {
  cubyz: {
    host: "127.0.0.1",
    port: 47649,
    botName: "RelayBot",
    version: "pre-indev",
  },
  connection: {
    reconnect: true,
    maxRetries: 0,
    retryDelayMs: 30000,
  },
  discord: {
    token: "token",
    channelId: "channel",
    allowedMentions: [],
  },
  events: ["join", "leave", "death", "chat"],
  censorlist: [],
  excludeBotFromCount: true,
};

test("cleanUsername strips Cubyz formatting", () => {
  const raw = "***#6A5ACDM#8A2BE2e#9932CCr#C71585c***§#ffff00";
  const cleaned = cleanUsername(raw);
  assert.equal(cleaned, "Merc");
});

test("cleanUsername handles color-prefixed username", () => {
  const raw = "#1e90fftaylor§#cccccc§#ffff00";
  const cleaned = cleanUsername(raw);
  assert.equal(cleaned, "taylor");
});

test("cleanUsername preserves unicode characters", () => {
  const raw =
    "#ff4500с#32cd32в#4169e1е#ffd700т#8a2be2о#00ced1ф#ff69b4ия§#dddddd§#ffff00";
  const cleaned = cleanUsername(raw);
  assert.equal(cleaned, "светофия");
});

test("cleanUsername preserves plain usernames", () => {
  const raw = "Player123";
  const cleaned = cleanUsername(raw);
  assert.equal(cleaned, "Player123");
});

test("cleanUsername removes Cubyz markdown characters", () => {
  const raw = "user~_[]name";
  const cleaned = cleanUsername(raw);
  assert.equal(cleaned, "username");
});

test("cleanUsername removes disallowed punctuation", () => {
  const raw = "Play!er@123";
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

  const result = formatMessage(message);
  assert.equal(result, "👋 **Hi joined the game**");
});

test("formats leave messages", () => {
  const message: ChatMessage = {
    type: "leave",
    rawUsername: "Player123",
    username: "Player123",
    timestamp,
  };

  const result = formatMessage(message);
  assert.equal(result, "🚪 **Player123 left the game**");
});

test("formats chat messages", () => {
  const message: ChatMessage = {
    type: "chat",
    rawUsername: "Player123",
    username: "Player123",
    message: "hello world",
    timestamp,
  };

  const result = formatMessage(message);
  assert.equal(result, "**Player123**: hello world");
});

test("formats chat messages without Cubyz color codes", () => {
  const message: ChatMessage = {
    type: "chat",
    rawUsername: "Player123",
    username: "Player123",
    message: "#FFAA00Player#FFFFFF: hello",
    timestamp,
  };

  const result = formatMessage(message);
  assert.equal(result, "**Player123**: Player: hello");
});

test("formats death messages", () => {
  const message: ChatMessage = {
    type: "death",
    rawUsername: "***#FF0000B#00FF00o#0000FFb***",
    username: "Bob",
    message: "died of fall damage",
    timestamp,
  };

  const result = formatMessage(message);
  assert.equal(result, "💀 **Bob died of fall damage**");
});

test("censors configured chat words", () => {
  const message: ChatMessage = {
    type: "chat",
    rawUsername: "Player123",
    username: "Player123",
    message: "This secret is safe",
    timestamp,
  };

  const config: Config = {
    ...baseConfig,
    censorlist: ["secret"],
  };

  const result = formatMessage(message, config);
  assert.equal(result, "**Player123**: This ||beep|| is safe");
});
