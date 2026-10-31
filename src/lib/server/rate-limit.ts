/** Fixed-window, in-memory limiter. Enough for one process and a handful of users. */
export class RateLimiter {
	private hits = new Map<string, { count: number; resetAt: number }>();

	constructor(
		private limit: number,
		private windowMs: number
	) {}

	allow(key: string): boolean {
		const now = Date.now();
		const entry = this.hits.get(key);
		if (!entry || entry.resetAt <= now) {
			if (this.hits.size > 10_000) this.hits.clear();
			this.hits.set(key, { count: 1, resetAt: now + this.windowMs });
			return true;
		}
		entry.count++;
		return entry.count <= this.limit;
	}
}
