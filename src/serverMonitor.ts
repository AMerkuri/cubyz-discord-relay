import { createSocket } from "node:dgram";

const UDP_FAMILY = "udp4";

export async function isServerOnline(port: number): Promise<boolean> {
	return new Promise((resolve) => {
		const socket = createSocket(UDP_FAMILY);
		let settled = false;

		const finalize = (online: boolean): void => {
			if (settled) {
				return;
			}

			settled = true;
			try {
				socket.close();
			} catch {
				// Ignore shutdown errors because the socket state no longer matters.
			}

			resolve(online);
		};

		socket.once("error", (error: NodeJS.ErrnoException) => {
			if (error?.code === "EADDRINUSE") {
				finalize(true);
				return;
			}

			finalize(false);
		});

		socket.once("listening", () => {
			finalize(false);
		});

		try {
			socket.bind(port);
		} catch {
			finalize(false);
		}
	});
}
