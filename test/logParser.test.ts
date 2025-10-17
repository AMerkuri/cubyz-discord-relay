import { strict as assert } from "node:assert";
import test from "node:test";
import { parseChatLine } from "../src/logParser.js";

const rawUsername = "***#6A5ACDM#8A2BE2e#9932CCr#C71585c#FF00FFu#FF69B4r***";

const buildVersionedJoinLine = (version: string): string =>
	`[info]: User ${rawUsername} joined using version ${version}`;

const timestampToleranceMs = 1_000;

const assertRecentTimestamp = (value: Date): void => {
	const now = Date.now();
	assert.ok(
		Math.abs(now - value.getTime()) < timestampToleranceMs,
		"timestamp should be near now",
	);
};

test("parses versioned join lines", () => {
	const line = buildVersionedJoinLine("0.0.1");
	const result = parseChatLine(line);
	assert.ok(result, "expected chat message to be parsed");
	assert.equal(result.type, "join");
	assert.equal(result.username, "Mercur");
	assert.equal(result.metadata?.clientVersion, "0.0.1");
	assertRecentTimestamp(result.timestamp);
});

test("parses versioned join lines with trailing punctuation", () => {
	const line = buildVersionedJoinLine("1.2.3.");
	const result = parseChatLine(line);
	assert.ok(result, "expected chat message to be parsed");
	assert.equal(result.metadata?.clientVersion, "1.2.3");
	assertRecentTimestamp(result.timestamp);
});

test("ignores chat-prefixed join lines without version", () => {
	const line = `[info]: Chat: ${rawUsername} joined`;
	const result = parseChatLine(line);
	assert.equal(result, null);
});
