import type { ModrinthProject, ModrinthVersion } from './types';

/**
 * Maps CurseForge API (v1) objects onto the Modrinth-shaped types the matrix uses.
 * IDs get a "cf:" prefix so they never clash with Modrinth IDs.
 */

export const CF_GAME_ID = 432;

export const CF_CLASS_BY_TYPE: Record<string, number> = {
	mod: 6,
	resourcepack: 12,
	shader: 6552,
	datapack: 6945
};

const TYPE_BY_CLASS: Record<number, string> = Object.fromEntries(
	Object.entries(CF_CLASS_BY_TYPE).map(([type, id]) => [id, type])
);

/** URL path segment on curseforge.com/minecraft/<segment>/<slug>. */
export const CF_PATH_BY_TYPE: Record<string, string> = {
	mod: 'mc-mods',
	resourcepack: 'texture-packs',
	shader: 'shaders',
	datapack: 'data-packs'
};
export const CF_TYPE_BY_PATH: Record<string, string> = Object.fromEntries(
	Object.entries(CF_PATH_BY_TYPE).map(([type, path]) => [path, type])
);

export const CF_LOADER_IDS: Record<string, number> = { forge: 1, fabric: 4, quilt: 5, neoforge: 6 };

export interface CfMod {
	id: number;
	name: string;
	slug: string;
	classId: number;
	summary?: string;
	downloadCount?: number;
	dateModified: string;
	logo?: { thumbnailUrl?: string; url?: string } | null;
	latestFilesIndexes: { fileId: number; gameVersion: string; modLoader?: number | null }[];
}

export interface CfFile {
	id: number;
	modId: number;
	displayName: string;
	fileName: string;
	releaseType: 1 | 2 | 3;
	fileDate: string;
	fileLength: number;
	downloadUrl: string | null;
	hashes: { value: string; algo: number }[];
	gameVersions: string[];
	dependencies: { modId: number; relationType: number }[];
}

const RELEASE_TYPES = { 1: 'release', 2: 'beta', 3: 'alpha' } as const;
const LOADER_NAMES = new Set(['fabric', 'forge', 'neoforge', 'quilt']);
// CurseForge relation types: 3 = required, 2 = optional, 5 = incompatible, 1/6 = embedded/included.
const RELATIONS: Record<number, ModrinthVersion['dependencies'][number]['dependency_type']> = {
	1: 'embedded',
	2: 'optional',
	3: 'required',
	5: 'incompatible',
	6: 'embedded'
};

export function cfProject(mod: CfMod): ModrinthProject {
	return {
		id: `cf:${mod.id}`,
		slug: mod.slug,
		title: mod.name,
		icon_url: mod.logo?.thumbnailUrl ?? mod.logo?.url ?? null,
		project_type: TYPE_BY_CLASS[mod.classId] ?? 'mod',
		// CurseForge has no client/server metadata; the list's side overrides fill the gap.
		client_side: 'unknown',
		server_side: 'unknown'
	};
}

export function cfVersion(file: CfFile): ModrinthVersion {
	const sha1 = file.hashes.find((hash) => hash.algo === 1)?.value;
	return {
		id: `cf:${file.id}`,
		project_id: `cf:${file.modId}`,
		name: file.displayName,
		version_number: file.displayName,
		version_type: RELEASE_TYPES[file.releaseType] ?? 'release',
		game_versions: file.gameVersions.filter((version) => /^\d/.test(version)),
		loaders: file.gameVersions.map((version) => version.toLowerCase()).filter((version) => LOADER_NAMES.has(version)),
		date_published: file.fileDate,
		files: [
			{
				// Empty when the author disabled third-party downloads; the dialog links to the site instead.
				url: file.downloadUrl ?? '',
				filename: file.fileName,
				primary: true,
				size: file.fileLength,
				hashes: sha1 ? { sha1 } : {}
			}
		],
		dependencies: file.dependencies
			.filter((dep) => RELATIONS[dep.relationType])
			.map((dep) => ({
				project_id: `cf:${dep.modId}`,
				version_id: null,
				file_name: null,
				dependency_type: RELATIONS[dep.relationType]
			}))
	};
}

export function cfProjectUrl(projectType: string, slug: string): string {
	return `https://www.curseforge.com/minecraft/${CF_PATH_BY_TYPE[projectType] ?? 'mc-mods'}/${slug}`;
}
