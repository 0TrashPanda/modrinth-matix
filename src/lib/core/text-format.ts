import { CF_TYPE_BY_PATH, cfProjectUrl } from './curseforge';
import { dataKey, type Alternative, type Entry, type KnownSide, type ListContent, type RemovedRef, type SideMode } from './types';

/**
 * The plain-text list format from v1, kept so old pCloud files import unchanged:
 *
 *   https://modrinth.com/mod/sodium
 *   https://modrinth.com/mod/distanthorizons, https://modrinth.com/mod/bobby   <- OR-group
 *   https://modrinth.com/mod/chunky [s]     <- fallback side, used when Modrinth doesn't know
 *   https://modrinth.com/mod/foo [!c]       <- forced side
 *
 * Blank lines are ignored, and so are lines starting with `#` or `//`.
 *
 * Also understood (and used by the old curated lists):
 *   performance mods:                        <- section heading (or "## performance mods")
 *   https://modrinth.com/mod/x, needs testing  <- plain text after a comma is a note
 *   https://modrinth.com/mod/x [opt]         <- optional: not counted for the best version
 *   https://modrinth.com/mod/x [=1.3.2]      <- pinned to that mod version
 *
 * In a list that follows another list, a line starting with `-` removes those
 * mods from the base list. A leading `+` is allowed for additions and ignored.
 */

const SIDE_TAG_PATTERN = /\[\s*(!?)([scb])\s*\]/gi;
const MODRINTH_HOSTS = new Set(['modrinth.com', 'www.modrinth.com']);
const CURSEFORGE_HOSTS = new Set(['curseforge.com', 'www.curseforge.com']);
const PROJECT_TYPES = new Set([
	'mod',
	'plugin',
	'datapack',
	'shader',
	'resourcepack',
	'modpack',
	'project'
]);

const TAG_TO_SIDE: Record<string, KnownSide> = { c: 'client', s: 'server', b: 'both' };
const SIDE_TO_TAG: Record<KnownSide, string> = { client: 'c', server: 's', both: 'b' };

export interface ParseWarning {
	line: number;
	message: string;
}

export interface ParseResult {
	content: ListContent;
	warnings: ParseWarning[];
}

const PIN_TAG = /\[\s*=\s*([^\]\s]+)\s*\]/;

