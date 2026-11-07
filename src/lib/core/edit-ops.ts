import { groupBySection } from './text-format';
import type { Alternative, Entry, KnownSide, ListContent, SideMode } from './types';

/**
 * Pure edits used by the visual editor. Each returns a new content object with
 * entries kept grouped by section (the order the text format writes them in).
 */

function withEntries(content: ListContent, entries: Entry[]): ListContent {
	const grouped = groupBySection(entries).flatMap((group) => group.entries);
	return { ...content, entries: grouped };
}

const clone = (entry: Entry): Entry => ({ ...entry, alternatives: entry.alternatives.map((alt) => ({ ...alt })) });

export function normalize(content: ListContent): ListContent {
	return withEntries(content, content.entries);
}

export function addEntry(content: ListContent, alternative: Alternative, section?: string): ListContent {
	const entry: Entry = { alternatives: [alternative] };
	if (section) entry.section = section;
	return withEntries(content, [...content.entries, entry]);
}

export function addAlternative(content: ListContent, index: number, alternative: Alternative): ListContent {
	const entries = content.entries.map(clone);
	entries[index].alternatives.push(alternative);
	return withEntries(content, entries);
}

export function removeEntry(content: ListContent, index: number): ListContent {
	return withEntries(content, content.entries.filter((_, i) => i !== index));
}

export function removeAlternative(content: ListContent, index: number, slug: string): ListContent {
	const entries = content.entries.map(clone);
	entries[index].alternatives = entries[index].alternatives.filter((alt) => alt.slug !== slug);
	return withEntries(content, entries.filter((entry) => entry.alternatives.length > 0));
}

/** Moves an entry to sit before `beforeIndex` (or at the end of `section` when null). */
export function moveEntry(content: ListContent, from: number, beforeIndex: number | null, section: string | undefined): ListContent {
	const entries = content.entries.map(clone);
	const moved = entries[from];
	const target = beforeIndex === null || beforeIndex === from ? null : entries[beforeIndex];
	entries.splice(from, 1);
	if (section) moved.section = section;
	else delete moved.section;

	if (target) entries.splice(entries.indexOf(target), 0, moved);
	else if (beforeIndex === from) entries.splice(from, 0, moved);
	else entries.push(moved);
	return withEntries(content, entries);
}

/** Puts every alternative of `from` into `into`, making one OR-line. */
export function mergeEntries(content: ListContent, from: number, into: number): ListContent {
	if (from === into) return content;
	const entries = content.entries.map(clone);
	const target = entries[into];
	for (const alternative of entries[from].alternatives) {
		if (!target.alternatives.some((alt) => alt.slug === alternative.slug)) target.alternatives.push(alternative);
	}
	if (!target.note && entries[from].note) target.note = entries[from].note;
	return withEntries(content, entries.filter((_, i) => i !== from));
}

/** Splits an OR-line into one line per alternative. */
export function splitEntry(content: ListContent, index: number): ListContent {
	const entries = content.entries.map(clone);
	const entry = entries[index];
	const parts = entry.alternatives.map((alternative, i) => {
		const part: Entry = { ...entry, alternatives: [alternative] };
		if (i > 0) delete part.note;
		return part;
	});
	entries.splice(index, 1, ...parts);
	return withEntries(content, entries);
}

export function updateEntry(content: ListContent, index: number, change: Partial<Pick<Entry, 'note' | 'optional'>>): ListContent {
	const entries = content.entries.map(clone);
	const entry = entries[index];
	if ('note' in change) {
		if (change.note?.trim()) entry.note = change.note.trim().slice(0, 500);
		else delete entry.note;
	}
	if ('optional' in change) {
		if (change.optional) entry.optional = true;
		else delete entry.optional;
	}
	return withEntries(content, entries);
}

export function setSide(content: ListContent, index: number, slug: string, mode: SideMode, side?: KnownSide): ListContent {
	const entries = content.entries.map(clone);
	const alternative = entries[index].alternatives.find((alt) => alt.slug === slug);
	if (alternative) {
		alternative.sideMode = mode;
		if (mode === 'auto' || !side) delete alternative.side;
		else alternative.side = side;
	}
	return withEntries(content, entries);
}

export function setPin(content: ListContent, index: number, slug: string, pin: string): ListContent {
	const entries = content.entries.map(clone);
	const alternative = entries[index].alternatives.find((alt) => alt.slug === slug);
	if (alternative) {
		const value = pin.trim().replace(/[\]\s]/g, '').slice(0, 60);
		if (value) alternative.pin = value;
		else delete alternative.pin;
	}
	return withEntries(content, entries);
}

export function renameSection(content: ListContent, from: string, to: string): ListContent {
	const name = to.trim().slice(0, 80);
	const entries = content.entries.map((entry) => {
		if (entry.section !== from) return entry;
		const copy = clone(entry);
		if (name) copy.section = name;
		else delete copy.section;
		return copy;
	});
	return withEntries(content, entries);
}

/** Removes the heading only; its entries move to the top, unsectioned. */
export function removeSection(content: ListContent, section: string): ListContent {
	return renameSection(content, section, '');
}

export function containsSlug(content: ListContent, slug: string): boolean {
	const key = slug.toLowerCase();
	return content.entries.some((entry) => entry.alternatives.some((alt) => alt.slug.toLowerCase() === key));
}
