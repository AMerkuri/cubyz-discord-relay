# AGENTS

## Commands

- `npm run check` runs Biome for both lint and formatting checks.
- `npm run build` is the only typecheck step; it runs `tsc` and writes `dist/`.
- `npm test` runs all tests via `tsx --test test/*.test.ts`.
- Run a single test file with `npx tsx --test test/chatParser.test.ts` or `npx tsx --test test/messageFormatter.test.ts`.
- For non-trivial changes, verify with `npm run check`, `npm run build`, and `npm test`.

## Architecture

- This is a single-package Node 18+ ESM CLI. Keep import specifiers ending in `.js`; TypeScript source already imports compiled paths.
- `src/index.ts` is the real entrypoint and CLI. It reads `process.argv[2]` as an optional config path, otherwise uses `config.json` in the current working directory.
- `src/config.ts` is the source of truth for config defaults and validation. If the target config file does not exist, the app copies `config.example.json` to that path and exits by throwing `ConfigTemplateCreatedError`.
- `src/botConnection.ts` is the Cubyz boundary. It wraps `cubyz-node-client`, normalizes chat/player/gamemode events, filters the relay bot and `excludedUsernames` from player counts, and handles reconnects.
- `src/integrations/index.ts` fans normalized events out to integrations. Current integrations are `DiscordIntegration` and `CubyzListSiteIntegration`.

## Repo Quirks

- `dist/` is generated output and ignored; edit `src/` instead.
- `config.json` is a local runtime file and ignored. Do not commit real credentials.
- `connection.maxRetries: 0` means infinite retries.
- `startupMessageDelay` is applied before every startup message, including the first one.
- Discord behavior depends on config flags in `src/types.ts` and `src/config.ts`: `discord.enabled`, `enableReplies`, `enableReactions`, and `allowedMentions` all materially change runtime behavior.

## Testing Scope

- The automated tests cover only the pure parsing/formatting logic in `test/chatParser.test.ts` and `test/messageFormatter.test.ts`.
- There are no repo tests for live Discord or Cubyz network flows; changes in `src/discordClient.ts`, `src/integrations/discord.ts`, `src/botConnection.ts`, or `src/integrations/cubyzListSite.ts` still need manual smoke testing with a real `config.json`.
