<script lang="ts">
	import { onMount } from 'svelte';
	import { loadLocal } from '#lib/client/storage.ts';
	import type { PageProps } from './$types';

	let { data }: PageProps = $props();

	const LOADER_NAMES: Record<string, string> = { fabric: 'Fabric', forge: 'Forge', neoforge: 'NeoForge', quilt: 'Quilt' };
	const firstName = $derived(data.user?.displayName.split(' ')[0] ?? '');
	const formatDate = (date: Date) => date.toLocaleDateString(undefined, { day: 'numeric', month: 'short' });

	// Best version as of the last time each list was opened in this browser.
	let bests = $state<Record<string, { version: string; count: number; total: number }>>({});
	onMount(() => {
		const all = [...(data.lists?.own ?? []), ...(data.lists?.shared ?? [])];
		bests = Object.fromEntries(
			all.flatMap((list) => {
				const best = loadLocal<{ version: string; count: number; total: number } | null>(`best:${list.id}`, null);
				return best ? [[list.id, best]] : [];
			})
		);
	});
</script>

{#if data.user && data.lists}
	<div class="page">
		<div class="head">
			<div>
				<h1>Hey {firstName}</h1>
				<div class="sub">
					{data.lists.own.length} list{data.lists.own.length === 1 ? '' : 's'}{#if data.lists.shared.length > 0}
						· {data.lists.shared.length} shared with you{/if}
				</div>
			</div>
			<a class="btn primary" href="/lists/new">+ New list</a>
		</div>

		<h2 class="section-title">My lists</h2>
		<div class="grid">
			{#each data.lists.own as list (list.id)}
				<a class="lcard" href="/lists/{list.id}">
					<div class="top">
						<h3>{list.name}</h3>
						<span class="badge grey">{list.visibility === 'private' ? 'Private' : list.visibility}</span>
					</div>
					{#if list.follows}<div class="muted small">Follows {list.follows}</div>{/if}
					<div class="meta">
						<span>{LOADER_NAMES[list.loader] ?? list.loader} · {list.entryCount} entries</span>
						{#if bests[list.id]}<span>Best <b>{bests[list.id].version}</b> ({bests[list.id].count}/{bests[list.id].total})</span>{:else}<span>{formatDate(list.updatedAt)}</span>{/if}
					</div>
				</a>
			{/each}
			<a class="lcard new" href="/lists/new">
				+ New list
				<span>or import your old text file</span>
			</a>
		</div>

		{#if data.lists.shared.length > 0}
			<h2 class="section-title">Shared with me</h2>
			<div class="grid">
				{#each data.lists.shared as list (list.id)}
					<a class="lcard" href="/lists/{list.id}">
						<div class="top">
							<h3>{list.name}</h3>
							<span class="badge grey">{list.role === 'editor' ? 'Editor' : 'Viewer'}</span>
						</div>
						<div class="muted small">by @{list.owner}</div>
						<div class="meta">
							<span>{LOADER_NAMES[list.loader] ?? list.loader} · {list.entryCount} entries</span>
							{#if bests[list.id]}<span>Best <b>{bests[list.id].version}</b> ({bests[list.id].count}/{bests[list.id].total})</span>{:else}<span>{formatDate(list.updatedAt)}</span>{/if}
						</div>
					</a>
				{/each}
			</div>
		{/if}
	</div>
{:else}
	<div class="landing">
		<h1>Find the Minecraft version your whole modlist runs on</h1>
		<p>
			Paste Modrinth links, see which versions each mod supports on your loader, and download the client and
			server packs for the best one.
		</p>
		<div class="row center">
			<a class="btn primary" href="/try">Try it without an account</a>
			<a class="btn" href="/login">Sign in to save lists</a>
		</div>
		<p class="small muted">Accounts are invite-only.</p>
	</div>
{/if}

<style>
	.section-title {
		margin: 28px 0 12px;
	}
	.grid {
		display: grid;
		grid-template-columns: repeat(auto-fill, minmax(250px, 1fr));
		gap: 14px;
	}
	.lcard {
		background: var(--surface);
		border-radius: 16px;
		padding: 16px;
		display: flex;
		flex-direction: column;
		gap: 12px;
		color: var(--text);
		min-height: 110px;
		border: 2px solid transparent;
	}
	.lcard:hover {
		text-decoration: none;
		border-color: var(--line);
	}
	.lcard .top {
		display: flex;
		justify-content: space-between;
		align-items: flex-start;
		gap: 8px;
	}
	.lcard .top .badge {
		text-transform: capitalize;
	}
	.lcard h3 {
		margin: 0;
		font-size: 1.02rem;
	}
	.lcard .meta {
		margin-top: auto;
		display: flex;
		justify-content: space-between;
		font-size: 0.84rem;
		color: var(--muted);
	}
	.lcard .meta b {
		color: var(--accent);
	}
	.lcard.new {
		border: 2px dashed var(--line);
		background: none;
		align-items: center;
		justify-content: center;
		color: var(--muted);
		gap: 2px;
	}
	.lcard.new span {
		font-size: 0.8rem;
	}
	.small {
		font-size: 0.84rem;
	}
	.landing {
		max-width: 640px;
		margin: 12vh auto 0;
		padding: 0 16px;
		text-align: center;
	}
	.landing h1 {
		font-size: 2rem;
	}
	.landing p {
		color: var(--muted);
		margin: 14px 0 22px;
	}
	.center {
		justify-content: center;
	}
</style>
