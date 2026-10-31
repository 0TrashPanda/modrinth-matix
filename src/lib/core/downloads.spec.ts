import { describe, expect, it } from 'vitest';
import { diffContent, summarizeDiff } from './diff';
import { resolveDependencies, type DependencyApi } from './downloads';
import { parseText } from './text-format';
import type { ModrinthDependency, ModrinthProject, ModrinthVersion } from './types';

function project(id: string): ModrinthProject {
	return { id, slug: id, title: id.toUpperCase(), icon_url: null, project_type: 'mod', client_side: 'required', server_side: 'required' };
}

function version(id: string, projectId: string, deps: Partial<ModrinthDependency>[] = [], extra: Partial<ModrinthVersion> = {}): ModrinthVersion {
	return {
		id,
		project_id: projectId,
		name: id,
		version_number: id,
		version_type: 'release',
		game_versions: ['1.21.1'],
		loaders: ['fabric'],
		date_published: '2026-01-01T00:00:00Z',
		files: [],
		dependencies: deps.map((dep) => ({
			version_id: null,
			project_id: null,
			file_name: null,
			dependency_type: 'required',
			...dep
		})),
		...extra
	};
}

describe('resolveDependencies', () => {
	const versions = new Map<string, ModrinthVersion>([
		['api-pinned', version('api-pinned', 'fabric-api')],
		['lib-old', version('lib-old', 'lib', [{ project_id: 'deep' }], { date_published: '2025-01-01T00:00:00Z' })],
		['lib-beta', version('lib-beta', 'lib', [{ project_id: 'deep' }], { version_type: 'beta', date_published: '2026-06-01T00:00:00Z' })],
		['lib-forge', version('lib-forge', 'lib', [], { loaders: ['forge'], date_published: '2026-07-01T00:00:00Z' })],
		['deep-1', version('deep-1', 'deep')]
	]);

	const api: DependencyApi = {
		async getProjects(ids) {
			return ids.map(project);
		},
		async getVersions(ids) {
			return ids.map((id) => versions.get(id)).filter((v): v is ModrinthVersion => !!v);
		},
		async getProjectVersions(projectId) {
			return [...versions.values()].filter((v) => v.project_id === projectId);
		}
	};

	it('resolves recursively, prefers releases and skips selected projects', async () => {
		const roots = [
			{ title: 'Sodium', version: version('s1', 'sodium', [{ version_id: 'api-pinned', project_id: 'fabric-api' }, { project_id: 'lib' }]) },
			{ title: 'Iris', version: version('i1', 'iris', [{ project_id: 'sodium' }, { project_id: 'lib' }, { project_id: 'opt', dependency_type: 'optional' }]) }
		];
		const result = await resolveDependencies(roots, api, { loader: 'fabric', gameVersion: '1.21.1' });

		expect(result.resolved.map((dep) => [dep.version.id, dep.neededBy])).toEqual([
			['api-pinned', ['Sodium']],
			['lib-old', ['Sodium', 'Iris']],
			['deep-1', ['LIB']]
		]);
		expect(result.unresolved).toEqual([]);
	});

	it('reports dependencies with no matching version', async () => {
		const roots = [{ title: 'Sodium', version: version('s1', 'sodium', [{ project_id: 'nothing' }]) }];
		const result = await resolveDependencies(roots, api, { loader: 'fabric', gameVersion: '1.21.1' });
		expect(result.unresolved).toEqual([{ label: 'NOTHING (no fabric 1.21.1 version)', neededBy: ['Sodium'] }]);
	});
});

describe('diffContent', () => {
	it('matches entries by shared slug', () => {
		const before = parseText('https://modrinth.com/mod/a\nhttps://modrinth.com/mod/b\nhttps://modrinth.com/mod/c').content;
		const after = parseText('https://modrinth.com/mod/a\nhttps://modrinth.com/mod/b, https://modrinth.com/mod/b2\nhttps://modrinth.com/mod/d').content;
		const lines = diffContent(before, after);
		expect(lines.map((line) => line.kind)).toEqual(['changed', 'added', 'removed']);
		expect(summarizeDiff(lines)).toBe('1 added, 1 removed, 1 changed');
	});
});
