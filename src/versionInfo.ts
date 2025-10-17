import { readFile } from "node:fs/promises";

const SERVER_VERSION_PATTERN =
	/Starting game client with version\s+(.+?)(?:\.?\s*$|$)/i;

const isNotFoundError = (error: unknown): boolean =>
	typeof error === "object" &&
	error !== null &&
	"code" in error &&
	(error as { code?: string }).code === "ENOENT";

export async function readServerClientVersion(
	logPath: string,
): Promise<string | null> {
	try {
		const raw = await readFile(logPath, "utf8");
		const normalized = raw.replace(/\r\n/g, "\n");
		for (const line of normalized.split("\n")) {
			const match = SERVER_VERSION_PATTERN.exec(line);
			if (!match) {
				continue;
			}

			const version = match[1].trim().replace(/\.$/, "");
			if (version.length === 0) {
				continue;
			}

			return version;
		}

		return null;
	} catch (error) {
		if (isNotFoundError(error)) {
			return null;
		}

		throw error;
	}
}
