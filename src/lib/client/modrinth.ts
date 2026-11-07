import { clear, createStore, get, set, type UseStore } from 'idb-keyval';
import type { ProjectData } from '#lib/core/matrix.ts';
import type { DependencyApi } from '#lib/core/downloads.ts';
import { dataKey, type Alternative, type GameVersionTag, type ModrinthProject, type ModrinthVersion } from '#lib/core/types.ts';

/**
 * All Modrinth requests run in the browser, so they count against each user's own
 * rate limit rather than the server's. Responses are cached in IndexedDB.
 */

const API = 'https://api.modrinth.com/v2';
const HOUR = 60 * 60 * 1000;
const TTL = {
	project: 24 * HOUR,
	versions: HOUR,
	version: 7 * 24 * HOUR,
	tags: 24 * HOUR
};
const MAX_CONCURRENT = 6;
const BATCH_SIZE = 100;

let store: UseStore | null | undefined;
function cacheStore(): UseStore | null {
	if (store === undefined) {
		try {
			store = typeof indexedDB === 'undefined' ? null : createStore('modlist-matrix', 'api-cache');
		} catch {
			store = null;
		}
	}
	return store;
}

interface CacheEntry<T> {
	savedAt: number;
	data: T;
}

async function readCache<T>(key: string, ttl: number): Promise<T | undefined> {
	const db = cacheStore();
	if (!db) return undefined;
	try {
		const entry = await get<CacheEntry<T>>(key, db);
		if (entry && Date.now() - entry.savedAt < ttl) return entry.data;
	} catch {
		// Cache unavailable (private window, quota); fall through to the network.
	}
	return undefined;
}

async function writeCache<T>(key: string, data: T): Promise<void> {
	const db = cacheStore();
	if (!db) return;
	try {
		await set(key, { savedAt: Date.now(), data } satisfies CacheEntry<T>, db);
	} catch {
		// Not cached; the next load just fetches again.
	}
}

export async function clearApiCache(): Promise<void> {
	const db = cacheStore();
	if (db) await clear(db).catch(() => {});
}

// Simple concurrency limit so a 100-mod list doesn't fire 100 requests at once.
let active = 0;
const waiting: (() => void)[] = [];
async function limited<T>(task: () => Promise<T>): Promise<T> {
	if (active >= MAX_CONCURRENT) await new Promise<void>((resolve) => waiting.push(resolve));
	active++;
	try {
		return await task();
	} finally {
		active--;
		waiting.shift()?.();
	}
}

export class ApiError extends Error {
	constructor(
		message: string,
		public status: number
	) {
		super(message);
	}
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
	return limited(async () => {
		for (let attempt = 0; ; attempt++) {
			let response: Response;
			try {
				response = await fetch(`${API}${path}`, init);
			} catch {
				if (attempt < 2) continue;
				throw new ApiError("Couldn't reach Modrinth", 0);
			}
			if (response.ok) return (await response.json()) as T;
			if (response.status === 429 && attempt < 3) {
				const reset = Number(response.headers.get('X-Ratelimit-Reset') ?? '10');
				await new Promise((resolve) => setTimeout(resolve, Math.min(reset, 60) * 1000));
				continue;
			}
			if (response.status >= 500 && attempt < 2) continue;
			if (response.status === 404) throw new ApiError('Not found on Modrinth', 404);
			throw new ApiError(`Modrinth error ${response.status}`, response.status);
		}
	});
}

function chunks<T>(items: T[], size: number): T[][] {
	const out: T[][] = [];
	for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size));
	return out;
}

/** Projects by slug or ID, using one batch request per 100 uncached projects. */
async function getProjectsByKey(keys: string[], force: boolean): Promise<Map<string, ModrinthProject>> {
	// Project IDs are case-sensitive, slugs are not, so keys are kept exactly as given.
	const found = new Map<string, ModrinthProject>();
	const missing: string[] = [];

	for (const key of new Set(keys)) {
		const cached = force ? undefined : await readCache<ModrinthProject>(`project:${key}`, TTL.project);
		if (cached) found.set(key, cached);
		else missing.push(key);
	}

	for (const batch of chunks(missing, BATCH_SIZE)) {
		const projects = await request<ModrinthProject[]>(`/projects?ids=${encodeURIComponent(JSON.stringify(batch))}`);
		for (const project of projects) {
			const slim: ModrinthProject = {
				id: project.id,
				slug: project.slug,
				title: project.title,
				icon_url: project.icon_url,
				project_type: project.project_type,
				client_side: project.client_side,
				server_side: project.server_side
			};
			const matching = batch.filter((key) => key === project.id || key.toLowerCase() === project.slug.toLowerCase());
			for (const key of new Set([project.id, project.slug, ...matching])) {
				found.set(key, slim);
				await writeCache(`project:${key}`, slim);
			}
		}
	}

	return found;
}

