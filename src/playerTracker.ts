export interface PlayerTracker {
	readonly count: number;
	readonly players: ReadonlySet<string>;
	increment(username: string): number;
	decrement(username: string): number;
	reset(): void;
}

const normalize = (username: string): string => username.trim().toLowerCase();

export function createPlayerTracker(): PlayerTracker {
	let count = 0;
	const players = new Set<string>();

	const updateCount = (): number => {
		count = players.size;
		return count;
	};

	return {
		get count(): number {
			return count;
		},
		get players(): ReadonlySet<string> {
			return new Set(players);
		},
		increment(username: string): number {
			const key = normalize(username);
			if (key.length === 0) {
				return count;
			}

			if (!players.has(key)) {
				players.add(key);
			}

			return updateCount();
		},
		decrement(username: string): number {
			const key = normalize(username);
			if (key.length === 0) {
				return count;
			}

			if (players.delete(key)) {
				updateCount();
			}

			return count;
		},
		reset(): void {
			players.clear();
			updateCount();
		},
	};
}
