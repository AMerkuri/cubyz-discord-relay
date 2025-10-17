# Cubyz Discord Relay

CLI tool that streams [Cubyz](https://github.com/PixelGuys/Cubyz) game server chat events into a Discord channel in near real time.

![Cubyz Discord Relay](https://raw.githubusercontent.com/AMerkuri/cubyz-discord-relay/refs/heads/master/assets/discord.png)

## Features

- Watches the Cubyz `latest.log` file
- Supports join, leave, death, and chat events
- Cleans Cubyz markdown-style usernames before relaying
- Filters events based on configuration
- Shows current player count in the bot's Discord presence
- Optionally monitors the server UDP port and announces online/offline changes

## Prerequisites

- Node.js 18 or newer
- Discord bot token with permission to post in the target channel

## Installation

Install via npm:

```bash
npm install -g cubyz-discord-relay

# Start the relay (defaults to ./config.json)
cubyz-discord-relay

# Provide a custom config path
cubyz-discord-relay /path/to/config.json
```

You can also run once without a global install via `npx cubyz-discord-relay`.

## Discord Bot Setup

Your Discord bot requires these permissions:

- **View Channels** – Access the target channel
- **Send Messages** – Forward chat messages from Cubyz

Generate an invite link in the Discord Developer Portal that grants these permissions before running the relay.

## Development

### Setup

```bash
npm install
```

### Configuration

1. Copy `config.example.json` to `config.json`.
2. Update the fields:
   - `cubyzLogPath`: absolute path to Cubyz `latest.log`
   - `discord.token`: bot token
   - `discord.channelId`: target channel ID
   - `events`: event types to relay (`join`, `leave`, `death`, `chat`)
   - `updateIntervalMs`: polling interval in milliseconds
   - `updatePresence`: set to `false` to disable Discord presence updates
   - `monitoring`: optional server monitor (set `enabled` to `true`, adjust `port` and `intervalSeconds`)

> First run convenience: if `config.json` is missing, the CLI writes a fresh template in your working directory and exits so you can fill it in before retrying.

### Usage

```bash
npm run dev            # Run directly with tsx (recompiles on change)
npm run build          # Compile TypeScript to dist/
npm start              # Run compiled output (after build)
```

During execution press `q` or `Ctrl+C` to exit gracefully.

## Troubleshooting

- **Bot not posting**: verify bot token, channel ID, and permissions
- **No events forwarded**: ensure `events` include the desired types and the log is updating
- **Missing log file**: the tool waits for `cubyzLogPath` to appear and resumes automatically

## Limitations

- **Unidirectional relay**: Messages flow from Cubyz → Discord only.
- **Log rotation**: When `latest.log` rotates, the relay resumes but presence accuracy depends on future events.
