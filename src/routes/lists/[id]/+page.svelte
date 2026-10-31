<script lang="ts">
	import { page } from '$app/state';
	import FollowBanner from '#lib/components/FollowBanner.svelte';
	import MatrixView from '#lib/components/MatrixView.svelte';
	import ShareDialog from '#lib/components/ShareDialog.svelte';
	import type { Loader } from '#lib/core/types.ts';
	import type { PageProps } from './$types';

	let { data, form }: PageProps = $props();

	let shareOpen = $state(false);

	const LOADER_NAMES: Record<string, string> = { fabric: 'Fabric', forge: 'Forge', neoforge: 'NeoForge', quilt: 'Quilt' };
	const VISIBILITY: Record<string, { label: string; className: string }> = {
		private: { label: 'Private', className: 'grey' },
		shared: { label: 'Shared', className: 'blue' },
		public: { label: 'Public', className: '' }
	};

	const signedIn = $derived(Boolean(page.data.user));
	const isOwner = $derived(data.access === 'own');
	const visibility = $derived(VISIBILITY[data.list.visibility]);
	const sharedCount = $derived(data.sharing?.shares.length ?? 0);

	function timeAgo(date: Date) {
		const minutes = Math.round((Date.now() - date.getTime()) / 60_000);
		if (minutes < 1) return 'just now';
		if (minutes < 60) return `${minutes} min ago`;
		const hours = Math.round(minutes / 60);
		if (hours < 24) return `${hours} h ago`;
		return date.toLocaleDateString();
	}

	function confirmDelete(event: SubmitEvent) {
		const followers = data.followers.length
			? `\n\n${data.followers.length} list(s) follow this one (${data.followers.map((f) => f.name).join(', ')}). They'll keep their current mods as normal lists.`
			: '';
		if (!confirm(`Delete "${data.list.name}"? This removes its whole history and can't be undone.${followers}`)) {
			event.preventDefault();
		}
	}

	// Rebuild the matrix whenever the mods it shows change, including base list updates.
	const matrixKey = $derived(
		`${data.list.id}:${data.list.loader}:${data.list.includeSnapshots}:${JSON.stringify(data.content.entries)}`
	);
</script>

<svelte:head><title>{data.list.name} · Modlist Matrix</title></svelte:head>

<div class="page">
	<div class="head">
		<div>
			<h1>
				{data.list.name}
				<span class="badge {visibility.className}">
					{visibility.label}{data.list.visibility === 'shared' && sharedCount ? ` · ${sharedCount}` : ''}
				</span>
			</h1>
			<div class="sub">
				{#if !isOwner && data.owner}
					by <a href="/u/{data.owner.handle}">@{data.owner.handle}</a> ·
				{/if}
				{LOADER_NAMES[data.list.loader] ?? data.list.loader} · {data.content.entries.length} entries · edited
				{data.lastEditor ? `by @${data.lastEditor} ` : ''}{timeAgo(data.list.updatedAt)}
				{#if data.followers.length > 0}· followed by {data.followers.map((f) => f.name).join(', ')}{/if}
			</div>
			{#if data.list.description}<p class="description">{data.list.description}</p>{/if}
		</div>
		<div class="row">
			<a class="btn" href="/lists/{data.list.id}/history">History</a>
			<a class="btn" href="/lists/{data.list.id}/export" download>Export .txt</a>
			{#if signedIn}
				<a class="btn" href="/lists/new?base={data.list.id}" title="Make a list that follows this one, with your own changes">Follow</a>
				<form method="POST" action="?/fork">
					<button class="btn" title="Make your own independent copy">{isOwner ? 'Duplicate' : 'Make a copy'}</button>
				</form>
			{/if}
			{#if isOwner}<button class="btn" onclick={() => (shareOpen = true)}>Share</button>{/if}
			{#if data.access !== 'view'}<a class="btn primary" href="/lists/{data.list.id}/edit">Edit list</a>{/if}
			{#if isOwner}
				<form method="POST" action="?/delete" onsubmit={confirmDelete}>
					<button class="btn ghost" title="Delete list">Delete</button>
				</form>
			{/if}
		</div>
	</div>

	{#if data.follow}
		<FollowBanner follow={data.follow} canEdit={data.access !== 'view'} isOwner={isOwner} />
	{/if}

	{#key matrixKey}
		<MatrixView
			entries={data.content.entries}
			settings={{ loader: data.list.loader as Loader, includeSnapshots: data.list.includeSnapshots }}
			storageKey={data.list.id}
			name={data.list.name}
			target={data.list.targetGameVersion}
			canSetTarget={data.access !== 'view'}
		/>
	{/key}
</div>

{#if shareOpen && data.sharing}
	<ShareDialog
		name={data.list.name}
		visibility={data.list.visibility}
		shares={data.sharing.shares}
		handles={data.sharing.handles}
		url={data.sharing.url}
		error={form && 'shareError' in form ? (form.shareError ?? null) : null}
		onclose={() => (shareOpen = false)}
	/>
{/if}

<style>
	.description {
		color: var(--muted);
		margin: 8px 0 0;
		max-width: 680px;
		font-size: 0.92rem;
	}
</style>
