/** localStorage that never throws: private windows and blocked storage just don't remember. */
export function loadLocal<T>(key: string, fallback: T): T {
	try {
		const raw = localStorage.getItem(key);
		return raw === null ? fallback : (JSON.parse(raw) as T);
	} catch {
		return fallback;
	}
}

export function saveLocal(key: string, value: unknown): void {
	try {
		localStorage.setItem(key, JSON.stringify(value));
	} catch {
		// Ignored on purpose; see above.
	}
}

export function removeLocal(key: string): void {
	try {
		localStorage.removeItem(key);
	} catch {
		// Ignored on purpose; see above.
	}
}
