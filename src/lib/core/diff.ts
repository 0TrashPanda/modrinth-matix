import { serializeAlternative } from './text-format';
import type { Entry, ListContent, RemovedRef } from './types';

export type DiffLine =
	| { kind: 'added'; entry: Entry }
	| { kind: 'removed'; entry: Entry }
	| { kind: 'changed'; before: Entry; after: Entry }
	// A following list started or stopped removing a base mod.
	| { kind: 'removal-added'; removal: RemovedRef }
	| { kind: 'removal-dropped'; removal: RemovedRef };

function serializeEntry(entry: Entry): string {
	return entry.alternatives.map(serializeAlternative).join(', ');
}

function slugs(entry: Entry): Set<string> {
	return new Set(entry.alternatives.map((alt) => alt.slug.toLowerCase()));
}

/** Entries are matched when they share any slug, so adding an alternative shows as a change. */
export function diffContent(before: ListContent, after: ListContent): DiffLine[] {
	const lines: DiffLine[] = [];
	const unmatched = [...before.entries];

	for (const entry of after.entries) {
		const entrySlugs = slugs(entry);
		const index = unmatched.findIndex((old) => [...slugs(old)].some((slug) => entrySlugs.has(slug)));
		if (index === -1) {
			lines.push({ kind: 'added', entry });
			continue;
		}
		const [old] = unmatched.splice(index, 1);
		if (serializeEntry(old) !== serializeEntry(entry)) {
			lines.push({ kind: 'changed', before: old, after: entry });
		}
	}

	for (const entry of unmatched) lines.push({ kind: 'removed', entry });

	const beforeRemovals = new Set((before.removals ?? []).map((removal) => removal.slug.toLowerCase()));
	const afterRemovals = new Set((after.removals ?? []).map((removal) => removal.slug.toLowerCase()));
	for (const removal of after.removals ?? []) {
		if (!beforeRemovals.has(removal.slug.toLowerCase())) lines.push({ kind: 'removal-added', removal });
	}
	for (const removal of before.removals ?? []) {
		if (!afterRemovals.has(removal.slug.toLowerCase())) lines.push({ kind: 'removal-dropped', removal });
	}

	return lines;
}

export function summarizeDiff(lines: DiffLine[]): string {
	const counts = { added: 0, removed: 0, changed: 0, 'removal-added': 0, 'removal-dropped': 0 };
	for (const line of lines) counts[line.kind]++;
	const parts: string[] = [];
	if (counts.added) parts.push(`${counts.added} added`);
	if (counts.removed) parts.push(`${counts.removed} removed`);
	if (counts.changed) parts.push(`${counts.changed} changed`);
	const removalChanges = counts['removal-added'] + counts['removal-dropped'];
	if (removalChanges) parts.push(`${removalChanges} base removal${removalChanges === 1 ? '' : 's'} changed`);
	return parts.join(', ') || 'No mod changes';
}
