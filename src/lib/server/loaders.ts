import type { Loader } from '#lib/core/types.ts';

/**
 * Latest loader version for a game version, for .mrpack files. Done on the server
 * because Forge's metadata can't be read from the browser; results are cached.
 */

const TTL = 60 * 60 * 1000;
const cache = new Map<string, { at: number; value: string | null }>();

async function getJson<T>(url: string): Promise<T> {
	const response = await fetch(url, { headers: { 'User-Agent': 'modlist-matrix (self-hosted)' } });
	if (!response.ok) throw new Error(`${response.status} from ${url}`);
	return (await response.json()) as T;
}

/** NeoForge numbers releases after the game version: 1.21.1 -> 21.1.x, 26.3 -> 26.3.x. */
export function neoforgePrefix(gameVersion: string): string {
	if (gameVersion.startsWith('1.')) {
		const [, minor, patch = '0'] = gameVersion.split('.');
		return `${minor}.${patch}.`;
	}
	return `${gameVersion}.`;
}

async function lookup(loader: Loader, gameVersion: string): Promise<string | null> {
	switch (loader) {
		case 'fabric': {
			const list = await getJson<{ loader: { version: string; stable: boolean } }[]>(
				`https://meta.fabricmc.net/v2/versions/loader/${encodeURIComponent(gameVersion)}`
			);
			return (list.find((item) => item.loader.stable) ?? list[0])?.loader.version ?? null;
		}
		case 'quilt': {
			const list = await getJson<{ loader: { version: string } }[]>(
				`https://meta.quiltmc.org/v3/versions/loader/${encodeURIComponent(gameVersion)}`
			);
			return (list.find((item) => !item.loader.version.includes('-')) ?? list[0])?.loader.version ?? null;
		}
		case 'neoforge': {
			const { versions } = await getJson<{ versions: string[] }>(
				'https://maven.neoforged.net/api/maven/versions/releases/net/neoforged/neoforge'
			);
			const prefix = neoforgePrefix(gameVersion);
			const matching = versions.filter((version) => version.startsWith(prefix));
			return matching.filter((version) => !version.includes('beta')).at(-1) ?? matching.at(-1) ?? null;
		}
		case 'forge': {
			const { promos } = await getJson<{ promos: Record<string, string> }>(
				'https://files.minecraftforge.net/net/minecraftforge/forge/promotions_slim.json'
			);
			const version = promos[`${gameVersion}-recommended`] ?? promos[`${gameVersion}-latest`];
			return version ? `${gameVersion}-${version}` : null;
		}
	}
}

export async function loaderVersion(loader: Loader, gameVersion: string): Promise<string | null> {
	const key = `${loader}:${gameVersion}`;
	const cached = cache.get(key);
	if (cached && Date.now() - cached.at < TTL) return cached.value;
	const value = await lookup(loader, gameVersion).catch(() => null);
	cache.set(key, { at: Date.now(), value });
	return value;
}
