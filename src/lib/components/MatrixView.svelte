<script lang="ts">
	import { untrack } from 'svelte';
	import {
		bestGameVersion,
		blockersFor,
		buildMatrix,
		countSupport,
		GameVersionInfo,
		type CellOption,
		type MatrixRow,
		type ProjectData
	} from '#lib/core/matrix.ts';
	import { packItems } from '#lib/core/downloads.ts';
	import { SIDE_LABEL, SIDE_TITLE } from '#lib/core/sides.ts';
	import { projectUrl } from '#lib/core/text-format.ts';
	import { LOADERS, type Entry, type ListSettings, type Loader } from '#lib/core/types.ts';
	import { getGameVersionTags, loadProjects, type LoadProgress } from '#lib/client/modrinth.ts';
	import { loadLocal, saveLocal } from '#lib/client/storage.ts';
	import DownloadDialog from './DownloadDialog.svelte';

	interface Props {
		entries: Entry[];
		settings: ListSettings;
		/** Remembers row toggles and view options per list in this browser. */
		storageKey: string;
		/** Used in zip file names. */
		name: string;
	}

	let { entries, settings, storageKey, name }: Props = $props();

	const LOADER_NAMES: Record<Loader, string> = { fabric: 'Fabric', forge: 'Forge', neoforge: 'NeoForge', quilt: 'Quilt' };

	// Loader and snapshot chips are a per-visit override of the list's settings;
	// toggled-off rows are remembered in this browser.
	let loader = $state<Loader>(untrack(() => settings.loader));
	let includeSnapshots = $state(untrack(() => settings.includeSnapshots));
	let disabled = $state(new Set(untrack(() => loadLocal<string[]>(`disabled:${storageKey}`, []))));

	let data = $state<Map<string, ProjectData> | null>(null);
	let tags = $state<GameVersionInfo>(new GameVersionInfo([]));
	let progress = $state<LoadProgress | null>(null);
	let selected = $state<string | null>(null);
	let downloadOpen = $state(false);
	let loadId = 0;

	$effect(() => {
		saveLocal(`disabled:${storageKey}`, [...disabled]);
	});

	const slugKey = $derived(entries.flatMap((entry) => entry.alternatives.map((alt) => alt.slug)).join(','));

	async function load(force = false) {
		const id = ++loadId;
		const slugs = slugKey ? slugKey.split(',') : [];
		progress = { done: 0, total: slugs.length };
		const [tagList, result] = await Promise.all([
			getGameVersionTags(),
			loadProjects(slugs, {
				force,
				onProgress: (p) => {
					if (id === loadId) progress = p;
				}
			})
		]);
		if (id !== loadId) return;
		tags = new GameVersionInfo(tagList);
		data = result;
		progress = null;
	}

	$effect(() => {
		void slugKey;
		untrack(() => load());
	});

	const matrix = $derived(data ? buildMatrix(entries, data, { loader, includeSnapshots }, tags) : null);
	const counts = $derived(matrix ? countSupport(matrix, disabled) : new Map<string, number>());
	const best = $derived(matrix ? bestGameVersion(matrix, counts) : null);
	const maxCount = $derived(Math.max(0, ...counts.values()));
	const enabledCount = $derived(matrix?.rows.filter((row) => !disabled.has(row.key)).length ?? 0);
	const active = $derived(selected && matrix?.gameVersions.includes(selected) ? selected : best);
	const failedRows = $derived(matrix?.rows.filter((row) => row.errors.length > 0) ?? []);

	const newerBlockers = $derived.by(() => {
		if (!matrix || !active) return [];
		const index = matrix.gameVersions.indexOf(active);
		return matrix.gameVersions
			.slice(Math.max(0, index - 2), index)
			.reverse()
			.map((gameVersion) => ({ gameVersion, blockers: blockersFor(matrix, gameVersion, disabled) }));
	});

	const packCounts = $derived.by(() => {
		if (!matrix || !active) return null;
		const count = (pack: 'client' | 'server') =>
			packItems(matrix, active, pack, disabled).filter((item) => item.defaultIncluded).length;
		return { client: count('client'), server: count('server') };
	});

	function toggleRow(row: MatrixRow) {
		const next = new Set(disabled);
		if (next.has(row.key)) next.delete(row.key);
		else next.add(row.key);
		disabled = next;
	}

	function rowTitle(row: MatrixRow, index: number) {
		return row.projects[index]?.title ?? row.entry.alternatives[index].slug;
	}

	function firstProject(row: MatrixRow) {
		return row.projects.find((project) => project) ?? null;
	}

	function cellTitle(option: CellOption) {
		const date = option.version.date_published.slice(0, 10);
		return `${option.project.title} ${option.version.version_number} (${option.version.version_type}, ${date}) · ${SIDE_TITLE[option.side]}`;
	}
