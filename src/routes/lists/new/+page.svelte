<script lang="ts">
	import { enhance } from '$app/forms';
	import { onMount, untrack } from 'svelte';
	import { loadLocal, removeLocal } from '#lib/client/storage.ts';
	import ListForm from '#lib/components/ListForm.svelte';
	import type { PageProps } from './$types';

	let { data, form }: PageProps = $props();

	let name = $state('');
	let description = $state('');
	let loader = $state('fabric');
	let includeSnapshots = $state(false);
	let text = $state('');
	let baseListId = $state(untrack(() => (data.bases.some((b) => b.id === data.preselectedBase) ? data.preselectedBase! : '')));

	const base = $derived(data.bases.find((candidate) => candidate.id === baseListId) ?? null);

	function useBaseSettings() {
		if (!base) return;
		loader = base.loader;
		includeSnapshots = base.includeSnapshots;
	}

	onMount(() => {
		useBaseSettings();
		// "Save as list" on the scratch matrix hands its text over through localStorage.
		const handoff = loadLocal<{ text: string; loader: string; includeSnapshots: boolean } | null>('handoff:new-list', null);
		if (handoff) {
			text = handoff.text;
			loader = handoff.loader;
			includeSnapshots = handoff.includeSnapshots;
			removeLocal('handoff:new-list');
		}
	});
</script>

<svelte:head><title>New list · Modlist Matrix</title></svelte:head>

<form class="page" method="POST" use:enhance>
	<div class="head">
		<div>
			<h1>New list</h1>
			<div class="sub">
				{base ? `Follows ${base.name}: only your changes are stored, the rest comes from the base list.` : 'Paste URLs or import your old text file. Lists are private.'}
			</div>
		</div>
		<div class="row">
			<a class="btn" href="/">Cancel</a>
			<button class="btn primary">Create list</button>
		</div>
	</div>
	{#if form?.error}<div class="alert error" style="margin-top:14px">{form.error}</div>{/if}
	<ListForm bind:name bind:description bind:loader bind:includeSnapshots bind:text base={base}>
		{#snippet extra()}
			{#if data.bases.length > 0}
				<label class="field follow">
					<span>Follow another list <span class="muted">(optional)</span></span>
					<select class="select" name="baseListId" bind:value={baseListId} onchange={useBaseSettings}>
						<option value="">No, start from scratch</option>
						{#each data.bases as candidate (candidate.id)}<option value={candidate.id}>{candidate.name}</option>{/each}
					</select>
				</label>
			{/if}
		{/snippet}
	</ListForm>
</form>

<style>
	.follow {
		margin-top: 18px;
	}
	.follow .select {
		width: 100%;
	}
</style>
