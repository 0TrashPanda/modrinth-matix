import { resolveSide } from './sides';
import {
	dataKey,
	entryKey,
	type Alternative,
	type Entry,
	type GameVersionTag,
	type ListSettings,
	type ModrinthProject,
	type ModrinthVersion,
	type Side
} from './types';

/** Fetched data for one alternative, or why it couldn't be fetched. */
export type ProjectData =
	| { ok: true; project: ModrinthProject; versions: ModrinthVersion[] }
	| { ok: false; error: string };

/** What a cell offers for one alternative at one game version. */
export interface CellOption {
	alternative: Alternative;
	project: ModrinthProject;
	side: Side;
	version: ModrinthVersion;
}

export interface MatrixRow {
	key: string;
	entry: Entry;
	/** Projects that loaded, in the same order as the entry's alternatives (null if failed). */
	projects: (ModrinthProject | null)[];
	cells: Map<string, CellOption[]>;
	errors: string[];
}

export interface Matrix {
	gameVersions: string[];
	rows: MatrixRow[];
}

// Project types that don't depend on the mod loader.
const LOADER_INDEPENDENT = new Set(['resourcepack', 'shader', 'datapack']);
const CHANNEL_RANK: Record<string, number> = { release: 3, beta: 2, alpha: 1 };

/** Prefer release over beta over alpha, then the newest. v1 just took the first one. */
export function isBetterVersion(candidate: ModrinthVersion, current: ModrinthVersion): boolean {
	const rankDiff = (CHANNEL_RANK[candidate.version_type] ?? 0) - (CHANNEL_RANK[current.version_type] ?? 0);
	if (rankDiff !== 0) return rankDiff > 0;
	return candidate.date_published > current.date_published;
}

export function supportsLoader(project: ModrinthProject, version: ModrinthVersion, loader: string): boolean {
	if (LOADER_INDEPENDENT.has(project.project_type) || version.loaders.includes(loader)) return true;
	// Quilt runs Fabric mods, as Modrinth's own launcher assumes.
	return loader === 'quilt' && version.loaders.includes('fabric');
}

export class GameVersionInfo {
	private byVersion: Map<string, GameVersionTag>;

	constructor(tags: GameVersionTag[]) {
		this.byVersion = new Map(tags.map((tag) => [tag.version, tag]));
	}

	isRelease(version: string): boolean {
		const tag = this.byVersion.get(version);
		if (tag) return tag.version_type === 'release';
		// Fallback when the tag list couldn't be loaded: plain dotted numbers are releases.
		return /^\d+\.\d+(\.\d+)?$/.test(version);
	}

	/** Newest first, by release date when known. */
	compare = (a: string, b: string): number => {
		const tagA = this.byVersion.get(a);
		const tagB = this.byVersion.get(b);
		if (tagA && tagB && tagA.date !== tagB.date) return tagB.date.localeCompare(tagA.date);
		return b.localeCompare(a, undefined, { numeric: true });
	};
}

export type Channel = 'release' | 'beta' | 'alpha';
export const ALL_CHANNELS: Channel[] = ['release', 'beta', 'alpha'];

export function buildMatrix(
	entries: Entry[],
	data: Map<string, ProjectData>,
	settings: ListSettings & { channels?: Channel[] },
	gameVersionInfo: GameVersionInfo
): Matrix {
	const channels = new Set<string>(settings.channels ?? ALL_CHANNELS);
	const allVersions = new Set<string>();

	const rows = entries.map((entry): MatrixRow => {
		const cells = new Map<string, CellOption[]>();
		const errors: string[] = [];
		const projects: (ModrinthProject | null)[] = [];

		for (const alternative of entry.alternatives) {
			const result = data.get(dataKey(alternative));
			if (!result) {
				projects.push(null);
				continue;
			}
			if (!result.ok) {
				projects.push(null);
				errors.push(`${alternative.slug}: ${result.error}`);
				continue;
			}

			const { project, versions } = result;
			projects.push(project);
			const side = resolveSide(project, alternative);
			const best = new Map<string, ModrinthVersion>();

			for (const version of versions) {
				if (!supportsLoader(project, version, settings.loader)) continue;
				if (alternative.pin) {
					if (version.version_number !== alternative.pin && version.id !== alternative.pin) continue;
				} else if (!channels.has(version.version_type)) continue;
				for (const gameVersion of version.game_versions) {
					if (!settings.includeSnapshots && !gameVersionInfo.isRelease(gameVersion)) continue;
					const current = best.get(gameVersion);
					if (!current || isBetterVersion(version, current)) best.set(gameVersion, version);
				}
			}

			for (const [gameVersion, version] of best) {
				allVersions.add(gameVersion);
				const list = cells.get(gameVersion) ?? [];
				list.push({ alternative, project, side, version });
				cells.set(gameVersion, list);
			}
		}

		return { key: entryKey(entry), entry, projects, cells, errors };
	});

	return { gameVersions: [...allVersions].sort(gameVersionInfo.compare), rows };
}