function slimVersion(version: ModrinthVersion): ModrinthVersion {
	const { id, project_id, name, version_number, version_type, game_versions, loaders, date_published, files, dependencies } =
		version;
	return {
		id,
		project_id,
		name,
		version_number,
		version_type,
		game_versions,
		loaders,
		date_published,
		files: files.map(({ url, filename, primary, size, hashes }) => ({ url, filename, primary, size, hashes })),
		dependencies: dependencies.map(({ version_id, project_id, file_name, dependency_type }) => ({
			version_id,
			project_id,
			file_name,
			dependency_type
		}))
	};
}

async function getProjectVersions(projectId: string, force = false): Promise<ModrinthVersion[]> {
	const key = `versions:${projectId}`;
	const cached = force ? undefined : await readCache<ModrinthVersion[]>(key, TTL.versions);
	if (cached) return cached;
	const versions = (await request<ModrinthVersion[]>(`/project/${encodeURIComponent(projectId)}/version`)).map(slimVersion);
	await writeCache(key, versions);
	return versions;
}

async function getVersions(ids: string[]): Promise<ModrinthVersion[]> {
	const out: ModrinthVersion[] = [];
	const missing: string[] = [];
	for (const id of new Set(ids)) {
		const cached = await readCache<ModrinthVersion>(`version:${id}`, TTL.version);
		if (cached) out.push(cached);
		else missing.push(id);
	}
	for (const batch of chunks(missing, BATCH_SIZE)) {
		const versions = await request<ModrinthVersion[]>(`/versions?ids=${encodeURIComponent(JSON.stringify(batch))}`);
		for (const version of versions.map(slimVersion)) {
			out.push(version);
			await writeCache(`version:${version.id}`, version);
		}
	}
	return out;
}

export async function getGameVersionTags(): Promise<GameVersionTag[]> {
	const cached = await readCache<GameVersionTag[]>('tags:game_version', TTL.tags);
	if (cached) return cached;
	try {
		const tags = (await request<GameVersionTag[]>('/tag/game_version')).map(({ version, version_type, date }) => ({
			version,
			version_type,
			date
		}));
		await writeCache('tags:game_version', tags);
		return tags;
	} catch {
		// The matrix falls back to guessing releases from the version string.
		return [];
	}
}

export interface LoadProgress {
	done: number;
	total: number;
}

type ProjectRef = Pick<Alternative, 'platform' | 'slug' | 'projectType'>;

/**
 * Fetches project info and versions for every alternative, keyed by dataKey().
 * Modrinth is called from the browser; CurseForge goes through the server's cached proxy.
 */
export async function loadProjects(
	refs: ProjectRef[],
	options: { force?: boolean; onProgress?: (progress: LoadProgress) => void } = {}
): Promise<Map<string, ProjectData>> {
	const curseforge = refs.filter((ref) => ref.platform === 'curseforge');
	const modrinthSlugs = refs.filter((ref) => ref.platform !== 'curseforge').map((ref) => ref.slug);
	const progress = { done: 0, total: new Set(refs.map(dataKey)).size };
	const report = (p: LoadProgress) => options.onProgress?.(p);
	report({ ...progress });

	const [modrinth, cf] = await Promise.all([
		loadModrinth(modrinthSlugs, options.force ?? false, () => {
			progress.done++;
			report({ ...progress });
		}),
		loadCurseforgeRefs(curseforge).then((map) => {
			progress.done += map.size;
			report({ ...progress });
			return map;
		})
	]);
	return new Map([...modrinth, ...cf]);
}

async function loadCurseforgeRefs(refs: ProjectRef[]): Promise<Map<string, ProjectData>> {
	const out = new Map<string, ProjectData>();
	if (refs.length === 0) return out;
	const unique = [...new Map(refs.map((ref) => [dataKey(ref), ref])).values()];
	try {
		const response = await fetch('/api/curseforge/projects', {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({ slugs: unique.map(({ slug, projectType }) => ({ slug, projectType })), ids: [] })
		});
		if (!response.ok) {
			const reason = response.status === 401 ? 'Sign in to use CurseForge' : response.status === 404 ? 'CurseForge is not set up on this server' : `CurseForge error ${response.status}`;
			throw new Error(reason);
		}
		const data = (await response.json()) as Record<string, ProjectData>;
		for (const ref of unique) out.set(dataKey(ref), data[ref.slug] ?? { ok: false, error: 'Not found on CurseForge' });
	} catch (error) {
		for (const ref of unique) out.set(dataKey(ref), { ok: false, error: error instanceof Error ? error.message : 'CurseForge failed' });
	}
	return out;
}

async function curseforgeById(ids: string[]): Promise<Map<string, ProjectData>> {
	const numeric = ids.map((id) => Number(id.replace(/^cf:/, ''))).filter(Number.isInteger);
	if (numeric.length === 0) return new Map();
	const response = await fetch('/api/curseforge/projects', {
		method: 'POST',
		headers: { 'Content-Type': 'application/json' },
		body: JSON.stringify({ slugs: [], ids: numeric })
	});
	if (!response.ok) return new Map();
	return new Map(Object.entries((await response.json()) as Record<string, ProjectData>));
}

