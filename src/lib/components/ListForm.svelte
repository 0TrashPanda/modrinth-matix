<script lang="ts">
	import { applyOverrides } from '#lib/core/overrides.ts';
	import { parseText } from '#lib/core/text-format.ts';
	import { LOADERS, type ListContent } from '#lib/core/types.ts';
	import type { Snippet } from 'svelte';

	interface Props {
		name: string;
		description: string;
		loader: string;
		includeSnapshots: boolean;
		text: string;
		/** When this list follows another: that list's mods, used for the preview. */
		base?: { name: string; content: ListContent } | null;
		/** Extra settings rendered under the defaults, e.g. the base list picker. */
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

	const parsed = $derived(parseText(text));
	const preview = $derived(base ? applyOverrides(base.content, parsed.content) : null);
	const removalsWithoutBase = $derived(!base && (parsed.content.removals?.length ?? 0) > 0);

	async function importFile(event: Event & { currentTarget: HTMLInputElement }) {
		const file = event.currentTarget.files?.[0];
		if (!file) return;
		const imported = await file.text();
		text = text.trim() ? `${text.trimEnd()}\n${imported}` : imported;
		event.currentTarget.value = '';
	}

	const plainPlaceholder =
		"One Modrinth URL per line. Separate alternatives with commas.\n\nhttps://modrinth.com/mod/sodium\nhttps://modrinth.com/mod/distanthorizons, https://modrinth.com/mod/bobby\nhttps://modrinth.com/mod/chunky [s]     <- fallback side if Modrinth doesn't know\nhttps://modrinth.com/mod/example [!c]   <- force client side";
	const followPlaceholder =
		'Changes on top of the base list:\n\nhttps://modrinth.com/mod/axiom              <- add a mod\n- https://modrinth.com/mod/crawl            <- remove a base mod\nhttps://modrinth.com/mod/chunky [!c]       <- base mod: change its side\nhttps://modrinth.com/mod/sodium, https://modrinth.com/mod/embeddium   <- add an alternative';
</script>

<div class="grid">
	<div class="settings">
		<label class="field"><span>Name</span><input class="input" name="name" bind:value={name} required maxlength="80" /></label>
		<label class="field">
			<span>Description <span class="muted">(optional)</span></span>
			<textarea class="input" name="description" rows="3" maxlength="500" bind:value={description}></textarea>
		</label>
		<label class="field">
			<span>Default loader</span>
			<select class="select" name="loader" bind:value={loader}>
				{#each LOADERS as option (option)}<option value={option}>{LOADER_NAMES[option]}</option>{/each}
			</select>
		</label>
		<label class="check-label"><input type="checkbox" name="includeSnapshots" bind:checked={includeSnapshots} /> Include snapshots by default</label>
		{@render extra?.()}
	</div>

	<div class="mods">
		<div class="row between">
			<span class="label">{base ? `Changes to ${base.name}` : 'Mods'}</span>
			<label class="btn sm file-btn">
				Import .txt file
				<input type="file" accept=".txt,text/plain" onchange={importFile} />
			</label>
		</div>
		<textarea
			class="textarea"
			name="text"
			rows="18"
			spellcheck="false"
			bind:value={text}
			placeholder={base ? followPlaceholder : plainPlaceholder}
		></textarea>
		<div class="parse-info">
			{#if preview && base}
				<span class="muted">
					{preview.content.entries.length} entries in total: {base.content.entries.length} from {base.name},
					{parsed.content.entries.length} added or changed, {parsed.content.removals?.length ?? 0} removed
				</span>
			{:else}
				<span class="muted">{parsed.content.entries.length} entries</span>
			{/if}
			{#if parsed.warnings.length > 0 || preview?.warnings.length || removalsWithoutBase}
				<ul class="warnings">
					{#each parsed.warnings as warning, index (index)}<li>Line {warning.line}: {warning.message}</li>{/each}
					{#each preview?.warnings ?? [] as warning (warning)}<li>{warning}</li>{/each}
					{#if removalsWithoutBase}<li>Lines starting with "-" only work in a list that follows another list.</li>{/if}
				</ul>
			{/if}
		</div>
	</div>
</div>

<style>
	.grid {
		display: grid;
		grid-template-columns: 300px 1fr;
		gap: 24px;
		margin-top: 18px;
	}
	.settings .select {
		width: 100%;
	}
	.label {
		font-size: 0.85rem;
		font-weight: 600;
	}
	.between {
		justify-content: space-between;
		margin-bottom: 6px;
	}
	.file-btn input {
		display: none;
	}
	.parse-info {
		margin-top: 8px;
		font-size: 0.85rem;
	}
	.warnings {
		margin: 6px 0 0;
		padding-left: 20px;
		color: var(--warn);
	}
	@media (max-width: 800px) {
		.grid {
			grid-template-columns: 1fr;
		}
	}
</style>
