<script lang="ts">
	import { enhance } from '$app/forms';
	import type { PageProps } from './$types';

	let { data, form }: PageProps = $props();
</script>

<svelte:head><title>Settings · Modlist Matrix</title></svelte:head>

<div class="page">
	<h1>Settings</h1>

	<form class="card section" method="POST" use:enhance>
		<h2>Lists that follow another list</h2>
		<p class="muted">
			What happens when a base list changes. Each list can override this from its own page.
		</p>
		<label class="option">
			<input type="radio" name="followMode" value="auto" checked={data.followMode === 'auto'} />
			<div>
				<b>Update automatically</b>
				<span class="muted">Changes to the base list show up right away. The list page tells you what changed.</span>
			</div>
		</label>
		<label class="option">
			<input type="radio" name="followMode" value="manual" checked={data.followMode === 'manual'} />
			<div>
				<b>Wait for me to apply updates</b>
				<span class="muted">The list stays as it is until you click "Apply update" on its page.</span>
			</div>
		</label>
		<div class="row">
			<button class="btn primary">Save</button>
			{#if form?.saved}<span class="muted">Saved ✓</span>{/if}
		</div>
	</form>
</div>

<style>
	.section {
		margin-top: 18px;
		max-width: 640px;
	}
	.section p {
		margin: 0 0 14px;
		font-size: 0.9rem;
	}
	.option {
		display: flex;
		gap: 12px;
		align-items: flex-start;
		padding: 12px;
		border-radius: 12px;
		background: var(--bg);
		margin-bottom: 8px;
		cursor: pointer;
	}
	.option input {
		margin-top: 4px;
	}
	.option span {
		display: block;
		font-size: 0.85rem;
	}
</style>