async function loadModrinth(slugs: string[], force: boolean, onDone: () => void): Promise<Map<string, ProjectData>> {
	// Slugs from URLs may also be project IDs, which are case-sensitive, so request them as written.
	// Results are keyed by lowercase slug, which is how the matrix looks them up.
	const keys = [...new Set(slugs)];
	const result = new Map<string, ProjectData>();
	if (keys.length === 0) return result;
	const options = { force };

	let projects: Map<string, ModrinthProject>;
	try {
		projects = await getProjectsByKey(keys, options.force ?? false);
	} catch (error) {
		const message = error instanceof Error ? error.message : 'Failed to load';
		for (const key of keys) {
			result.set(key.toLowerCase(), { ok: false, error: message });
			onDone();
		}
		return result;
	}

	await Promise.all(
		keys.map(async (key) => {
			const project = projects.get(key);
			try {
				if (!project) throw new ApiError('Not found on Modrinth', 404);
				const versions = await getProjectVersions(project.id, options.force);
				result.set(key.toLowerCase(), { ok: true, project, versions });
			} catch (error) {
				result.set(key.toLowerCase(), { ok: false, error: error instanceof Error ? error.message : 'Failed to load' });
			} finally {
				onDone();
			}
		})
	);

	return result;
}

/** CurseForge projects (IDs starting "cf:") are looked up through the server; the rest on Modrinth. */
export const dependencyApi: DependencyApi = {
	async getProjects(ids) {
		const cfIds = ids.filter((id) => id.startsWith('cf:'));
		const modrinthIds = ids.filter((id) => !id.startsWith('cf:'));
		const [projects, cf] = await Promise.all([getProjectsByKey(modrinthIds, false), curseforgeById(cfIds)]);
		return ids
			.map((id) => {
				if (!id.startsWith('cf:')) return projects.get(id);
				const data = cf.get(id);
				return data?.ok ? data.project : undefined;
			})
			.filter((p): p is ModrinthProject => !!p);
	},
	// CurseForge dependencies never pin a version, so only Modrinth IDs reach this.
	getVersions: (ids) => getVersions(ids.filter((id) => !id.startsWith('cf:'))),
	async getProjectVersions(projectId) {
		if (!projectId.startsWith('cf:')) return getProjectVersions(projectId);
		const data = (await curseforgeById([projectId])).get(projectId);
		return data?.ok ? data.versions : [];
	}
};

/** CurseForge project info for the editor, keyed by dataKey(). */
export async function getCurseforgeMeta(refs: ProjectRef[]): Promise<Map<string, ModrinthProject>> {
	const data = await loadCurseforgeRefs(refs);
	return new Map([...data].flatMap(([key, value]) => (value.ok ? [[key, value.project] as const] : [])));
}

export async function searchCurseforge(query: string, projectType: string, loader: string | null): Promise<SearchHit[]> {
	const params = new URLSearchParams({ q: query, type: projectType });
	if (loader) params.set('loader', loader);
	const response = await fetch(`/api/curseforge/search?${params}`);
	if (!response.ok) throw new Error(response.status === 401 ? 'Sign in to search CurseForge' : `CurseForge error ${response.status}`);
	return response.json();
}

/** Project info only (no versions), for showing names and icons in the editor. */
export async function getProjectsMeta(slugs: string[]): Promise<Map<string, ModrinthProject>> {
	const found = await getProjectsByKey([...new Set(slugs)], false);
	return new Map([...found].map(([key, project]) => [key.toLowerCase(), project]));
}

export interface SearchHit {
	project_id: string;
	slug: string;
	title: string;
	description: string;
	icon_url: string | null;
	project_type: string;
	downloads: number;
	date_modified: string;
	categories: string[];
	versions: string[];
	client_side: string;
	server_side: string;
}

/** Modrinth search; `loader` limits mods to that loader. Not cached: results should be live. */
export async function searchProjects(query: string, projectType: string, loader: string | null): Promise<SearchHit[]> {
	const facets: string[][] = [[`project_type:${projectType}`]];
	if (loader && projectType === 'mod') facets.push([`categories:${loader}`]);
	const params = new URLSearchParams({ query, limit: '12', facets: JSON.stringify(facets) });
	const result = await request<{ hits: SearchHit[] }>(`/search?${params}`);
	return result.hits;
}

/** Identifies files by SHA-1 (POST /version_files). Hashes Modrinth doesn't know are left out. */
export async function versionsByHash(sha1s: string[]): Promise<Map<string, ModrinthVersion>> {
	const found = new Map<string, ModrinthVersion>();
	for (const batch of chunks([...new Set(sha1s)], BATCH_SIZE)) {
		const result = await request<Record<string, ModrinthVersion>>('/version_files', {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({ hashes: batch, algorithm: 'sha1' })
		});
		for (const [hash, version] of Object.entries(result)) found.set(hash, slimVersion(version));
	}
	return found;
}
