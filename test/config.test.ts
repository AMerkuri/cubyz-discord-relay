import { strict as assert } from "node:assert";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";
import { loadConfig } from "../src/config.js";

const createConfigFile = async (overrides?: {
  cubyz?: { botName?: string };
}) => {
  const directory = await mkdtemp(path.join(tmpdir(), "cubyz-relay-config-"));
  const filePath = path.join(directory, "config.json");
  const config = {
    logLevel: "info",
    cubyz: {
      host: "127.0.0.1",
      port: 47649,
      version: "0.0.0",
      ...overrides?.cubyz,
    },
    discord: {
      enabled: false,
      token: "",
      channelId: "",
      allowedMentions: [],
      enableReactions: true,
      enableReplies: true,
    },
    events: ["join", "leave", "death", "chat"],
    censorlist: [],
    startupMessages: [],
    startupMessageDelay: 0,
    excludeBotFromCount: true,
    excludedUsernames: [],
    connection: {
      reconnect: true,
      maxRetries: 0,
      retryDelayMs: 30000,
    },
    integration: {
      cubyzlistSite: {
        enabled: false,
        serverName: "",
        serverIp: "",
      },
    },
  };

  await writeFile(filePath, JSON.stringify(config, null, 2));

  return {
    directory,
    filePath,
  };
};

test("loadConfig accepts missing cubyz.botName", async () => {
  const { directory, filePath } = await createConfigFile();

  try {
    const config = await loadConfig(filePath);
    assert.equal(config.cubyz.botName, undefined);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test("loadConfig treats empty cubyz.botName as omitted", async () => {
  const { directory, filePath } = await createConfigFile({
    cubyz: { botName: "   " },
  });

  try {
    const config = await loadConfig(filePath);
    assert.equal(config.cubyz.botName, undefined);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test("loadConfig preserves explicit cubyz.botName", async () => {
  const { directory, filePath } = await createConfigFile({
    cubyz: { botName: "RelayBot" },
  });

  try {
    const config = await loadConfig(filePath);
    assert.equal(config.cubyz.botName, "RelayBot");
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});