export function countSupport(matrix: Matrix, disabled: Set<string>): Map<string, number> {
	const counts = new Map<string, number>();
	for (const gameVersion of matrix.gameVersions) {
		let count = 0;
		for (const row of matrix.rows) {
			if (!disabled.has(row.key) && row.cells.has(gameVersion)) count++;
		}
		counts.set(gameVersion, count);
	}
	return counts;
}

/** Newest game version with the highest count, or null if nothing is supported. */
export function bestGameVersion(matrix: Matrix, counts: Map<string, number>): string | null {
	let best: string | null = null;
	let max = 0;
	for (const gameVersion of matrix.gameVersions) {
		const count = counts.get(gameVersion) ?? 0;
		if (count > max) {
			max = count;
			best = gameVersion;
		}
	}
	return best;
}

export interface Blocker {
	row: MatrixRow;
	/** Newest game version this row does support, if any. */
	latestSupported: string | null;
}

/** Enabled rows with no support for `gameVersion`. */
export function blockersFor(matrix: Matrix, gameVersion: string, disabled: Set<string>): Blocker[] {
	return matrix.rows
		.filter((row) => !disabled.has(row.key) && !row.cells.has(gameVersion))
		.map((row) => ({
			row,
			latestSupported: matrix.gameVersions.find((version) => row.cells.has(version)) ?? null
		}));
}

export function primaryFile(version: ModrinthVersion) {
	return version.files.find((file) => file.primary) ?? version.files[0] ?? null;
}

export interface Conflict {
	row: MatrixRow;
	other: MatrixRow;
}

/** Pairs of counted rows whose versions for `gameVersion` declare each other incompatible. */
export function conflictsFor(matrix: Matrix, gameVersion: string, excluded: Set<string>): Conflict[] {
	const rows = matrix.rows.filter((row) => !excluded.has(row.key) && row.cells.has(gameVersion));
	const owner = new Map<string, MatrixRow>();
	for (const row of rows) for (const option of row.cells.get(gameVersion)!) owner.set(option.project.id, row);

	const conflicts: Conflict[] = [];
	const seen = new Set<string>();
	for (const row of rows) {
		for (const option of row.cells.get(gameVersion)!) {
			for (const dep of option.version.dependencies) {
				if (dep.dependency_type !== 'incompatible' || !dep.project_id) continue;
				const other = owner.get(dep.project_id);
				if (!other || other === row) continue;
				const key = [row.key, other.key].sort().join('×');
				if (seen.has(key)) continue;
				seen.add(key);
				conflicts.push({ row, other });
			}
		}
	}
	return conflicts;
}

export interface Update {
	row: MatrixRow;
	option: CellOption;
	previousVersionId: string;
}

/**
 * Mods whose best version for `gameVersion` is newer than the one last downloaded.
 * `downloaded` maps project ID to the version ID that was downloaded.
 */
export function updatesSince(matrix: Matrix, gameVersion: string, downloaded: Record<string, string>): Update[] {
	const updates: Update[] = [];
	for (const row of matrix.rows) {
		for (const option of row.cells.get(gameVersion) ?? []) {
			const previous = downloaded[option.project.id];
			if (previous && previous !== option.version.id && !option.alternative.pin) {
				updates.push({ row, option, previousVersionId: previous });
			}
		}
	}
	return updates;
}

/** Date of the newest version of any of the row's projects, on any loader or game version. */
export function lastUpdated(row: MatrixRow, data: Map<string, ProjectData>): string | null {
	let latest: string | null = null;
	for (const alternative of row.entry.alternatives) {
		const result = data.get(dataKey(alternative));
		if (!result?.ok) continue;
		for (const version of result.versions) {
			if (!latest || version.date_published > latest) latest = version.date_published;
		}
	}
	return latest;
}
