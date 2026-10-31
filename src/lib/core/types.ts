export const LOADERS = ['fabric', 'forge', 'neoforge', 'quilt'] as const;
export type Loader = (typeof LOADERS)[number];

/** Which side(s) of the game a mod runs on, after applying overrides. */
export type Side = 'client' | 'server' | 'both' | 'unknown';
export type KnownSide = Exclude<Side, 'unknown'>;

/**
 * How an alternative's side is decided:
 * - auto: use Modrinth's metadata
 * - fallback: use `side` only when Modrinth's answer is unknown (`[c]` in the text format)
 * - force: always use `side` (`[!c]` in the text format)
 */
export type SideMode = 'auto' | 'fallback' | 'force';

export type Pack = 'client' | 'server';

export interface Alternative {
	platform: 'modrinth';
	slug: string;
	/** Path segment from the URL (mod, plugin, shader, ...). Used to build links. */
	projectType: string;
	sideMode: SideMode;
	side?: KnownSide;
}

/** One row of the matrix: a mod, or several interchangeable mods (an OR-group). */
export interface Entry {
	alternatives: Alternative[];
	/** Free text, e.g. why the mod is in the list. */
	note?: string;
	/** Optional mods don't count towards the best version by default. */
	optional?: boolean;
	/** Section heading the entry sits under, e.g. "Performance". */
	section?: string;
}

/** A mod a following list removes from its base list. */
export interface RemovedRef {
	slug: string;
	projectType: string;
}

/**
 * What a revision stores. Versioned so the shape can grow in later phases.
 * For a list that follows another, `entries` are its additions/overrides and
 * `removals` the base mods it drops.
 */
export interface ListContent {
	version: 1;
	entries: Entry[];
	removals?: RemovedRef[];
}

/** auto: base changes apply immediately. manual: they wait until accepted. */
export type FollowMode = 'auto' | 'manual';

export interface ListSettings {
	loader: Loader;
	includeSnapshots: boolean;
}

/** Subset of the Modrinth v2 project object that the app uses. */
export interface ModrinthProject {
	id: string;
	slug: string;
	title: string;
	icon_url: string | null;
	project_type: string;
	client_side: string;
	server_side: string;
}

export interface ModrinthFile {
	url: string;
	filename: string;
	primary: boolean;
	size: number;
	hashes: { sha1?: string; sha512?: string };
}

export interface ModrinthDependency {
	version_id: string | null;
	project_id: string | null;
	file_name: string | null;
	dependency_type: 'required' | 'optional' | 'incompatible' | 'embedded';
}

/** Subset of the Modrinth v2 version object that the app uses. */
export interface ModrinthVersion {
	id: string;
	project_id: string;
	name: string;
	version_number: string;
	version_type: 'release' | 'beta' | 'alpha';
	game_versions: string[];
	loaders: string[];
	date_published: string;
	files: ModrinthFile[];
	dependencies: ModrinthDependency[];
}

/** An entry from Modrinth's /tag/game_version list. */
export interface GameVersionTag {
	version: string;
	version_type: string;
	date: string;
}

export function entryKey(entry: Entry): string {
	return entry.alternatives.map((alt) => alt.slug).join('|');
}

export function emptyContent(): ListContent {
	return { version: 1, entries: [] };
}
