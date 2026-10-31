import { isBetterVersion, primaryFile, supportsLoader, type CellOption, type Matrix, type MatrixRow } from './matrix';
import { packMembership } from './sides';
import type { Loader, ModrinthProject, ModrinthVersion, Pack } from './types';

export interface PackItem {
	row: MatrixRow;
	/** Options that belong in this pack (side matches, or side unknown). */
	options: CellOption[];
	/** Index into `options` picked by default. */
	defaultChoice: number;
	/** Ticked by default: only when the chosen option is known to belong in this pack. */
	defaultIncluded: boolean;
	/** Every option in the cell, for explaining why nothing fits this pack. */
	allOptions: CellOption[];
}

export function packItems(matrix: Matrix, gameVersion: string, pack: Pack, disabled: Set<string>): PackItem[] {
	const items: PackItem[] = [];
	for (const row of matrix.rows) {
		if (disabled.has(row.key)) continue;
		const allOptions = row.cells.get(gameVersion);
		if (!allOptions) continue;

		const yes = allOptions.filter((option) => packMembership(option.side, pack) === 'yes');
		const maybe = allOptions.filter((option) => packMembership(option.side, pack) === 'maybe');
		const options = [...yes, ...maybe];
		items.push({
			row,
			options,
			defaultChoice: 0,
			defaultIncluded: yes.length > 0,
			allOptions
		});
	}
	return items;
}

export interface DependencyApi {
	getProjects(ids: string[]): Promise<ModrinthProject[]>;
	getVersions(ids: string[]): Promise<ModrinthVersion[]>;
	getProjectVersions(projectId: string): Promise<ModrinthVersion[]>;
}

export interface DependencyRoot {
	title: string;
	version: ModrinthVersion;
}

export interface ResolvedDependency {
	project: ModrinthProject | null;
	version: ModrinthVersion;
	neededBy: string[];
}

export interface UnresolvedDependency {
	label: string;
	neededBy: string[];
}

export interface DependencyResult {
	resolved: ResolvedDependency[];
	unresolved: UnresolvedDependency[];
}

const MAX_DEPTH = 8;

/**
 * Finds required dependencies of the chosen versions, recursively, skipping
 * projects that are already selected. A dependency pinned to a version uses that
 * version; otherwise the best version for the loader and game version is picked.
 */
export async function resolveDependencies(
	roots: DependencyRoot[],
	api: DependencyApi,
	target: { loader: Loader; gameVersion: string }
): Promise<DependencyResult> {
	const selected = new Set(roots.map((root) => root.version.project_id));
	const resolved = new Map<string, ResolvedDependency>();
	const unresolved = new Map<string, UnresolvedDependency>();
	const projectCache = new Map<string, ModrinthProject>();

	let level: DependencyRoot[] = roots;

	for (let depth = 0; depth < MAX_DEPTH && level.length > 0; depth++) {
		const byVersionId = new Map<string, string[]>();
		const byProjectId = new Map<string, string[]>();

		for (const { title, version } of level) {
			for (const dep of version.dependencies) {
				if (dep.dependency_type !== 'required') continue;
				if (dep.project_id && selected.has(dep.project_id)) continue;
				if (dep.project_id && resolved.has(dep.project_id)) {
					resolved.get(dep.project_id)!.neededBy.push(title);
					continue;
				}
				if (dep.version_id) {
					byVersionId.set(dep.version_id, [...(byVersionId.get(dep.version_id) ?? []), title]);
				} else if (dep.project_id) {
					byProjectId.set(dep.project_id, [...(byProjectId.get(dep.project_id) ?? []), title]);
				} else {
					const label = dep.file_name ?? 'Unknown dependency';
					const existing = unresolved.get(label);
					if (existing) existing.neededBy.push(title);
					else unresolved.set(label, { label, neededBy: [title] });
				}
			}
		}

		const found: { version: ModrinthVersion; neededBy: string[] }[] = [];

		if (byVersionId.size > 0) {
			const versions = await api.getVersions([...byVersionId.keys()]);
			const byId = new Map(versions.map((version) => [version.id, version]));
			for (const [versionId, neededBy] of byVersionId) {
				const version = byId.get(versionId);
				if (version) found.push({ version, neededBy });
				else unresolved.set(versionId, { label: `Version ${versionId}`, neededBy });
			}
		}

		const projectIds = [
			...byProjectId.keys(),
			...found.map((item) => item.version.project_id)
		].filter((id) => !projectCache.has(id));
		if (projectIds.length > 0) {
			for (const project of await api.getProjects([...new Set(projectIds)])) {
				projectCache.set(project.id, project);
			}
		}

		await Promise.all(
			[...byProjectId].map(async ([projectId, neededBy]) => {
				const project = projectCache.get(projectId);
				const versions = await api.getProjectVersions(projectId);
				let best: ModrinthVersion | null = null;
				for (const version of versions) {
					if (!version.game_versions.includes(target.gameVersion)) continue;
					if (project && !supportsLoader(project, version, target.loader)) continue;
					if (!project && !version.loaders.includes(target.loader)) continue;
					if (!best || isBetterVersion(version, best)) best = version;
				}
				if (best) found.push({ version: best, neededBy });
				else
					unresolved.set(projectId, {
						label: `${project?.title ?? projectId} (no ${target.loader} ${target.gameVersion} version)`,
						neededBy
					});
			})
		);

		const next: DependencyRoot[] = [];
		for (const { version, neededBy } of found) {
			const existing = resolved.get(version.project_id);
			if (existing) {
				existing.neededBy.push(...neededBy);
				continue;
			}
			if (selected.has(version.project_id)) continue;
			const project = projectCache.get(version.project_id) ?? null;
			resolved.set(version.project_id, { project, version, neededBy: [...neededBy] });
			next.push({ title: project?.title ?? version.name, version });
		}
		level = next;
	}

	for (const dependency of resolved.values()) {
		dependency.neededBy = [...new Set(dependency.neededBy)];
	}

	return { resolved: [...resolved.values()], unresolved: [...unresolved.values()] };
}

/** Version page on Modrinth, used for "open as tabs" when there's no direct file. */
export function versionPageUrl(projectType: string, slug: string, gameVersion: string, loader: Loader): string {
	const params = new URLSearchParams({ g: gameVersion, l: loader });
	return `https://modrinth.com/${projectType}/${slug}/versions?${params}`;
}

export { primaryFile };
