<script lang="ts">
	import { goto } from '$app/navigation';
	import { onMount } from 'svelte';
	import { loadLocal, saveLocal } from '#lib/client/storage.ts';
	import MatrixView from '#lib/components/MatrixView.svelte';
	import { parseText } from '#lib/core/text-format.ts';
	import type { Entry, Loader } from '#lib/core/types.ts';
	import type { PageProps } from './$types';

	let { data }: PageProps = $props();

	let text = $state('');
	let loader = $state<Loader>('fabric');
	let includeSnapshots = $state(false);
	let entries = $state<Entry[] | null>(null);
	let generation = $state(0);

	const parsed = $derived(parseText(text));

	onMount(() => {
		const draft = loadLocal<{ text: string; loader: Loader; includeSnapshots: boolean } | null>('draft:scratch', null);
		if (draft) ({ text, loader, includeSnapshots } = draft);
	});

	$effect(() => {
		saveLocal('draft:scratch', { text, loader, includeSnapshots });
	});

	function generate() {
		entries = parsed.content.entries;
		generation++;
	}

	function saveAsList() {
		saveLocal('handoff:new-list', { text, loader, includeSnapshots });
		goto('/lists/new');
	}
</script>

<svelte:head><title>Scratch matrix · Modlist Matrix</title></svelte:head>

<div class="page">
	<div class="head">
		<div>
			<h1>Scratch matrix</h1>
			<div class="sub">Not saved to an account. Your text is kept in this browser only.</div>
		</div>
		{#if data.user}
			<button class="btn" onclick={saveAsList} disabled={parsed.content.entries.length === 0}>Save as list</button>
		{/if}
	</div>

	<textarea
		class="textarea"
		rows="8"
		spellcheck="false"
		bind:value={text}
		placeholder={'Paste Modrinth project URLs, one per line. Separate alternatives with commas.\nhttps://modrinth.com/mod/sodium\nhttps://modrinth.com/mod/distanthorizons, https://modrinth.com/mod/bobby'}
	></textarea>

	<div class="row controls">
		<select class="select" bind:value={loader}>
			<option value="fabric">Fabric</option>
			<option value="forge">Forge</option>
			<option value="neoforge">NeoForge</option>
			<option value="quilt">Quilt</option>
		</select>
		<label class="check-label"><input type="checkbox" bind:checked={includeSnapshots} /> Include snapshots</label>
		<button class="btn primary" onclick={generate} disabled={parsed.content.entries.length === 0}>Generate matrix</button>
		<span class="muted">{parsed.content.entries.length} entries</span>
	</div>
	{#if parsed.warnings.length > 0}
		<ul class="warnings">
			{#each parsed.warnings as warning, index (index)}<li>Line {warning.line}: {warning.message}</li>{/each}
		</ul>
	{/if}

	{#if entries}
		{#key generation}
			<MatrixView {entries} settings={{ loader, includeSnapshots }} storageKey="scratch" name="modlist" />
		{/key}
	{/if}
</div>

<style>
	.textarea {
		margin-top: 18px;
	}
	.controls {
		margin-top: 10px;
	}
	.warnings {
		margin: 10px 0 0;
		padding-left: 20px;
		color: var(--warn);
		font-size: 0.85rem;
	}
</style>
