import type { LogLevel } from "cubyz-node-client";

export type Logger = (
  level: "error" | "debug" | "info" | "warn" | "silent",
  ...args: unknown[]
) => void;

export const LOG_LEVEL_ORDER = {
  debug: 0,
  info: 1,
  warn: 2,
  error: 3,
  silent: 4,
} as const;

export function createLogger(level: keyof typeof LOG_LEVEL_ORDER): Logger {
  const logLevel = level in LOG_LEVEL_ORDER ? level : "info";
  return (level: LogLevel, ...args: unknown[]) => {
    if (LOG_LEVEL_ORDER[level] < LOG_LEVEL_ORDER[logLevel]) {
      return;
    }
    if (level === "silent") {
      return;
    }

    return console[level]?.(...args);
  };
}
