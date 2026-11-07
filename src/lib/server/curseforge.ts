import { CURSEFORGE_API_KEY } from '$app/env/private';
import {
	CF_CLASS_BY_TYPE,
	CF_GAME_ID,
	CF_LOADER_IDS,
	cfProject,
	cfVersion,
	type CfFile,
	type CfMod
} from '#lib/core/curseforge.ts';
import type { ModrinthProject, ModrinthVersion } from '#lib/core/types.ts';

/**
 * Thin, cached proxy for CurseForge metadata. The API key must stay on the server, so
 * the browser asks us; jar downloads still go straight from CurseForge's CDN to the browser.
 */

export const curseforgeEnabled = Boolean(CURSEFORGE_API_KEY);

const API = 'https://api.curseforge.com/v1';
const HOUR = 60 * 60 * 1000;
const cache = new Map<string, { at: number; value: unknown }>();

async function cached<T>(key: string, ttl: number, load: () => Promise<T>): Promise<T> {
	const hit = cache.get(key);
	if (hit && Date.now() - hit.at < ttl) return hit.value as T;
	const value = await load();
	if (cache.size > 5000) cache.clear();
	cache.set(key, { at: Date.now(), value });
	return value;
}

async function cf<T>(path: string, body?: unknown): Promise<T> {
	const response = await fetch(`${API}${path}`, {
		method: body ? 'POST' : 'GET',
		headers: {
			'x-api-key': CURSEFORGE_API_KEY!,
			Accept: 'application/json',
			...(body ? { 'Content-Type': 'application/json' } : {})
		},
		body: body ? JSON.stringify(body) : undefined
	});
	if (!response.ok) throw new Error(`CurseForge error ${response.status}`);
	return ((await response.json()) as { data: T }).data;
}

async function modBySlug(slug: string, projectType: string): Promise<CfMod | null> {
	return cached(`slug:${projectType}:${slug}`, 24 * HOUR, async () => {
		const params = new URLSearchParams({
			gameId: String(CF_GAME_ID),
			classId: String(CF_CLASS_BY_TYPE[projectType] ?? 6),
			slug
		});
		const mods = await cf<CfMod[]>(`/mods/search?${params}`);
		return mods.find((mod) => mod.slug === slug) ?? null;
	});
}

async function modsById(ids: number[]): Promise<CfMod[]> {
	const missing = ids.filter((id) => !cache.has(`mod:${id}`));
	if (missing.length > 0) {
		for (const mod of await cf<CfMod[]>('/mods', { modIds: missing })) {
			cache.set(`mod:${mod.id}`, { at: Date.now(), value: mod });
		}
	}
	return ids.map((id) => cache.get(`mod:${id}`)?.value as CfMod | undefined).filter((mod): mod is CfMod => !!mod);
}

/** One version per file listed in the mod's latest-files index (one per game version and loader). */
async function versionsOf(mod: CfMod): Promise<ModrinthVersion[]> {
	return cached(`files:${mod.id}`, HOUR, async () => {
		const fileIds = [...new Set(mod.latestFilesIndexes.map((index) => index.fileId))];
		const files: CfFile[] = [];
		for (let i = 0; i < fileIds.length; i += 100) {
			files.push(...(await cf<CfFile[]>('/mods/files', { fileIds: fileIds.slice(i, i + 100) })));
		}
		return files.map(cfVersion);
	});
}

export type CfProjectData =
	| { ok: true; project: ModrinthProject; versions: ModrinthVersion[] }
	| { ok: false; error: string };

/** Keyed by "slug" (as asked) or "cf:<id>" for lookups by ID. */
export async function loadCurseforge(
	slugs: { slug: string; projectType: string }[],
	ids: number[]
): Promise<Record<string, CfProjectData>> {
	const out: Record<string, CfProjectData> = {};
	await Promise.all(
		slugs.map(async ({ slug, projectType }) => {
			try {
				const mod = await modBySlug(slug, projectType);
				out[slug] = mod
					? { ok: true, project: cfProject(mod), versions: await versionsOf(mod) }
					: { ok: false, error: 'Not found on CurseForge' };
			} catch (error) {
				out[slug] = { ok: false, error: error instanceof Error ? error.message : 'CurseForge failed' };
			}
		})
	);
	if (ids.length > 0) {
		for (const mod of await modsById(ids)) {
			out[`cf:${mod.id}`] = { ok: true, project: cfProject(mod), versions: await versionsOf(mod) };
		}
	}
	return out;
}

export interface CfSearchHit {
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

export async function searchCurseforge(query: string, projectType: string, loader: string | null): Promise<CfSearchHit[]> {
	return cached(`search:${projectType}:${loader}:${query}`, 10 * 60 * 1000, async () => {
		const params = new URLSearchParams({
			gameId: String(CF_GAME_ID),
			classId: String(CF_CLASS_BY_TYPE[projectType] ?? 6),
			searchFilter: query,
			sortField: '2',
			sortOrder: 'desc',
			pageSize: '12'
		});
		if (loader && projectType === 'mod' && CF_LOADER_IDS[loader]) params.set('modLoaderType', String(CF_LOADER_IDS[loader]));
		const mods = await cf<CfMod[]>(`/mods/search?${params}`);
		return mods.map((mod) => {
			const project = cfProject(mod);
			const loaders = new Set(
				mod.latestFilesIndexes
					.map((index) => Object.entries(CF_LOADER_IDS).find(([, id]) => id === index.modLoader)?.[0])
					.filter((name): name is string => !!name)
			);
			return {
				project_id: project.id,
				slug: mod.slug,
				title: mod.name,
				description: mod.summary ?? '',
				icon_url: project.icon_url,
				project_type: project.project_type,
				downloads: mod.downloadCount ?? 0,
				date_modified: mod.dateModified,
				categories: [...loaders],
				versions: [...new Set(mod.latestFilesIndexes.map((index) => index.gameVersion))],
				client_side: 'unknown',
				server_side: 'unknown'
			};
		});
	});
}
