import { Buffer } from "node:buffer";
import { open, stat } from "node:fs/promises";
import { cleanUsername } from "./messageFormatter.js";
import type { ChatMessage } from "./types.js";

const CHAT_PATTERN = /\[info\]:\s*(?:User \[info\]:\s*)?Chat:\s*(.+)/i;

const isNotFoundError = (error: unknown): boolean =>
	typeof error === "object" &&
	error !== null &&
	"code" in error &&
	(error as { code?: string }).code === "ENOENT";

export async function initializePosition(filePath: string): Promise<number> {
	try {
		const fileStats = await stat(filePath);
		return fileStats.size;
	} catch (error) {
		if (isNotFoundError(error)) {
			return 0;
		}

		throw error;
	}
}

export async function readNewLines(
	filePath: string,
	fromPosition: number,
): Promise<{ lines: string[]; newPosition: number; fileMissing: boolean }> {
	try {
		const fileHandle = await open(filePath, "r");
		const fileStats = await fileHandle.stat();

		if (fileStats.size < fromPosition) {
			await fileHandle.close();
			return { lines: [], newPosition: fileStats.size, fileMissing: false };
		}

		if (fileStats.size === fromPosition) {
			await fileHandle.close();
			return { lines: [], newPosition: fromPosition, fileMissing: false };
		}

		const bytesToRead = fileStats.size - fromPosition;
		const buffer = Buffer.alloc(bytesToRead);
		await fileHandle.read(buffer, 0, bytesToRead, fromPosition);
		await fileHandle.close();

		const content = buffer.toString("utf8");
		const normalized = content.replace(/\r\n/g, "\n");
		const lines = normalized
			.split("\n")
			.filter((line: string) => line.length > 0);

		return { lines, newPosition: fileStats.size, fileMissing: false };
	} catch (error) {
		if (isNotFoundError(error)) {
			return { lines: [], newPosition: 0, fileMissing: true };
		}

		throw error;
	}
}

export function parseChatLine(rawLine: string): ChatMessage | null {
	const match = CHAT_PATTERN.exec(rawLine);
	if (!match) {
		return null;
	}

	const payload = match[1].trim();
	const timestamp = new Date();

	const chatMatch = /^\[(.+?)\]\s*(.*)$/.exec(payload);
	if (chatMatch) {
		const rawUsername = chatMatch[1].trim();
		const message = chatMatch[2].trim();
		return {
			type: "chat",
			rawUsername,
			username: cleanUsername(rawUsername),
			message,
			timestamp,
		};
	}

	const joinMatch = /^(.+?) joined$/.exec(payload);
	if (joinMatch) {
		const rawUsername = joinMatch[1].trim();
		return {
			type: "join",
			rawUsername,
			username: cleanUsername(rawUsername),
			timestamp,
		};
	}

	const leaveMatch = /^(.+?) left$/.exec(payload);
	if (leaveMatch) {
		const rawUsername = leaveMatch[1].trim();
		return {
			type: "leave",
			rawUsername,
			username: cleanUsername(rawUsername),
			timestamp,
		};
	}

	const deathMatch = /^(.+?) died(.*)$/.exec(payload);
	if (deathMatch) {
		const rawUsername = deathMatch[1].trim();
		const message = `died${deathMatch[2]}`.trim();
		return {
			type: "death",
			rawUsername,
			username: cleanUsername(rawUsername),
			message,
			timestamp,
		};
	}

	return null;
}
