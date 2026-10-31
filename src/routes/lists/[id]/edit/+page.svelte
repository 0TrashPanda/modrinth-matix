<script lang="ts">
	import { enhance } from '$app/forms';
	import { onMount, untrack } from 'svelte';
	import { loadLocal, removeLocal, saveLocal } from '#lib/client/storage.ts';
	import ListForm from '#lib/components/ListForm.svelte';
	import type { PageProps } from './$types';

	let { data, form }: PageProps = $props();

	const initial = untrack(() => ({ ...data.list, text: data.text }));
	let name = $state(initial.name);
	let description = $state(initial.description);
	let loader = $state(initial.loader);
	let includeSnapshots = $state(initial.includeSnapshots);
	let text = $state(initial.text);
	let message = $state('');
	let saving = $state(false);

	interface Draft {
		name: string;
		description: string;
		loader: string;
		includeSnapshots: boolean;
		text: string;
	}

	// Drafts are tied to the revision they started from, so a stale draft never overwrites newer work silently.
	const draftKey = `draft:${initial.id}:${initial.currentRevision}`;
	let pendingDraft = $state<Draft | null>(null);
	let ready = false;

	const current = $derived<Draft>({ name, description, loader, includeSnapshots, text });
	const dirty = $derived(
		name !== initial.name ||
			description !== initial.description ||
			loader !== initial.loader ||
			includeSnapshots !== initial.includeSnapshots ||
			text !== initial.text
	);

	onMount(() => {
		const draft = loadLocal<Draft | null>(draftKey, null);
		if (draft && JSON.stringify(draft) !== JSON.stringify(untrack(() => current))) pendingDraft = draft;
		ready = true;
	});

	$effect(() => {
		const snapshot = current;
		if (!ready || pendingDraft) return;
		const timer = setTimeout(() => {
			if (dirty) saveLocal(draftKey, snapshot);
			else removeLocal(draftKey);
		}, 500);
		return () => clearTimeout(timer);
	});

	function restoreDraft() {
		if (!pendingDraft) return;
		({ name, description, loader, includeSnapshots, text } = pendingDraft);
		pendingDraft = null;
	}

	function discardDraft() {
		removeLocal(draftKey);
		pendingDraft = null;
	}

	function onSubmit(event: KeyboardEvent) {
		if ((event.ctrlKey || event.metaKey) && event.key === 's') {
			event.preventDefault();
			document.querySelector<HTMLFormElement>('form.page')?.requestSubmit();
		}
	}
</script>

<svelte:head><title>Editing {initial.name} · Modlist Matrix</title></svelte:head>
<svelte:window onkeydown={onSubmit} />

<form
	class="page"
	method="POST"
	use:enhance={() => {
		saving = true;
		return async ({ result, update }) => {
			if (result.type === 'redirect') removeLocal(draftKey);
			saving = false;
			await update({ reset: false });
		};
	}}
>
	<input type="hidden" name="baseRevision" value={initial.currentRevision} />
	<div class="head">
		<div>
			<h1>Editing {initial.name}</h1>
			<div class="sub">
				{dirty ? 'Unsaved changes · draft kept in this browser' : 'No changes'} · Ctrl+S to save
			</div>
		</div>
		<div class="row">
			<a class="btn" href="/lists/{initial.id}">Cancel</a>
			<button class="btn primary" disabled={saving}>{saving ? 'Saving…' : 'Save'}</button>
		</div>
	</div>

	{#if pendingDraft}
		<div class="alert info row draft">
			<span>You have an unsaved draft of this list from an earlier visit.</span>
			<button type="button" class="btn sm" onclick={restoreDraft}>Restore draft</button>
			<button type="button" class="btn sm ghost" onclick={discardDraft}>Discard</button>
		</div>
	{/if}
	{#if form?.error}<div class="alert error draft">{form.error}</div>{/if}

	<ListForm bind:name bind:description bind:loader bind:includeSnapshots bind:text base={data.base} />

	<label class="field message">
		<span>What changed? <span class="muted">(optional, shown in history)</span></span>
		<input class="input" name="message" bind:value={message} maxlength="200" placeholder="e.g. Swapped OptiFine for Iris" />
	</label>
</form>

<style>
	.draft {
		margin-top: 14px;
	}
	.message {
		margin-top: 18px;
		max-width: 600px;
	}
</style>
