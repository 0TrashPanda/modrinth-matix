import type { Alternative, Entry, KnownSide, ListContent, RemovedRef, SideMode } from './types';

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
 * In a list that follows another list, a line starting with `-` removes those
 * mods from the base list. A leading `+` is allowed for additions and ignored.
 */

const SIDE_TAG_PATTERN = /\[\s*(!?)([scb])\s*\]/gi;
const MODRINTH_HOSTS = new Set(['modrinth.com', 'www.modrinth.com']);
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

export function parseAlternative(raw: string): Alternative | null {
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
	if (!MODRINTH_HOSTS.has(url.hostname.toLowerCase())) return null;

	const parts = url.pathname.split('/').filter(Boolean);
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
	return alternative;
}

export function parseText(text: string): ParseResult {
	const entries: Entry[] = [];
	const removals: RemovedRef[] = [];
	const warnings: ParseWarning[] = [];
	const seen = new Map<string, number>();

	text.split(/\r?\n/).forEach((rawLine, index) => {
		let line = rawLine.trim();
		const lineNumber = index + 1;
		if (!line || line.startsWith('#') || line.startsWith('//')) return;

		const prefix = line.match(/^([+-])\s*/);
		if (prefix) line = line.slice(prefix[0].length);

		if (prefix?.[1] === '-') {
			for (const part of line.split(',')) {
				const trimmed = part.trim();
				if (!trimmed) continue;
				const alternative = parseAlternative(trimmed);
				if (alternative) removals.push({ slug: alternative.slug, projectType: alternative.projectType });
				else warnings.push({ line: lineNumber, message: `Not a Modrinth project URL: ${trimmed}` });
			}
			return;
		}

		const alternatives: Alternative[] = [];
		for (const part of line.split(',')) {
			const trimmed = part.trim();
			if (!trimmed) continue;
			const alternative = parseAlternative(trimmed);
			if (!alternative) {
				warnings.push({ line: lineNumber, message: `Not a Modrinth project URL: ${trimmed}` });
				continue;
			}
			const key = alternative.slug.toLowerCase();
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

		if (alternatives.length > 0) entries.push({ alternatives });
	});

	const content: ListContent = { version: 1, entries };
	if (removals.length > 0) content.removals = removals;
	return { content, warnings };
}

export function serializeAlternative(alternative: Alternative): string {
	const url = `https://modrinth.com/${alternative.projectType}/${alternative.slug}`;
	if (!alternative.side || alternative.sideMode === 'auto') return url;
	const tag = SIDE_TO_TAG[alternative.side];
	return alternative.sideMode === 'force' ? `${url} [!${tag}]` : `${url} [${tag}]`;
}

export function serializeText(content: ListContent): string {
	const lines = content.entries.map((entry) => entry.alternatives.map(serializeAlternative).join(', '));
	for (const removal of content.removals ?? []) {
		lines.push(`- https://modrinth.com/${removal.projectType}/${removal.slug}`);
	}
	return lines.join('\n');
}

export function projectUrl(alternative: Alternative): string {
	return `https://modrinth.com/${alternative.projectType}/${alternative.slug}`;
}