</script>

<div class="toolbar">
	{#each LOADERS as option (option)}
		<button class="chip" class:on={loader === option} onclick={() => (loader = option)}>{LOADER_NAMES[option]}</button>
	{/each}
	<button class="chip" class:on={includeSnapshots} onclick={() => (includeSnapshots = !includeSnapshots)}>
		Snapshots {includeSnapshots ? 'on' : 'off'}
	</button>
	<button class="chip" onclick={() => load(true)} disabled={progress !== null} title="Ignore the cache and fetch fresh data">
		↻ Refresh
	</button>
</div>

{#if progress}
	<div class="progress-wrap">
		<div class="row between"><span>Loading projects from Modrinth…</span><span class="muted">{progress.done} / {progress.total}</span></div>
		<div class="progress"><i style:width="{progress.total ? (progress.done / progress.total) * 100 : 0}%"></i></div>
	</div>
{/if}

{#if failedRows.length > 0}
	<div class="alert error errors">
		<strong>{failedRows.length} {failedRows.length === 1 ? 'entry' : 'entries'} couldn't be loaded:</strong>
		<ul>
			{#each failedRows as row (row.key)}
				{#each row.errors as message (message)}<li>{message}</li>{/each}
			{/each}
		</ul>
	</div>
{/if}

{#if entries.length === 0}
	<div class="card empty">This list is empty. Add some Modrinth URLs to see the matrix.</div>
{:else if matrix}
	<div class="layout">
		<div class="matrix-col">
			{#if matrix.gameVersions.length === 0}
				<div class="card empty">No {LOADER_NAMES[loader]} versions found for these mods.</div>
			{:else}
				<div class="card tight">
					<div class="matrix-scroll">
						<table class="matrix">
							<thead>
								<tr>
									<th class="name-col">Mod <span class="muted">· {enabledCount} on</span></th>
									{#each matrix.gameVersions as gameVersion (gameVersion)}
										<th class:best={counts.get(gameVersion) === maxCount && maxCount > 0} class:sel={gameVersion === active}>
											<button class="col-btn" onclick={() => (selected = gameVersion)}>
												{gameVersion}<span class="n">{counts.get(gameVersion)}</span>
											</button>
										</th>
									{/each}
								</tr>
							</thead>
							<tbody>
								{#each matrix.rows as row (row.key)}
									{@const project = firstProject(row)}
									<tr class:off={disabled.has(row.key)} onclick={() => toggleRow(row)} title="Click to toggle">
										<td class="name-col">
											<div class="mod">
												{#if project?.icon_url}
													<img class="ico" src={project.icon_url} alt="" loading="lazy" />
												{:else}
													<span class="ico"></span>
												{/if}
												<span class="mod-names">
													{#each row.entry.alternatives as alternative, index (alternative.slug)}
														{#if index > 0}<span class="or">or</span>{/if}
														<a
															href={projectUrl(alternative)}
															target="_blank"
															rel="noopener"
															class:alt-link={index > 0}
															onclick={(event) => event.stopPropagation()}>{rowTitle(row, index)}</a
														>
													{/each}
													{#if row.errors.length > 0}<span class="warn-icon" title={row.errors.join('\n')}>⚠</span>{/if}
												</span>
											</div>
										</td>
										{#each matrix.gameVersions as gameVersion (gameVersion)}
											{@const options = row.cells.get(gameVersion)}
											<td class:selcol={gameVersion === active}>
												{#if options}
													<div class="cell">
														{#each options as option (option.alternative.slug)}
															<span
																class="side-{option.side}"
																class:beta={option.version.version_type !== 'release'}
																title={cellTitle(option)}>{SIDE_LABEL[option.side]}</span
															>
														{/each}
													</div>
												{:else}
													<div class="cell none"><span>–</span></div>
												{/if}
											</td>
										{/each}
									</tr>
								{/each}
							</tbody>
						</table>
					</div>
				</div>
				<div class="legend">
					<span><i class="side-client"></i>Client</span>
					<span><i class="side-server"></i>Server</span>
					<span><i class="side-both"></i>Both</span>
					<span><i class="side-unknown"></i>Unknown</span>
					<span><i class="side-client beta"></i>Beta/alpha only</span>
					<span>Click a row to toggle it · click a version to inspect it</span>
				</div>
			{/if}
		</div>

		{#if active}
			<aside class="drawer">
				<div class="head">
					<h3>Minecraft {active}</h3>
					{#if active === best}<span class="badge">Best</span>{/if}
				</div>
				<div class="stat"><span>Supported</span><b>{counts.get(active)} / {enabledCount} enabled</b></div>
				{#if packCounts}
					<div class="stat"><span>Client pack</span><b>{packCounts.client} mods</b></div>
					<div class="stat"><span>Server pack</span><b>{packCounts.server} mods</b></div>
				{/if}

				{#each newerBlockers as group (group.gameVersion)}
					<h4>Blocking {group.gameVersion}</h4>
					{#each group.blockers as blocker (blocker.row.key)}
						{@const project = firstProject(blocker.row)}
						<div class="blocker">
							{#if project?.icon_url}<img class="ico" src={project.icon_url} alt="" />{:else}<span class="ico"></span>{/if}
							<div>
								{rowTitle(blocker.row, 0)}
								<small>{blocker.latestSupported ? `Latest: ${blocker.latestSupported}` : 'Not available for this loader'}</small>
							</div>
						</div>
					{:else}
						<div class="muted small">Nothing blocks it. Toggled-off rows aside, it's fully supported.</div>
					{/each}
				{/each}

				<button class="btn primary wide" onclick={() => (downloadOpen = true)}>Download {active}…</button>
			</aside>
		{/if}
	</div>
{/if}

{#if downloadOpen && matrix && active}
	<DownloadDialog {matrix} gameVersion={active} {disabled} {loader} {name} onclose={() => (downloadOpen = false)} />
{/if}

<style>
	.toolbar {
		display: flex;
		flex-wrap: wrap;
		gap: 8px;
		margin: 18px 0 14px;
	}
	.progress-wrap {
		margin-bottom: 14px;
		font-size: 0.88rem;
	}
	.between {
		justify-content: space-between;
		margin-bottom: 6px;
	}
	.progress {
		height: 8px;
		border-radius: 999px;
		background: var(--raised);
		overflow: hidden;
	}
	.progress i {
		display: block;
		height: 100%;
		background: var(--accent);
		border-radius: 999px;
		transition: width 0.2s;
	}
	.errors {
		margin-bottom: 14px;
	}
	.errors ul {
		margin: 6px 0 0;
		padding-left: 20px;
	}
	.layout {
		display: grid;
		grid-template-columns: 1fr 290px;
		gap: 18px;
		align-items: start;
	}
	.matrix-col {
		min-width: 0;
	}
	.matrix-scroll {
		overflow: auto;
		max-height: calc(100vh - 230px);
	}
	table.matrix {
		border-collapse: separate;
		border-spacing: 0;
	}
	table.matrix th,
	table.matrix td {
		padding: 4px;
		font-size: 0.85rem;
	}
	table.matrix th {
		color: var(--muted);
		font-weight: 600;
		text-align: center;
		position: sticky;
		top: 0;
		background: var(--surface);
		z-index: 2;
		padding: 0;
	}
	.col-btn {
		background: none;
		border: none;
		padding: 6px 4px;
		width: 100%;
		color: inherit;
		font-weight: 600;
		cursor: pointer;
		border-radius: 8px;
		white-space: nowrap;
	}
	.col-btn:hover {
		background: var(--raised);
	}
	th .n {
		display: block;
		font-size: 0.72rem;
		font-weight: 400;
	}
	th.best {
		color: var(--accent);
	}
	th.sel {
		background: var(--raised);
		color: var(--text);
	}
	td.selcol {
		background: var(--raised);
	}
	.name-col {
		text-align: left !important;
		position: sticky;
		left: 0;
		background: var(--surface);
		z-index: 1;
		padding-left: 10px !important;
		padding-right: 12px !important;
	}
	th.name-col {
		z-index: 3;
		padding: 6px 10px;
	}
	tbody tr {
		cursor: pointer;
	}
	tbody tr:hover .name-col {
		background: var(--raised);
	}
	tr.off {
		opacity: 0.35;
	}
	.mod {
		display: flex;
		align-items: center;
		gap: 10px;
	}
	.mod-names {
		white-space: nowrap;
	}
	.mod-names a {
		color: var(--text);
	}
	.mod-names a.alt-link {
		color: var(--muted);
		font-size: 0.82rem;
	}
	.or {
		color: var(--faint);
		font-size: 0.75rem;
		margin: 0 4px;
	}
	.warn-icon {
		color: var(--danger);
		margin-left: 6px;
	}
	.cell {
		display: flex;
		gap: 3px;
		height: 28px;
		min-width: 50px;
	}
	.cell span {
		flex: 1;
		border-radius: 7px;
		display: flex;
		align-items: center;
		justify-content: center;
		font-size: 0.72rem;
		font-weight: 700;
		color: #fff;
	}
	.beta {
		background-image: repeating-linear-gradient(135deg, rgba(255, 255, 255, 0.22) 0 4px, transparent 4px 8px);
	}
	.cell.none span {
		border: 1px dashed var(--line);
		color: var(--line);
	}
	.legend {
		display: flex;
		flex-wrap: wrap;
		gap: 14px;
		margin-top: 12px;
		color: var(--muted);
		font-size: 0.82rem;
	}
	.legend i {
		display: inline-block;
		width: 12px;
		height: 12px;
		border-radius: 4px;
		margin-right: 6px;
		vertical-align: -1px;
	}
	.drawer {
		background: var(--surface);
		border-radius: 16px;
		padding: 18px;
		position: sticky;
		top: 16px;
	}
	.drawer h3 {
		margin: 0;
		font-size: 1.15rem;
	}
	.drawer h4 {
		margin: 18px 0 8px;
		font-size: 0.75rem;
		text-transform: uppercase;
		letter-spacing: 0.06em;
		color: var(--muted);
	}
	.stat {
		display: flex;
		justify-content: space-between;
		padding: 8px 0;
		border-bottom: 1px solid var(--line);
		font-size: 0.9rem;
	}
	.blocker {
		display: flex;
		gap: 10px;
		align-items: center;
		padding: 8px 10px;
		border-radius: 10px;
		background: var(--bg);
		margin-bottom: 6px;
		font-size: 0.88rem;
	}
	.blocker small {
		display: block;
		color: var(--muted);
		font-size: 0.78rem;
	}
	.small {
		font-size: 0.85rem;
	}
	.wide {
		width: 100%;
		margin-top: 16px;
	}
	@media (max-width: 1100px) {
		.layout {
			grid-template-columns: 1fr;
		}
		.drawer {
			position: static;
		}
	}
</style>
