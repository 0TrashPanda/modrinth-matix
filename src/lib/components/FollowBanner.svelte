<script lang="ts">
	import { enhance } from '$app/forms';
	import type { DiffLine } from '#lib/core/diff.ts';
	import { summarizeDiff } from '#lib/core/diff.ts';
	import type { Entry } from '#lib/core/types.ts';

	interface Props {
		follow: {
			base: { id: string; name: string; currentRevision: number; updatedAt: Date };
			mode: 'auto' | 'manual';
			modeSetting: 'default' | 'auto' | 'manual';
			ownerDefault: 'auto' | 'manual';
			usedRevision: number;
			pending: DiffLine[];
			warnings: string[];
		};
		canEdit: boolean;
		isOwner: boolean;
	}

	let { follow, canEdit, isOwner }: Props = $props();

	let showChanges = $state(false);

	const names = (entry: Entry) => entry.alternatives.map((alt) => alt.slug).join(' or ');
	const manualBehind = $derived(follow.mode === 'manual' && follow.pending.length > 0);

	function confirmStop(event: SubmitEvent) {
		if (!confirm(`Stop following ${follow.base.name}? This list keeps its current mods as a normal list.`)) {
			event.preventDefault();
		}
	}
</script>

<div class="banner" class:waiting={manualBehind}>
	<div class="row top">
		<div class="grow">
			Follows <a href="/lists/{follow.base.id}">{follow.base.name}</a>
			<span class="muted">
				· revision {follow.usedRevision}{follow.usedRevision < follow.base.currentRevision ? ` of ${follow.base.currentRevision}` : ''}
				· {follow.mode === 'auto' ? 'updates automatically' : 'updates when you apply them'}
			</span>
		</div>
		{#if canEdit}
			<form method="POST" action="?/followMode" use:enhance class="row">
				<select class="select sm" name="mode" value={follow.modeSetting} onchange={(event) => event.currentTarget.form?.requestSubmit()}>
					<option value="default">Owner's default ({follow.ownerDefault})</option>
					<option value="auto">Auto update</option>
					<option value="manual">Manual update</option>
				</select>
			</form>
		{/if}
		{#if isOwner}
			<form method="POST" action="?/stopFollowing" use:enhance onsubmit={confirmStop}>
				<button class="btn ghost sm">Stop following</button>
			</form>
		{/if}
	</div>

	{#if follow.pending.length > 0}
		<div class="row pending">
			<span class="grow">
				{#if follow.mode === 'manual'}
					<strong>{follow.base.name} has changed:</strong> {summarizeDiff(follow.pending)}. Not applied yet.
				{:else}
					<strong>{follow.base.name} changed since you last looked:</strong> {summarizeDiff(follow.pending)}.
				{/if}
				<button class="link" onclick={() => (showChanges = !showChanges)}>{showChanges ? 'Hide' : 'Show'} changes</button>
			</span>
			{#if canEdit}
				<form method="POST" action="?/acknowledge" use:enhance>
					<button class="btn sm" class:primary={follow.mode === 'manual'}>
						{follow.mode === 'manual' ? 'Apply update' : 'Dismiss'}
					</button>
				</form>
			{/if}
		</div>
		{#if showChanges}
			<ul class="changes">
				{#each follow.pending as line, index (index)}
					{#if line.kind === 'added'}<li class="add">+ {names(line.entry)}</li>
					{:else if line.kind === 'removed'}<li class="del">− {names(line.entry)}</li>
					{:else if line.kind === 'changed'}<li class="mod">~ {names(line.after)}</li>
					{:else if line.kind === 'removal-added'}<li class="del">− {line.removal.slug} (removed further up)</li>
					{:else}<li class="add">+ {line.removal.slug} (no longer removed further up)</li>{/if}
				{/each}
			</ul>
		{/if}
	{/if}

	{#if follow.warnings.length > 0}
		<ul class="warnings">
			{#each follow.warnings as warning (warning)}<li>{warning}</li>{/each}
		</ul>
	{/if}
</div>

<style>
	.banner {
		margin-top: 16px;
		padding: 12px 16px;
		border-radius: 14px;
		background: var(--surface);
		font-size: 0.9rem;
		box-shadow: inset 3px 0 0 var(--blue-text);
	}
	.banner.waiting {
		box-shadow: inset 3px 0 0 var(--warn);
	}
	.top {
		flex-wrap: wrap;
	}
	.grow {
		flex: 1;
		min-width: 220px;
	}
	.select.sm {
		padding: 5px 8px;
		font-size: 0.85rem;
	}
	.pending {
		margin-top: 10px;
		padding-top: 10px;
		border-top: 1px solid var(--line);
	}
	.link {
		background: none;
		border: none;
		color: var(--accent);
		cursor: pointer;
		padding: 0;
		margin-left: 6px;
	}
	.changes {
		list-style: none;
		margin: 8px 0 0;
		padding: 0;
		display: flex;
		flex-wrap: wrap;
		gap: 6px;
	}
	.changes li {
		padding: 2px 10px;
		border-radius: 999px;
		font-size: 0.82rem;
	}
	.add {
		background: var(--accent-soft);
		color: var(--accent);
	}
	.del {
		background: var(--danger-soft);
		color: var(--danger);
	}
	.mod {
		background: var(--warn-soft);
		color: var(--warn);
	}
	.warnings {
		margin: 10px 0 0;
		padding-left: 20px;
		color: var(--warn);
		font-size: 0.85rem;
	}
</style>
