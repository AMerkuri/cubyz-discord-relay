# Cubyz Discord Relay

CLI tool that streams Cubyz game server chat events into a Discord channel in near real time.

## Features
- Watches the Cubyz `latest.log` file without locking it
- Detects join, leave, death, and chat events
- Cleans Cubyz markdown-style usernames before relaying
- Filters events based on configuration
- Graceful shutdown via `q` + Enter or `Ctrl+C`

## Prerequisites
- Node.js 18 or newer
- Discord bot token with permission to post in the target channel

## Installation
```bash
npm install
```

## Configuration
1. Copy `config.example.json` to `config.json`.
2. Update the fields:
   - `cubyzLogPath`: absolute path to Cubyz `latest.log`
   - `discord.token`: bot token
   - `discord.channelId`: target channel ID
   - `events`: event types to relay (`join`, `leave`, `death`, `chat`)
   - `updateIntervalMs`: polling interval in milliseconds

## Usage
```bash
npm run dev            # Run directly with tsx
npm run build          # Compile TypeScript to dist/
npm start              # Run compiled output (after build)
```

During execution press `q` + Enter to exit gracefully.

## Development
- Source code lives in `src/`
- `npm run watch` recompiles on change
- Type definitions are emitted to `dist/`

## Troubleshooting
- **Bot not posting**: verify bot token, channel ID, and permissions
- **No events forwarded**: ensure `events` include the desired types and the log is updating
- **Missing log file**: the tool waits for `cubyzLogPath` to appear and resumes automatically
