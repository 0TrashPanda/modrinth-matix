import { describe, expect, it } from 'vitest';
import { blockersFor, bestGameVersion, buildMatrix, countSupport, GameVersionInfo, type ProjectData } from './matrix';
import { modrinthSide, packMembership, resolveSide } from './sides';
import { parseText } from './text-format';
import type { ModrinthProject, ModrinthVersion } from './types';

function project(slug: string, client_side = 'required', server_side = 'unsupported'): ModrinthProject {
	return { id: `id-${slug}`, slug, title: slug, icon_url: null, project_type: 'mod', client_side, server_side };
}

let versionCounter = 0;
function version(
	slug: string,
	gameVersions: string[],
	options: Partial<ModrinthVersion> = {}
): ModrinthVersion {
	versionCounter++;
	return {
		id: `v${versionCounter}`,
		project_id: `id-${slug}`,
		name: `${slug} ${versionCounter}`,
		version_number: String(versionCounter),
		version_type: 'release',
		game_versions: gameVersions,
		loaders: ['fabric'],
		date_published: `2026-01-${String(versionCounter).padStart(2, '0')}T00:00:00Z`,
		files: [],
		dependencies: [],
		...options
	};
}

const tags = new GameVersionInfo([
	{ version: '26.3', version_type: 'release', date: '2026-09-01T00:00:00Z' },
	{ version: '26.3-snapshot-1', version_type: 'snapshot', date: '2026-08-01T00:00:00Z' },
	{ version: '1.21.11', version_type: 'release', date: '2025-12-01T00:00:00Z' },
	{ version: '1.21.1', version_type: 'release', date: '2024-08-01T00:00:00Z' }
]);

describe('sides', () => {
	it('treats optional as working on that side', () => {
		expect(modrinthSide({ client_side: 'required', server_side: 'unsupported' })).toBe('client');
		expect(modrinthSide({ client_side: 'optional', server_side: 'required' })).toBe('both');
		expect(modrinthSide({ client_side: 'optional', server_side: 'optional' })).toBe('both');
		expect(modrinthSide({ client_side: 'unknown', server_side: 'unknown' })).toBe('unknown');
	});

	it('applies forced and fallback overrides in the right order', () => {
		const unknown = { client_side: 'unknown', server_side: 'unknown' };
		const client = { client_side: 'required', server_side: 'unsupported' };
		expect(resolveSide(unknown, { sideMode: 'fallback', side: 'server' })).toBe('server');
		expect(resolveSide(client, { sideMode: 'fallback', side: 'server' })).toBe('client');
		expect(resolveSide(client, { sideMode: 'force', side: 'server' })).toBe('server');
	});

	it('offers unknown-side mods in both packs without ticking them', () => {
		expect(packMembership('both', 'server')).toBe('yes');
		expect(packMembership('client', 'server')).toBe('no');
		expect(packMembership('unknown', 'client')).toBe('maybe');
	});
});

describe('buildMatrix', () => {
	const entries = parseText(
		[
			'https://modrinth.com/mod/sodium',
			'https://modrinth.com/mod/dh, https://modrinth.com/mod/bobby',
			'https://modrinth.com/mod/forgeonly',
			'https://modrinth.com/mod/missing'
		].join('\n')
	).content.entries;

	const data = new Map<string, ProjectData>([
		[
			'sodium',
			{
				ok: true,
				project: project('sodium'),
				versions: [
					version('sodium', ['26.3', '26.3-snapshot-1']),
					version('sodium', ['1.21.1'], { version_type: 'beta' }),
					version('sodium', ['1.21.1'], { version_type: 'release' }),
					version('sodium', ['1.21.1'], { version_type: 'alpha' })
				]
			}
		],
		['dh', { ok: true, project: project('dh'), versions: [version('dh', ['1.21.1'])] }],
		['bobby', { ok: true, project: project('bobby'), versions: [version('bobby', ['1.21.1', '1.21.11'])] }],
		[
			'forgeonly',
			{ ok: true, project: project('forgeonly'), versions: [version('forgeonly', ['26.3'], { loaders: ['forge'] })] }
		],
		['missing', { ok: false, error: 'Not found on Modrinth' }]
	]);

	const matrix = buildMatrix(entries, data, { loader: 'fabric', includeSnapshots: false }, tags);

	it('lists release versions newest first and hides snapshots', () => {
		expect(matrix.gameVersions).toEqual(['26.3', '1.21.11', '1.21.1']);
		const withSnapshots = buildMatrix(entries, data, { loader: 'fabric', includeSnapshots: true }, tags);
		expect(withSnapshots.gameVersions).toContain('26.3-snapshot-1');
	});

	it('picks a release over newer betas and alphas', () => {
		const option = matrix.rows[0].cells.get('1.21.1')![0];
		expect(option.version.version_type).toBe('release');
	});

	it('splits OR-group cells per alternative and filters by loader', () => {
		expect(matrix.rows[1].cells.get('1.21.1')!.map((option) => option.alternative.slug)).toEqual(['dh', 'bobby']);
		expect(matrix.rows[1].cells.get('1.21.11')!.map((option) => option.alternative.slug)).toEqual(['bobby']);
		expect(matrix.rows[2].cells.size).toBe(0);
	});

	it('reports fetch errors on the row', () => {
		expect(matrix.rows[3].errors).toEqual(['missing: Not found on Modrinth']);
	});

	it('counts enabled rows and picks the newest best version', () => {
		const counts = countSupport(matrix, new Set());
		expect(Object.fromEntries(counts)).toEqual({ '26.3': 1, '1.21.11': 1, '1.21.1': 2 });
		expect(bestGameVersion(matrix, counts)).toBe('1.21.1');

		const withoutDh = countSupport(matrix, new Set(['dh|bobby']));
		expect(bestGameVersion(matrix, withoutDh)).toBe('26.3');
	});

	it('lists blockers with their latest supported version', () => {
		const blockers = blockersFor(matrix, '26.3', new Set(['missing']));
		expect(blockers.map((blocker) => [blocker.row.key, blocker.latestSupported])).toEqual([
			['dh|bobby', '1.21.11'],
			['forgeonly', null]
		]);
	});
});
