<script lang="ts">
	import { enhance } from '$app/forms';
	import { replaceState } from '$app/navigation';
	import { page } from '$app/state';
	import { untrack } from 'svelte';
	import {
		bestGameVersion,
		blockersFor,
		buildMatrix,
		countSupport,
		GameVersionInfo,
		type CellOption,
		type Channel,
		type Matrix,
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
		/** Remembers row toggles and download picks per list in this browser. */
		storageKey: string;
		/** Used in zip file names. */
		name: string;
		/** The list's target game version; the matrix opens on it. */
		target?: string | null;
		/** Shows "Set as target", which posts to the page's ?/target action. */
		canSetTarget?: boolean;
	}

	let { entries, settings, storageKey, name, target = null, canSetTarget = false }: Props = $props();

	const LOADER_NAMES: Record<Loader, string> = { fabric: 'Fabric', forge: 'Forge', neoforge: 'NeoForge', quilt: 'Quilt' };
	const CHANNEL_SETS: Record<Channel, Channel[]> = {
		release: ['release'],
		beta: ['release', 'beta'],
		alpha: ['release', 'beta', 'alpha']
	};

	// View options start from the URL (so a link opens the same view), then the list's settings.
	const params = untrack(() => page.url.searchParams);
	const initialLoader = params.get('loader');
	let loader = $state<Loader>(
		LOADERS.includes(initialLoader as Loader) ? (initialLoader as Loader) : untrack(() => settings.loader)
	);
	let includeSnapshots = $state(params.has('snapshots') ? params.get('snapshots') === '1' : untrack(() => settings.includeSnapshots));
	let channel = $state<Channel>((['release', 'beta', 'alpha'] as const).find((c) => c === params.get('channel')) ?? 'alpha');
	let fromVersion = $state(params.get('from') ?? '');
	let countOptional = $state(params.get('optional') === '1');
	let selected = $state<string | null>(params.get('v'));
	let filter = $state('');
	let sort = $state<'list' | 'name' | 'missing'>('list');
	let disabled = $state(new Set(untrack(() => loadLocal<string[]>(`disabled:${storageKey}`, []))));

	let data = $state<Map<string, ProjectData> | null>(null);
	let tags = $state<GameVersionInfo>(new GameVersionInfo([]));
	let progress = $state<LoadProgress | null>(null);
	let downloadOpen = $state(false);
	let loadId = 0;

	$effect(() => {
		saveLocal(`disabled:${storageKey}`, [...disabled]);
	});

	// Keep the URL in step with the view, without adding history entries.
	$effect(() => {
		const url = new URL(window.location.href);
		const set = (key: string, value: string | null) => (value === null ? url.searchParams.delete(key) : url.searchParams.set(key, value));
		set('loader', loader === settings.loader ? null : loader);
		set('snapshots', includeSnapshots === settings.includeSnapshots ? null : includeSnapshots ? '1' : '0');
		set('channel', channel === 'alpha' ? null : channel);
		set('from', fromVersion || null);
		set('optional', countOptional ? '1' : null);
		set('v', selected);
		if (url.href !== window.location.href) {
			try {
				replaceState(url, page.state);
			} catch {
				// Router not ready yet on the very first run; the next change syncs it.
			}
		}
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

	const fullMatrix = $derived(
		data ? buildMatrix(entries, data, { loader, includeSnapshots, channels: CHANNEL_SETS[channel] }, tags) : null
	);
	// The "from" filter only hides older columns; rows and cells stay the same.
	const matrix = $derived.by((): Matrix | null => {
		if (!fullMatrix) return null;
		const cut = fromVersion ? fullMatrix.gameVersions.indexOf(fromVersion) : -1;
		return cut === -1 ? fullMatrix : { ...fullMatrix, gameVersions: fullMatrix.gameVersions.slice(0, cut + 1) };
	});

	const hasOptional = $derived(entries.some((entry) => entry.optional));
	// Rows left out of counts: toggled off, optional ones unless they're being counted, and
	// rows where nothing could be loaded (they're listed in the error box instead).
	const excluded = $derived.by(() => {
		const set = new Set(disabled);
		for (const row of matrix?.rows ?? []) {
			if ((!countOptional && row.entry.optional) || row.projects.every((project) => !project)) set.add(row.key);
		}
		return set;
	});
	const counts = $derived(matrix ? countSupport(matrix, excluded) : new Map<string, number>());
	const best = $derived(matrix ? bestGameVersion(matrix, counts) : null);
	const maxCount = $derived(Math.max(0, ...counts.values()));
	const countedRows = $derived(matrix?.rows.filter((row) => !excluded.has(row.key)).length ?? 0);
	const active = $derived(selected && matrix?.gameVersions.includes(selected) ? selected : target && matrix?.gameVersions.includes(target) ? target : best);
	const failedRows = $derived(matrix?.rows.filter((row) => row.errors.length > 0) ?? []);

	// Shown on the dashboard card for this list.
	$effect(() => {
		if (best && matrix) saveLocal(`best:${storageKey}`, { version: best, count: counts.get(best), total: countedRows });
	});

	const visibleRows = $derived.by(() => {
		if (!matrix) return [];
		const query = filter.trim().toLowerCase();
		let rows = matrix.rows.filter(
			(row) =>
				!query ||
				row.entry.alternatives.some((alt, i) => alt.slug.toLowerCase().includes(query) || row.projects[i]?.title.toLowerCase().includes(query)) ||
				row.entry.note?.toLowerCase().includes(query)
		);
		if (sort === 'name') rows = [...rows].sort((a, b) => rowTitle(a, 0).localeCompare(rowTitle(b, 0)));
		if (sort === 'missing' && active) rows = [...rows].sort((a, b) => Number(a.cells.has(active)) - Number(b.cells.has(active)));
		return rows;
	});

	/** Rows grouped under their section headings (only in list order). */
	const rowGroups = $derived.by(() => {
		if (sort !== 'list' || !entries.some((entry) => entry.section)) return [{ section: null as string | null, rows: visibleRows }];
		const groups: { section: string | null; rows: MatrixRow[] }[] = [];
		for (const row of visibleRows) {
			const section = row.entry.section ?? null;
			let group = groups.find((candidate) => candidate.section === section);
			if (!group) groups.push((group = { section, rows: [] }));
			group.rows.push(row);
		}
		return groups;
	});

	const newerBlockers = $derived.by(() => {
		if (!matrix || !active) return [];
		const index = matrix.gameVersions.indexOf(active);
		return matrix.gameVersions
			.slice(Math.max(0, index - 2), index)
			.reverse()
			.map((gameVersion) => ({ gameVersion, blockers: blockersFor(matrix, gameVersion, excluded) }));
	});

	const missingOptional = $derived(
		matrix && active && !countOptional ? matrix.rows.filter((row) => row.entry.optional && !disabled.has(row.key) && !row.cells.has(active)) : []
	);

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
	<span class="sep"></span>
	<select class="select sm" bind:value={channel} title="Which mod versions count">
		<option value="release">Releases only</option>
		<option value="beta">Release + beta</option>
		<option value="alpha">Release + beta + alpha</option>
	</select>
	<button class="chip" class:on={includeSnapshots} onclick={() => (includeSnapshots = !includeSnapshots)}>
		Snapshots {includeSnapshots ? 'on' : 'off'}
	</button>
	{#if fullMatrix && fullMatrix.gameVersions.length > 1}
		<select class="select sm" bind:value={fromVersion} title="Hide older Minecraft versions">
			<option value="">All versions</option>
			{#each fullMatrix.gameVersions as gameVersion (gameVersion)}<option value={gameVersion}>From {gameVersion}</option>{/each}
		</select>
	{/if}
	{#if hasOptional}
		<button class="chip" class:on={countOptional} onclick={() => (countOptional = !countOptional)} title="Optional mods don't count towards the best version unless this is on">
			Count optional
		</button>
	{/if}
	<button class="chip" onclick={() => load(true)} disabled={progress !== null} title="Ignore the cache and fetch fresh data">↻ Refresh</button>
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
	<div class="card empty">This list is empty. Add some mods to see the matrix.</div>
{:else if matrix}
	<div class="layout">
		<div class="matrix-col">
			{#if matrix.gameVersions.length === 0}
				<div class="card empty">No {LOADER_NAMES[loader]} versions found for these mods with the current filters.</div>
			{:else}
				<div class="row table-tools">
					<input class="input filter" type="search" placeholder="Filter mods" bind:value={filter} />
					<select class="select sm" bind:value={sort}>
						<option value="list">List order</option>
						<option value="name">Name</option>
						<option value="missing">Missing for {active ?? 'selected'} first</option>
					</select>
				</div>

				<div class="card tight desktop-only">
					<div class="matrix-scroll">
						<table class="matrix">
							<thead>
								<tr>
									<th class="name-col">Mod <span class="muted">· {countedRows} counted</span></th>
									{#each matrix.gameVersions as gameVersion (gameVersion)}
										<th class:best={counts.get(gameVersion) === maxCount && maxCount > 0} class:sel={gameVersion === active}>
											<button class="col-btn" onclick={() => (selected = gameVersion)}>
												{gameVersion}{#if gameVersion === target}<span class="target" title="Target version">◎</span>{/if}
												<span class="n">{counts.get(gameVersion)}</span>
											</button>
										</th>
									{/each}
								</tr>
							</thead>
							{#each rowGroups as group (group.section ?? '')}
								<tbody>
									{#if group.section}
										<tr class="section-row"><td class="name-col section-cell" colspan={matrix.gameVersions.length + 1}>{group.section}</td></tr>
									{/if}
									{#each group.rows as row (row.key)}
										{@const project = firstProject(row)}
										<tr class:off={disabled.has(row.key)} class:optional={row.entry.optional && !countOptional} onclick={() => toggleRow(row)} title="Click to toggle">
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
														{#if row.entry.optional}<span class="badge grey tiny">optional</span>{/if}
														{#if row.entry.note}<span class="note-icon" title={row.entry.note}>✎</span>{/if}
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
							{/each}
						</table>
					</div>
				</div>

				<!-- Phones: one version at a time instead of the wide grid. -->
				<div class="mobile-only">
					<select class="select" value={active ?? ''} onchange={(event) => (selected = event.currentTarget.value)}>
						{#each matrix.gameVersions as gameVersion (gameVersion)}
							<option value={gameVersion}>{gameVersion} · {counts.get(gameVersion)} / {countedRows}{gameVersion === best ? ' · best' : ''}</option>
						{/each}
					</select>
					<div class="mobile-list card">
						{#each visibleRows as row (row.key)}
							{@const options = active ? row.cells.get(active) : undefined}
							<button class="mobile-row" class:off={disabled.has(row.key)} onclick={() => toggleRow(row)}>
								<span class="status" class:yes={options}>{options ? '✓' : '✗'}</span>
								<span class="grow">{rowTitle(row, 0)}{#if row.entry.optional}<span class="muted"> · optional</span>{/if}</span>
								{#each options ?? [] as option (option.alternative.slug)}<span class="side-pill side-{option.side}">{SIDE_LABEL[option.side]}</span>{/each}
							</button>
						{/each}
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
					<div class="row">
						{#if active === target}<span class="badge blue">Target</span>{/if}
						{#if active === best}<span class="badge">Best</span>{/if}
					</div>
				</div>
				<div class="stat"><span>Supported</span><b>{counts.get(active)} / {countedRows}</b></div>
				{#if packCounts}
					<div class="stat"><span>Client pack</span><b>{packCounts.client} mods</b></div>
					<div class="stat"><span>Server pack</span><b>{packCounts.server} mods</b></div>
				{/if}

				{#if active !== best && best}
					{@const missing = blockersFor(matrix, active, excluded)}
					{#if missing.length > 0}
						<h4>Missing for {active}</h4>
						{#each missing as blocker (blocker.row.key)}
							<div class="blocker">
								{#if firstProject(blocker.row)?.icon_url}<img class="ico" src={firstProject(blocker.row)?.icon_url} alt="" />{:else}<span class="ico"></span>{/if}
								<div>{rowTitle(blocker.row, 0)}<small>{blocker.latestSupported ? `Latest: ${blocker.latestSupported}` : 'Not available for this loader'}</small></div>
							</div>
						{/each}
					{/if}
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
						<div class="muted small">Nothing blocks it.</div>
					{/each}
				{/each}

				{#if missingOptional.length > 0}
					<h4>Optional, missing here</h4>
					<div class="muted small">{missingOptional.map((row) => rowTitle(row, 0)).join(', ')}</div>
				{/if}

				<button class="btn primary wide" onclick={() => (downloadOpen = true)}>Download {active}…</button>
				{#if canSetTarget}
					<form method="POST" action="?/target" use:enhance={() => async ({ update }) => update({ reset: false, invalidateAll: true })}>
						<input type="hidden" name="target" value={active === target ? '' : active} />
						<button class="btn ghost sm wide">{active === target ? 'Clear target version' : `Make ${active} the list's target`}</button>
					</form>
				{/if}
			</aside>
		{/if}
	</div>
{/if}

{#if downloadOpen && matrix && active}
	<DownloadDialog {matrix} gameVersion={active} {disabled} {loader} {name} {storageKey} onclose={() => (downloadOpen = false)} />
{/if}

<style>
	.toolbar {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		gap: 8px;
		margin: 18px 0 14px;
	}
	.sep {
		width: 1px;
		height: 22px;
		background: var(--line);
		margin: 0 4px;
	}
	.select.sm {
		padding: 6px 10px;
		font-size: 0.85rem;
		border-radius: 999px;
		background: var(--surface);
		border-color: transparent;
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
	.table-tools {
		margin-bottom: 10px;
	}
	.filter {
		max-width: 260px;
		padding: 7px 12px;
	}
	.matrix-scroll {
		overflow: auto;
		max-height: calc(100vh - 260px);
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
	.target {
		color: var(--blue-text);
		margin-left: 3px;
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
	.section-row td.section-cell {
		color: var(--muted);
		font-size: 0.72rem;
		text-transform: uppercase;
		letter-spacing: 0.06em;
		font-weight: 600;
		padding-top: 12px !important;
	}
	tbody tr {
		cursor: pointer;
	}
	tbody tr:not(.section-row):hover .name-col {
		background: var(--raised);
	}
	tr.off {
		opacity: 0.35;
	}
	tr.optional {
		opacity: 0.7;
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
	.badge.tiny {
		font-size: 0.68rem;
		padding: 0 6px;
		margin-left: 6px;
	}
	.note-icon {
		color: var(--muted);
		margin-left: 6px;
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
		max-height: calc(100vh - 32px);
		overflow-y: auto;
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
		margin-top: 12px;
	}
	.mobile-only {
		display: none;
	}
	.mobile-list {
		margin-top: 10px;
		padding: 4px;
	}
	.mobile-row {
		display: flex;
		align-items: center;
		gap: 10px;
		width: 100%;
		padding: 10px;
		background: none;
		border: none;
		border-bottom: 1px solid var(--line);
		text-align: left;
		cursor: pointer;
	}
	.mobile-row:last-child {
		border-bottom: none;
	}
	.mobile-row.off {
		opacity: 0.35;
	}
	.status {
		width: 18px;
		color: var(--danger);
		font-weight: 700;
	}
	.status.yes {
		color: var(--accent);
	}
	.grow {
		flex: 1;
	}
	@media (max-width: 1100px) {
		.layout {
			grid-template-columns: 1fr;
		}
		.drawer {
			position: static;
			max-height: none;
		}
	}
	@media (max-width: 700px) {
		.desktop-only {
			display: none;
		}
		.mobile-only {
			display: block;
		}
	}
</style>
