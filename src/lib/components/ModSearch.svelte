<script lang="ts">
	import { page } from '$app/state';
	import { searchCurseforge, searchProjects, type SearchHit } from '#lib/client/modrinth.ts';
	import { cfProjectUrl } from '#lib/core/curseforge.ts';

	interface Props {
		loader: string;
		inList: (slug: string) => boolean;
		onadd: (hit: SearchHit) => void;
		/** Set when an entry is selected; adds the hit as an alternative to it. */
		onaddAlternative?: ((hit: SearchHit) => void) | null;
		selectedName?: string | null;
	}

	let { loader, inList, onadd, onaddAlternative = null, selectedName = null }: Props = $props();

	const TYPES = [
		{ value: 'mod', label: 'Mods' },
		{ value: 'resourcepack', label: 'Resource packs' },
		{ value: 'shader', label: 'Shaders' },
		{ value: 'datapack', label: 'Datapacks' }
	];

	let query = $state('');
	let source = $state<'modrinth' | 'curseforge'>('modrinth');
	const curseforgeAvailable = $derived(Boolean(page.data.curseforge));
	let projectType = $state('mod');
	let loaderOnly = $state(true);
	let hits = $state<SearchHit[]>([]);
	let searching = $state(false);
	let error = $state<string | null>(null);
	let input: HTMLInputElement;
	let run = 0;

	$effect(() => {
		const q = query.trim();
		const type = projectType;
		const onlyLoader = loaderOnly ? loader : null;
		const from = source;
		if (!q) {
			hits = [];
			return;
		}
		const id = ++run;
		const timer = setTimeout(async () => {
			searching = true;
			error = null;
			try {
				const result = from === 'curseforge' ? await searchCurseforge(q, type, onlyLoader) : await searchProjects(q, type, onlyLoader);
				if (id === run) hits = result;
			} catch (err) {
				if (id === run) error = err instanceof Error ? err.message : 'Search failed';
			} finally {
				if (id === run) searching = false;
			}
		}, 300);
		return () => clearTimeout(timer);
	});

	function onKeydown(event: KeyboardEvent) {
		const target = event.target as HTMLElement;
		if (event.key === '/' && !['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName)) {
			event.preventDefault();
			input.focus();
		}
	}

	const formatDownloads = (n: number) =>
		n >= 1_000_000 ? `${(n / 1_000_000).toFixed(1)}M` : n >= 1000 ? `${Math.round(n / 1000)}k` : String(n);
	const daysAgo = (date: string) => Math.max(0, Math.round((Date.now() - Date.parse(date)) / 86_400_000));
	const supportsLoader = (hit: SearchHit) => hit.project_type !== 'mod' || hit.categories.includes(loader);
</script>

<svelte:window onkeydown={onKeydown} />

<div class="search-panel">
	<input class="input" type="search" placeholder="Search {source === 'curseforge' ? 'CurseForge' : 'Modrinth'}  ( / )" bind:value={query} bind:this={input} />
	{#if curseforgeAvailable}
		<div class="chips">
			<button type="button" class="chip" class:on={source === 'modrinth'} onclick={() => (source = 'modrinth')}>Modrinth</button>
			<button type="button" class="chip" class:on={source === 'curseforge'} onclick={() => (source = 'curseforge')}>CurseForge</button>
		</div>
	{/if}
	<div class="chips">
		{#each TYPES as type (type.value)}
			<button type="button" class="chip" class:on={projectType === type.value} onclick={() => (projectType = type.value)}>{type.label}</button>
		{/each}
	</div>
	{#if projectType === 'mod'}
		<label class="check-label small"><input type="checkbox" bind:checked={loaderOnly} /> Only {loader} mods</label>
	{/if}

	{#if error}<div class="alert error small">{error}</div>{/if}
	{#if searching && hits.length === 0}<div class="muted small">Searching…</div>{/if}

	<div class="results">
		{#each hits as hit (hit.project_id)}
			<div class="result">
				{#if hit.icon_url}<img class="ico lg" src={hit.icon_url} alt="" loading="lazy" />{:else}<span class="ico lg"></span>{/if}
				<div>
					<a
						class="title"
						href={hit.project_id.startsWith('cf:') ? cfProjectUrl(hit.project_type, hit.slug) : `https://modrinth.com/${hit.project_type}/${hit.slug}`}
						target="_blank"
						rel="noopener">{hit.title}</a
					>
					<p>{formatDownloads(hit.downloads)} downloads · updated {daysAgo(hit.date_modified)}d ago</p>
					<div class="row">
						{#if inList(hit.slug)}
							<span class="added">✓ In list</span>
						{:else}
							<button type="button" class="btn sm primary" onclick={() => onadd(hit)}>+ Add</button>
							{#if onaddAlternative && selectedName}
								<button type="button" class="btn sm" onclick={() => onaddAlternative?.(hit)} title="Add as an alternative to {selectedName}">+ as alt</button>
							{/if}
						{/if}
						{#if !supportsLoader(hit)}<span class="badge warn">No {loader}</span>{/if}
					</div>
				</div>
			</div>
		{:else}
			{#if query.trim() && !searching && !error}<div class="muted small">No results.</div>{/if}
		{/each}
	</div>
	{#if onaddAlternative && selectedName}
		<div class="muted small hint">"+ as alt" adds to: <b>{selectedName}</b></div>
	{/if}
</div>

<style>
	.search-panel {
		background: var(--surface);
		border-radius: 16px;
		padding: 14px;
		display: flex;
		flex-direction: column;
		gap: 10px;
	}
	.chips {
		display: flex;
		flex-wrap: wrap;
		gap: 6px;
	}
	.chips .chip {
		background: var(--bg);
		padding: 4px 10px;
		font-size: 0.8rem;
	}
	.chips .chip.on {
		background: var(--accent);
	}
	.small {
		font-size: 0.82rem;
	}
	.results {
		max-height: 520px;
		overflow-y: auto;
	}
	.result {
		display: grid;
		grid-template-columns: 40px 1fr;
		gap: 10px;
		padding: 10px 2px;
		border-bottom: 1px solid var(--line);
	}
	.result:last-child {
		border-bottom: none;
	}
	.ico.lg {
		width: 40px;
		height: 40px;
		border-radius: 10px;
	}
	.title {
		font-weight: 600;
		font-size: 0.92rem;
		color: var(--text);
	}
	.result p {
		margin: 2px 0 6px;
		color: var(--muted);
		font-size: 0.78rem;
	}
	.result .row {
		gap: 6px;
	}
	.added {
		color: var(--accent);
		font-size: 0.82rem;
		font-weight: 600;
	}
</style>
