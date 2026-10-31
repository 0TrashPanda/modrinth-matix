import { describe, expect, it } from 'vitest';
import { diffContent } from './diff';
import { applyOverrides } from './overrides';
import { parseText, serializeText } from './text-format';

const base = parseText(
	[
		'https://modrinth.com/mod/sodium',
		'https://modrinth.com/mod/distanthorizons, https://modrinth.com/mod/voxy',
		'https://modrinth.com/mod/crawl',
		'https://modrinth.com/mod/chunky [s]'
	].join('\n')
).content;

describe('override text format', () => {
	it('parses removals and ignores a leading +', () => {
		const { content } = parseText('+ https://modrinth.com/mod/axiom\n- https://modrinth.com/mod/crawl, https://modrinth.com/mod/voxy');
		expect(content.entries.map((entry) => entry.alternatives[0].slug)).toEqual(['axiom']);
		expect(content.removals).toEqual([
			{ slug: 'crawl', projectType: 'mod' },
			{ slug: 'voxy', projectType: 'mod' }
		]);
		expect(serializeText(content)).toBe(
			'https://modrinth.com/mod/axiom\n\n- https://modrinth.com/mod/crawl\n- https://modrinth.com/mod/voxy'
		);
	});

	it('leaves removals out of plain lists', () => {
		expect(parseText('https://modrinth.com/mod/sodium').content).toEqual({
			version: 1,
			entries: [{ alternatives: [{ platform: 'modrinth', slug: 'sodium', projectType: 'mod', sideMode: 'auto' }] }]
		});
	});
});

describe('applyOverrides', () => {
	it('removes, adds alternatives, overrides sides and appends new mods', () => {
		const overrides = parseText(
			[
				'- https://modrinth.com/mod/crawl',
				'- https://modrinth.com/mod/voxy',
				'https://modrinth.com/mod/sodium, https://modrinth.com/mod/embeddium',
				'https://modrinth.com/mod/chunky [!c]',
				'https://modrinth.com/mod/axiom'
			].join('\n')
		).content;

		const { content, warnings } = applyOverrides(base, overrides);
		expect(serializeText(content).split('\n')).toEqual([
			'https://modrinth.com/mod/sodium, https://modrinth.com/mod/embeddium',
			'https://modrinth.com/mod/distanthorizons',
			'https://modrinth.com/mod/chunky [!c]',
			'https://modrinth.com/mod/axiom'
		]);
		expect(warnings).toEqual([]);
		// The base list itself is untouched.
		expect(base.entries).toHaveLength(4);
	});

	it('drops lines whose every alternative was removed', () => {
		const overrides = parseText('- https://modrinth.com/mod/distanthorizons, https://modrinth.com/mod/voxy').content;
		expect(applyOverrides(base, overrides).content.entries).toHaveLength(3);
	});

	it('warns about overrides that do nothing', () => {
		const overrides = parseText('- https://modrinth.com/mod/optifine\nhttps://modrinth.com/mod/sodium').content;
		expect(applyOverrides(base, overrides).warnings).toEqual([
			"optifine isn't in the base list, so removing it does nothing",
			'sodium is already in the base list'
		]);
	});
});

describe('diffContent with removals', () => {
	it('reports removals that were added or dropped', () => {
		const before = parseText('- https://modrinth.com/mod/crawl').content;
		const after = parseText('- https://modrinth.com/mod/voxy').content;
		expect(diffContent(before, after).map((line) => line.kind)).toEqual(['removal-added', 'removal-dropped']);
	});
});
