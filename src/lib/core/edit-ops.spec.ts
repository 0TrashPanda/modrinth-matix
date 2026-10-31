import { describe, expect, it } from 'vitest';
import { mergeEntries, moveEntry, removeAlternative, removeSection, renameSection, setSide, splitEntry, updateEntry } from './edit-ops';
import { parseText, serializeText } from './text-format';

const content = parseText(
	[
		'https://modrinth.com/mod/a',
		'perf:',
		'https://modrinth.com/mod/b',
		'https://modrinth.com/mod/c',
		'visual:',
		'https://modrinth.com/mod/d, https://modrinth.com/mod/e, keep this note'
	].join('\n')
).content;

const lines = (c: typeof content) => serializeText(c).split('\n');

describe('edit operations', () => {
	it('moves an entry before another, taking its section', () => {
		expect(lines(moveEntry(content, 0, 2, 'perf'))).toEqual([
			'perf:',
			'https://modrinth.com/mod/b',
			'https://modrinth.com/mod/a',
			'https://modrinth.com/mod/c',
			'',
			'visual:',
			'https://modrinth.com/mod/d, https://modrinth.com/mod/e, keep this note'
		]);
	});

	it('moves an entry to the end of a section', () => {
		const moved = moveEntry(content, 1, null, 'visual');
		expect(moved.entries.map((entry) => entry.alternatives[0].slug)).toEqual(['a', 'c', 'd', 'b']);
		expect(moved.entries[3].section).toBe('visual');
	});

	it('merges into an OR-line and splits it again', () => {
		const merged = mergeEntries(content, 0, 3);
		expect(merged.entries.at(-1)!.alternatives.map((alt) => alt.slug)).toEqual(['d', 'e', 'a']);
		const split = splitEntry(content, 3);
		expect(split.entries.slice(3).map((entry) => [entry.alternatives[0].slug, entry.note])).toEqual([
			['d', 'keep this note'],
			['e', undefined]
		]);
	});

	it('edits sides, notes, optional and sections', () => {
		let next = setSide(content, 0, 'a', 'force', 'client');
		next = updateEntry(next, 1, { optional: true, note: 'fast' });
		next = renameSection(next, 'visual', 'eye candy');
		next = removeAlternative(next, 3, 'e');
		expect(lines(next)).toEqual([
			'https://modrinth.com/mod/a [!c]',
			'',
			'perf:',
			'https://modrinth.com/mod/b [opt], fast',
			'https://modrinth.com/mod/c',
			'',
			'eye candy:',
			'https://modrinth.com/mod/d, keep this note'
		]);
		expect(removeSection(next, 'perf').entries.map((entry) => entry.section)).toEqual([undefined, undefined, undefined, 'eye candy']);
	});
});
