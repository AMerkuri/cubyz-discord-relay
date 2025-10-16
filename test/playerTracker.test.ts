import { strict as assert } from "node:assert";
import test from "node:test";
import { createPlayerTracker } from "../src/playerTracker.js";

test("increment adds unique players", () => {
	const tracker = createPlayerTracker();
	const countAfterAlice = tracker.increment("Alice");
	const countAfterBob = tracker.increment("Bob");

	assert.equal(countAfterAlice, 1);
	assert.equal(countAfterBob, 2);
	assert.equal(tracker.count, 2);
});

test("increment ignores duplicate joins", () => {
	const tracker = createPlayerTracker();
	tracker.increment("Alice");
	const countAfterDuplicate = tracker.increment("alice");

	assert.equal(countAfterDuplicate, 1);
	assert.equal(tracker.count, 1);
});

test("decrement removes existing players", () => {
	const tracker = createPlayerTracker();
	tracker.increment("Alice");
	tracker.increment("Bob");

	const countAfterLeave = tracker.decrement("alice");

	assert.equal(countAfterLeave, 1);
	assert.equal(tracker.count, 1);
});

test("decrement on unknown player does not go negative", () => {
	const tracker = createPlayerTracker();
	tracker.increment("Alice");
	const countAfterUnknownLeave = tracker.decrement("Charlie");

	assert.equal(countAfterUnknownLeave, 1);
	assert.equal(tracker.count, 1);
});

test("reset clears all state", () => {
	const tracker = createPlayerTracker();
	tracker.increment("Alice");
	tracker.increment("Bob");

	tracker.reset();

	assert.equal(tracker.count, 0);
	assert.equal(tracker.players.size, 0);
});
