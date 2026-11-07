import { describe, expect, it } from 'vitest';
import { cfProject, cfVersion, type CfFile, type CfMod } from './curseforge';
import { parseText, serializeText } from './text-format';
import { dataKey, entryKey } from './types';

describe('CurseForge links in the text format', () => {
	it('parses project URLs by type and round-trips them', () => {
		const text = [
			'https://www.curseforge.com/minecraft/mc-mods/jei [!c]',
			'https://modrinth.com/mod/sodium, https://www.curseforge.com/minecraft/mc-mods/sodium',
			'https://www.curseforge.com/minecraft/texture-packs/faithful-32x'
		].join('\n');
		const { content, warnings } = parseText(text);
		expect(warnings).toEqual([]);
		expect(content.entries[0].alternatives[0]).toMatchObject({ platform: 'curseforge', slug: 'jei', projectType: 'mod', sideMode: 'force' });
		expect(content.entries[2].alternatives[0].projectType).toBe('resourcepack');
		expect(serializeText(content)).toBe(text);
	});

	it('keeps the same slug on both platforms apart', () => {
		const [line] = parseText('https://modrinth.com/mod/sodium, https://www.curseforge.com/minecraft/mc-mods/sodium').content.entries;
		expect(line.alternatives.map(dataKey)).toEqual(['sodium', 'cf:sodium']);
		expect(entryKey(line)).toBe('sodium|cf:sodium');
	});

	it('rejects other curseforge pages', () => {
		expect(parseText('https://www.curseforge.com/minecraft/modpacks/all-the-mods').warnings).toHaveLength(1);
	});
});

describe('CurseForge API mapping', () => {
	const mod: CfMod = {
		id: 238222,
		name: 'Just Enough Items (JEI)',
		slug: 'jei',
		classId: 6,
		dateModified: '2026-10-01T00:00:00Z',
		logo: { thumbnailUrl: 'https://media.forgecdn.net/avatars/thumbnails/jei.png' },
		latestFilesIndexes: [{ fileId: 1, gameVersion: '26.3', modLoader: 4 }]
	};
	const file: CfFile = {
		id: 7001,
		modId: 238222,
		displayName: 'jei-26.3-fabric-20.1.0',
		fileName: 'jei-26.3-fabric-20.1.0.jar',
		releaseType: 2,
		fileDate: '2026-10-02T00:00:00Z',
		fileLength: 1234,
		downloadUrl: null,
		hashes: [
			{ value: 'md5hash', algo: 2 },
			{ value: 'sha1hash', algo: 1 }
		],
		gameVersions: ['26.3', 'Fabric', 'Client', 'Server'],
		dependencies: [
			{ modId: 306612, relationType: 3 },
			{ modId: 1, relationType: 4 },
			{ modId: 2, relationType: 5 }
		]
	};

	it('maps mods and files onto the matrix types', () => {
		expect(cfProject(mod)).toMatchObject({ id: 'cf:238222', slug: 'jei', project_type: 'mod', client_side: 'unknown' });
		expect(cfVersion(file)).toMatchObject({
			id: 'cf:7001',
			project_id: 'cf:238222',
			version_type: 'beta',
			game_versions: ['26.3'],
			loaders: ['fabric'],
			files: [{ url: '', filename: 'jei-26.3-fabric-20.1.0.jar', size: 1234, hashes: { sha1: 'sha1hash' } }],
			dependencies: [
				{ project_id: 'cf:306612', dependency_type: 'required' },
				{ project_id: 'cf:2', dependency_type: 'incompatible' }
			]
		});
	});
});
