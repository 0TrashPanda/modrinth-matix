import { describe, expect, it } from 'vitest';
import { buildMrpackIndex, downloadScript, folderFor } from './mrpack';
import type { ModrinthFile } from './types';

const file = (filename: string): ModrinthFile => ({
	url: `https://cdn.modrinth.com/data/x/${filename}`,
	filename,
	primary: true,
	size: 100,
	hashes: { sha1: 'aa', sha512: 'bb' }
});

describe('mrpack', () => {
	it('puts files in type folders and sets env per pack', () => {
		const index = buildMrpackIndex({
			name: 'Test',
			gameVersion: '26.3',
			loader: 'fabric',
			loaderVersion: '0.20.1',
			entries: [
				{ file: file('sodium.jar'), projectType: 'mod', packs: new Set(['client']) },
				{ file: file('lithium.jar'), projectType: 'mod', packs: new Set(['client', 'server']) },
				{ file: file('shader.zip'), projectType: 'shader', packs: new Set(['client']) }
			]
		});
		expect(index.dependencies).toEqual({ minecraft: '26.3', 'fabric-loader': '0.20.1' });
		expect(index.files.map((f) => [f.path, f.env])).toEqual([
			['mods/sodium.jar', { client: 'required', server: 'unsupported' }],
			['mods/lithium.jar', { client: 'required', server: 'required' }],
			['shaderpacks/shader.zip', { client: 'required', server: 'unsupported' }]
		]);
		expect(folderFor('resourcepack')).toBe('resourcepacks');
	});

	it('writes download scripts with hash checks', () => {
		const files = [{ file: file('a.jar'), path: 'mods/a.jar' }];
		expect(downloadScript(files, 'bash')).toContain('echo "aa  mods/a.jar" | sha1sum -c --quiet');
		expect(downloadScript(files, 'powershell')).toContain('Get-FileHash "mods\\a.jar" -Algorithm SHA1');
	});
});
