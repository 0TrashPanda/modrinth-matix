import { describe, expect, it } from 'vitest';
import { parseAlternative, parseText, serializeText } from './text-format';

describe('parseAlternative', () => {
	it('reads type and slug from a project URL', () => {
		expect(parseAlternative('https://modrinth.com/mod/sodium')).toEqual({
			platform: 'modrinth',
			slug: 'sodium',
			projectType: 'mod',
			sideMode: 'auto'
		});
	});

	it('uses the slug, not the last segment, for deeper links', () => {
		expect(parseAlternative('https://modrinth.com/mod/sodium/versions')?.slug).toBe('sodium');
		expect(parseAlternative('https://modrinth.com/shader/complementary-reimagined')?.projectType).toBe(
			'shader'
		);
	});

	it('accepts www and missing scheme', () => {
		expect(parseAlternative('www.modrinth.com/mod/lithium')?.slug).toBe('lithium');
		expect(parseAlternative('modrinth.com/mod/lithium')?.slug).toBe('lithium');
	});

	it('reads fallback and forced side tags', () => {
		expect(parseAlternative('https://modrinth.com/mod/chunky [s]')).toMatchObject({
			sideMode: 'fallback',
			side: 'server'
		});
		expect(parseAlternative('https://modrinth.com/mod/foo [!C]')).toMatchObject({
			sideMode: 'force',
			side: 'client'
		});
		// A forced tag wins over a fallback tag, as in v1.
		expect(parseAlternative('https://modrinth.com/mod/foo [b] [!c]')).toMatchObject({
			sideMode: 'force',
			side: 'client'
		});
	});

	it('rejects other sites', () => {
		expect(parseAlternative('https://curseforge.com/minecraft/mc-mods/jei')).toBeNull();
		expect(parseAlternative('not a url at all')).toBeNull();
	});
});

describe('parseText', () => {
	it('parses OR-groups, skips comments and reports bad parts', () => {
		const { content, warnings } = parseText(
			[
				'# performance',
				'https://modrinth.com/mod/sodium',
				'',
				'https://modrinth.com/mod/distanthorizons, https://modrinth.com/mod/bobby',
				'https://example.com/nope',
				'https://modrinth.com/mod/sodium'
			].join('\r\n')
		);
		expect(content.entries.map((entry) => entry.alternatives.map((alt) => alt.slug))).toEqual([
			['sodium'],
			['distanthorizons', 'bobby'],
			['sodium']
		]);
		expect(warnings).toEqual([
			{ line: 5, message: 'Not a Modrinth project URL: https://example.com/nope' },
			{ line: 6, message: 'sodium is already on line 2' }
		]);
	});

	it('round-trips through serializeText', () => {
		const text = [
			'https://modrinth.com/mod/sodium',
			'https://modrinth.com/mod/distanthorizons [!c], https://modrinth.com/mod/bobby',
			'https://modrinth.com/plugin/chunky [s]'
		].join('\n');
		expect(serializeText(parseText(text).content)).toBe(text);
	});
});