export function parseAlternative(raw: string): Alternative | null {
	const pin = raw.match(PIN_TAG)?.[1];
	raw = raw.replace(PIN_TAG, '');
	let forced: KnownSide | undefined;
	let fallback: KnownSide | undefined;
	for (const match of raw.matchAll(SIDE_TAG_PATTERN)) {
		const side = TAG_TO_SIDE[match[2].toLowerCase()];
		if (match[1] === '!') forced = side;
		else fallback = side;
	}

	let clean = raw.replace(SIDE_TAG_PATTERN, '').trim();
	if (!/^https?:\/\//i.test(clean)) clean = `https://${clean}`;

	let url: URL;
	try {
		url = new URL(clean);
	} catch {
		return null;
	}
	const parts = url.pathname.split('/').filter(Boolean);
	const host = url.hostname.toLowerCase();

	if (CURSEFORGE_HOSTS.has(host)) {
		// curseforge.com/minecraft/mc-mods/jei
		if (parts[0]?.toLowerCase() !== 'minecraft' || !parts[2] || !CF_TYPE_BY_PATH[parts[1]?.toLowerCase()]) return null;
		const alternative: Alternative = {
			platform: 'curseforge',
			slug: parts[2],
			projectType: CF_TYPE_BY_PATH[parts[1].toLowerCase()],
			sideMode: forced ? 'force' : fallback ? 'fallback' : 'auto'
		};
		const cfSide = forced ?? fallback;
		if (cfSide) alternative.side = cfSide;
		if (pin) alternative.pin = pin.slice(0, 60);
		return alternative;
	}

	if (!MODRINTH_HOSTS.has(host)) return null;
	if (parts.length === 0) return null;

	// /mod/sodium/versions -> sodium. v1 took the last segment, which broke these links.
	let projectType = 'mod';
	let slug: string;
	if (PROJECT_TYPES.has(parts[0].toLowerCase()) && parts.length >= 2) {
		projectType = parts[0].toLowerCase();
		slug = parts[1];
	} else {
		slug = parts[parts.length - 1];
	}

	const sideMode: SideMode = forced ? 'force' : fallback ? 'fallback' : 'auto';
	const alternative: Alternative = { platform: 'modrinth', slug, projectType, sideMode };
	const side = forced ?? fallback;
	if (side) alternative.side = side;
	if (pin) alternative.pin = pin.slice(0, 60);
	return alternative;
}

const OPTIONAL_TAG = /\[\s*opt(?:ional)?\s*\]/gi;
const LOOKS_LIKE_URL = /^(https?:\/\/|www\.)|^[\w-]+(\.[\w-]+)+\/\S*$/i;

function sectionHeading(line: string): string | null {
	if (line.startsWith('## ')) return line.slice(3).trim() || null;
	// "performance mods:" style headings, as used in older text lists.
	if (line.endsWith(':') && !/https?:\/\/|modrinth\.com/i.test(line)) return line.slice(0, -1).trim() || null;
	return null;
}

export function parseText(text: string): ParseResult {
	const entries: Entry[] = [];
	const removals: RemovedRef[] = [];
	const warnings: ParseWarning[] = [];
	const seen = new Map<string, number>();
	let section: string | undefined;

	text.split(/\r?\n/).forEach((rawLine, index) => {
		let line = rawLine.trim();
		const lineNumber = index + 1;
		if (!line) return;

		const heading = sectionHeading(line);
		if (heading) {
			section = heading.slice(0, 80);
			return;
		}
		if (line.startsWith('#') || line.startsWith('//')) return;

		const prefix = line.match(/^([+-])\s*/);
		if (prefix) line = line.slice(prefix[0].length);

		if (prefix?.[1] === '-') {
			for (const part of line.split(',')) {
				const trimmed = part.trim();
				if (!trimmed) continue;
				const alternative = parseAlternative(trimmed);
				if (alternative) removals.push({ slug: alternative.slug, projectType: alternative.projectType });
				else warnings.push({ line: lineNumber, message: `Not a Modrinth or CurseForge project URL: ${trimmed}` });
			}
			return;
		}

		const optional = line.search(OPTIONAL_TAG) !== -1;
		line = line.replace(OPTIONAL_TAG, '');

		const alternatives: Alternative[] = [];
		const noteParts: string[] = [];
		for (const part of line.split(',')) {
			const trimmed = part.trim();
			if (!trimmed) continue;
			const alternative = parseAlternative(trimmed);
			if (!alternative) {
				// Plain text after a comma is a note; anything URL-like is a mistake worth flagging.
				if (LOOKS_LIKE_URL.test(trimmed)) {
					warnings.push({ line: lineNumber, message: `Not a Modrinth or CurseForge project URL: ${trimmed}` });
				} else {
					noteParts.push(trimmed);
				}
				continue;
			}
			const key = dataKey(alternative);
			if (seen.has(key)) {
				warnings.push({
					line: lineNumber,
					message: `${alternative.slug} is already on line ${seen.get(key)}`
				});
			} else {
				seen.set(key, lineNumber);
			}
			alternatives.push(alternative);
		}

		if (alternatives.length === 0) {
			if (noteParts.length > 0) warnings.push({ line: lineNumber, message: `No Modrinth URL on this line: ${line}` });
			return;
		}
		const entry: Entry = { alternatives };
		if (noteParts.length > 0) entry.note = noteParts.join(', ').slice(0, 500);
		if (optional) entry.optional = true;
		if (section) entry.section = section;
		entries.push(entry);
	});

	const content: ListContent = { version: 1, entries };
	if (removals.length > 0) content.removals = removals;
	return { content, warnings };
}

export function serializeAlternative(alternative: Alternative): string {
	let line = projectUrl(alternative);
	if (alternative.side && alternative.sideMode !== 'auto') {
		const tag = SIDE_TO_TAG[alternative.side];
		line += alternative.sideMode === 'force' ? ` [!${tag}]` : ` [${tag}]`;
	}
	if (alternative.pin) line += ` [=${alternative.pin}]`;
	return line;
}

/** One entry as a text line, without its section. Also used to compare entries. */
export function serializeEntry(entry: Entry): string {
	let line = entry.alternatives.map(serializeAlternative).join(', ');
	if (entry.optional) line += ' [opt]';
	if (entry.note) line += `, ${entry.note}`;
	return line;
}

/** Entries are grouped by section: unsectioned first, then sections in order of first appearance. */
export function groupBySection(entries: Entry[]): { section: string | null; entries: Entry[] }[] {
	const groups: { section: string | null; entries: Entry[] }[] = [{ section: null, entries: [] }];
	for (const entry of entries) {
		const section = entry.section ?? null;
		let group = groups.find((candidate) => candidate.section === section);
		if (!group) {
			group = { section, entries: [] };
			groups.push(group);
		}
		group.entries.push(entry);
	}
	return groups.filter((group) => group.entries.length > 0);
}

export function serializeText(content: ListContent): string {
	const lines: string[] = [];
	for (const group of groupBySection(content.entries)) {
		if (group.section) {
			if (lines.length > 0) lines.push('');
			lines.push(`${group.section}:`);
		}
		for (const entry of group.entries) lines.push(serializeEntry(entry));
	}
	const removals = content.removals ?? [];
	if (removals.length > 0 && lines.length > 0) lines.push('');
	for (const removal of removals) {
		lines.push(`- https://modrinth.com/${removal.projectType}/${removal.slug}`);
	}
	return lines.join('\n');
}

export function projectUrl(alternative: Pick<Alternative, 'platform' | 'projectType' | 'slug'>): string {
	if (alternative.platform === 'curseforge') return cfProjectUrl(alternative.projectType, alternative.slug);
	return `https://modrinth.com/${alternative.projectType}/${alternative.slug}`;
}
