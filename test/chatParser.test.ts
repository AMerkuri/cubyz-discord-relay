import { strict as assert } from "node:assert";
import test from "node:test";
import { parseChatMessage } from "../src/chatParser.js";

test("parseChatMessage captures multiline chat bodies", () => {
  const raw =
    "[***#6A5ACDM#8A2BE2e#9932CCr#C71585c#FF00FFu#FF69B4r***§#ffffff] hello\nworld";
  const chat = parseChatMessage(raw);

  assert.ok(chat, "Expected chat message to be parsed");
  assert.equal(chat?.type, "chat");
  assert.equal(chat?.username, "Mercur");
  assert.equal(chat?.message, "hello\nworld");
  assert.ok(chat?.timestamp instanceof Date);
});
