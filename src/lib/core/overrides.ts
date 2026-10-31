import type { Entry, ListContent } from './types';

export interface OverrideResult {
	content: ListContent;
	/** Overrides that no longer do anything, e.g. removing a mod the base dropped. */
	warnings: string[];
}

const same = (a: string, b: string) => a.toLowerCase() === b.toLowerCase();

/**
 * Builds a following list's mods from its base list and its own overrides:
 * 1. Removals drop that mod from whichever base line has it (a line left empty disappears).
 * 2. Each override line that shares a mod with a base line merges into it: new mods
 *    become extra alternatives, a side tag replaces the base mod's side setting, and
 *    a note or [opt] tag replaces the base line's.
 * 3. Other override lines are appended as new lines.
 */
export function applyOverrides(base: ListContent, overrides: ListContent): OverrideResult {
	const warnings: string[] = [];
	let entries: Entry[] = base.entries.map((entry) => ({
		...entry,
		alternatives: entry.alternatives.map((alternative) => ({ ...alternative }))
	}));

	for (const removal of overrides.removals ?? []) {
		let found = false;
		for (const entry of entries) {
			const before = entry.alternatives.length;
			entry.alternatives = entry.alternatives.filter((alternative) => !same(alternative.slug, removal.slug));
			if (entry.alternatives.length !== before) found = true;
		}
		if (!found) warnings.push(`${removal.slug} isn't in the base list, so removing it does nothing`);
	}
	entries = entries.filter((entry) => entry.alternatives.length > 0);

	for (const override of overrides.entries) {
		const target = entries.find((entry) =>
			entry.alternatives.some((existing) => override.alternatives.some((alt) => same(alt.slug, existing.slug)))
		);
		if (!target) {
			entries.push({ ...override, alternatives: override.alternatives.map((alternative) => ({ ...alternative })) });
			continue;
		}

		let changed = false;
		if (override.note && override.note !== target.note) {
			target.note = override.note;
			changed = true;
		}
		if (override.optional && !target.optional) {
			target.optional = true;
			changed = true;
		}
		for (const alternative of override.alternatives) {
			const existing = target.alternatives.find((alt) => same(alt.slug, alternative.slug));
			if (!existing) {
				target.alternatives.push({ ...alternative });
				changed = true;
			} else if (alternative.sideMode !== 'auto' && (existing.sideMode !== alternative.sideMode || existing.side !== alternative.side)) {
				existing.sideMode = alternative.sideMode;
				existing.side = alternative.side;
				changed = true;
			}
		}
		if (!changed) {
			warnings.push(`${override.alternatives.map((alt) => alt.slug).join(', ')} is already in the base list`);
		}
	}

	return { content: { version: 1, entries }, warnings };
}

/** Drops the override-only parts, for a following list whose base is gone. */
export function withoutRemovals(content: ListContent): ListContent {
	return { version: 1, entries: content.entries };
}
