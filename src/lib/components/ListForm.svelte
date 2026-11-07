<script lang="ts">
	import { onMount, type Snippet } from 'svelte';
	import { loadLocal, saveLocal } from '#lib/client/storage.ts';
	import { importFiles } from '#lib/client/importers.ts';
	import type { SearchHit } from '#lib/client/modrinth.ts';
	import { containsSlug } from '#lib/core/edit-ops.ts';
	import { cfProjectUrl } from '#lib/core/curseforge.ts';
	import { applyOverrides } from '#lib/core/overrides.ts';
	import { parseText } from '#lib/core/text-format.ts';
	import { LOADERS, type ListContent } from '#lib/core/types.ts';
	import ModSearch from './ModSearch.svelte';
	import VisualEditor from './VisualEditor.svelte';

	interface Props {
		name: string;
		description: string;
		loader: string;
		includeSnapshots: boolean;
		text: string;
		/** When this list follows another: that list's mods, used for the preview. */
		base?: { name: string; content: ListContent } | null;
		/** Extra settings rendered next to the defaults, e.g. the base list picker. */
		extra?: Snippet;
	}

	let {
		name = $bindable(),
		description = $bindable(),
		loader = $bindable(),
		includeSnapshots = $bindable(),
		text = $bindable(),
		base = null,
		extra
	}: Props = $props();

	const LOADER_NAMES: Record<string, string> = { fabric: 'Fabric', forge: 'Forge', neoforge: 'NeoForge', quilt: 'Quilt' };

	// Following lists are a list of changes, which only the text view can express.
	let preferred = $state<'visual' | 'text'>('visual');
	const mode = $derived(base ? 'text' : preferred);

	onMount(() => {
		preferred = loadLocal<'visual' | 'text'>('editor-mode', 'visual');
	});

	function setMode(next: 'visual' | 'text') {
		preferred = next;
		saveLocal('editor-mode', next);
	}

	const parsed = $derived(parseText(text));
	const preview = $derived(base ? applyOverrides(base.content, parsed.content) : null);
	const removalsWithoutBase = $derived(!base && (parsed.content.removals?.length ?? 0) > 0);
	const hasComments = $derived(/^\s*(#(?!#)|\/\/)/m.test(text));

	let importing = $state(false);
	let importNote = $state<string | null>(null);

	function append(block: string) {
		text = text.trim() ? `${text.trimEnd()}\n\n${block}` : block;
	}

	async function importFile(event: Event & { currentTarget: HTMLInputElement }) {
		const input = event.currentTarget;
		const picked = [...(input.files ?? [])];
		input.value = '';
		if (picked.length === 0) return;
		importing = true;
		importNote = null;
		try {
			const result = await importFiles(picked);
			for (const block of result.text) append(block);
			if (result.lines.length > 0) {
				const source = picked.length === 1 ? picked[0].name : `${picked.length} files`;
				append([`imported from ${source.replace(/:/g, '')}:`, ...result.lines].join('\n'));
			}
			const parts = [];
			if (result.lines.length) parts.push(`${result.lines.length} mods recognised`);
			if (result.unknown.length) parts.push(`not on Modrinth: ${result.unknown.join(', ')}`);
			importNote = parts.join(' · ') || null;
		} catch (error) {
			importNote = error instanceof Error ? `Import failed: ${error.message}` : 'Import failed';
		} finally {
			importing = false;
		}
	}

	function appendFromSearch(hit: SearchHit) {
		const line = hit.project_id.startsWith('cf:') ? cfProjectUrl(hit.project_type, hit.slug) : `https://modrinth.com/${hit.project_type}/${hit.slug}`;
		text = text.trim() ? `${text.trimEnd()}\n${line}` : line;
	}

	const plainPlaceholder =
		"One Modrinth URL per line. Separate alternatives with commas.\n\nperformance mods:                          <- section heading\nhttps://modrinth.com/mod/sodium\nhttps://modrinth.com/mod/distanthorizons, https://modrinth.com/mod/bobby\nhttps://modrinth.com/mod/chunky [s]        <- fallback side if Modrinth doesn't know\nhttps://modrinth.com/mod/example [!c]      <- force client side\nhttps://modrinth.com/mod/fastquit [opt], nice to have   <- optional, with a note";
	const followPlaceholder =
		'Changes on top of the base list:\n\nhttps://modrinth.com/mod/axiom              <- add a mod\n- https://modrinth.com/mod/crawl            <- remove a base mod\nhttps://modrinth.com/mod/chunky [!c]       <- base mod: change its side\nhttps://modrinth.com/mod/sodium, https://modrinth.com/mod/embeddium   <- add an alternative';
</script>

<div class="settings card">
	<label class="field name"><span>Name</span><input class="input" name="name" bind:value={name} required maxlength="80" /></label>
	<label class="field">
		<span>Default loader</span>
		<select class="select" name="loader" bind:value={loader}>
			{#each LOADERS as option (option)}<option value={option}>{LOADER_NAMES[option]}</option>{/each}
		</select>
	</label>
	<label class="check-label snapshots"><input type="checkbox" name="includeSnapshots" bind:checked={includeSnapshots} /> Include snapshots</label>
	{@render extra?.()}
	<label class="field description">
		<span>Description <span class="muted">(optional)</span></span>
		<textarea class="input" name="description" rows="2" maxlength="500" bind:value={description}></textarea>
	</label>
</div>

<div class="mods-head row">
	<div class="tabs">
		<button type="button" class:on={mode === 'visual'} disabled={Boolean(base)} onclick={() => setMode('visual')} title={base ? 'Lists that follow another list are edited as a list of changes' : ''}>Visual</button>
		<button type="button" class:on={mode === 'text'} onclick={() => setMode('text')}>Text</button>
	</div>
	<span class="muted grow">
		{#if preview && base}
			{preview.content.entries.length} entries in total: {base.content.entries.length} from {base.name}, {parsed.content.entries.length} added or changed, {parsed.content.removals?.length ?? 0} removed
		{:else}
			{parsed.content.entries.length} entries
		{/if}
	</span>
	<label class="btn sm file-btn" title="Text lists, .mrpack modpacks, or mod jars (hashed in your browser and looked up on Modrinth)">
		{importing ? 'Importing…' : 'Import files'}
		<input type="file" multiple accept=".txt,.csv,.mrpack,.jar,.zip" onchange={importFile} disabled={importing} />
	</label>
</div>
{#if importNote}<div class="muted import-note">{importNote}</div>{/if}

{#if parsed.warnings.length > 0 || preview?.warnings.length || removalsWithoutBase || (mode === 'visual' && hasComments)}
	<ul class="warnings">
		{#each parsed.warnings as warning, index (index)}<li>Line {warning.line}: {warning.message}</li>{/each}
		{#each preview?.warnings ?? [] as warning (warning)}<li>{warning}</li>{/each}
		{#if removalsWithoutBase}<li>Lines starting with "-" only work in a list that follows another list.</li>{/if}
		{#if mode === 'visual' && hasComments}<li>Comment lines (# …) are dropped once you edit in the visual view.</li>{/if}
	</ul>
{/if}

{#if mode === 'visual'}
	<input type="hidden" name="text" value={text} />
	<VisualEditor bind:text {loader} />
{:else}
	<div class="text-mode">
		<textarea
			class="textarea"
			name="text"
			rows="22"
			spellcheck="false"
			bind:value={text}
			placeholder={base ? followPlaceholder : plainPlaceholder}
		></textarea>
		<ModSearch {loader} inList={(slug) => containsSlug(preview?.content ?? parsed.content, slug)} onadd={appendFromSearch} />
	</div>
{/if}

<style>
	.settings {
		display: grid;
		grid-template-columns: minmax(200px, 2fr) minmax(140px, 1fr) auto minmax(200px, 1.5fr);
		gap: 14px 18px;
		align-items: end;
		margin-top: 18px;
	}
	.settings .field {
		margin: 0;
	}
	.settings .select {
		width: 100%;
	}
	.snapshots {
		padding-bottom: 10px;
	}
	.description {
		grid-column: 1 / -1;
	}
	.mods-head {
		margin: 20px 0 10px;
	}
	.grow {
		flex: 1;
		font-size: 0.85rem;
	}
	.tabs {
		display: flex;
		gap: 4px;
		padding: 4px;
		background: var(--surface);
		border-radius: 12px;
	}
	.tabs button {
		padding: 6px 16px;
		border-radius: 9px;
		font-size: 0.88rem;
		color: var(--muted);
		background: none;
		border: none;
		cursor: pointer;
	}
	.tabs button.on {
		background: var(--raised);
		color: var(--text);
		font-weight: 600;
	}
	.tabs button:disabled {
		opacity: 0.4;
		cursor: not-allowed;
	}
	.file-btn input {
		display: none;
	}
	.import-note {
		margin: -4px 0 10px;
		font-size: 0.85rem;
	}
	.warnings {
		margin: 0 0 12px;
		padding-left: 20px;
		color: var(--warn);
		font-size: 0.85rem;
	}
	.text-mode {
		display: grid;
		grid-template-columns: 1fr 320px;
		gap: 18px;
		align-items: start;
	}
	@media (max-width: 1100px) {
		.settings {
			grid-template-columns: 1fr 1fr;
		}
		.text-mode {
			grid-template-columns: 1fr;
		}
	}
</style>
