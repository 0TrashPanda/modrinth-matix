<script lang="ts">
	import type { PageProps } from './$types';

	let { data }: PageProps = $props();

	const LOADER_NAMES: Record<string, string> = { fabric: 'Fabric', forge: 'Forge', neoforge: 'NeoForge', quilt: 'Quilt' };
	const formatDate = (date: Date) => date.toLocaleDateString(undefined, { day: 'numeric', month: 'short' });
</script>

<svelte:head><title>@{data.profile.handle} · Modlist Matrix</title></svelte:head>

<div class="page">
	<div class="row who">
		{#if data.profile.avatarUrl}<img class="avatar big" src={data.profile.avatarUrl} alt="" referrerpolicy="no-referrer" />{/if}
		<div>
			<h1>{data.profile.displayName}</h1>
			<div class="sub">@{data.profile.handle} · {data.lists.length} public list{data.lists.length === 1 ? '' : 's'}</div>
		</div>
	</div>

	<div class="grid">
		{#each data.lists as list (list.id)}
			<a class="lcard" href="/lists/{list.id}">
				<h3>{list.name}</h3>
				{#if list.description}<p class="muted">{list.description}</p>{/if}
				<div class="meta">
					<span>{LOADER_NAMES[list.loader] ?? list.loader} · {list.entryCount} entries</span>
					<span>{formatDate(list.updatedAt)}</span>
				</div>
			</a>
		{:else}
			<div class="empty">No public lists.</div>
		{/each}
	</div>
</div>

<style>
	.who {
		gap: 14px;
		margin-bottom: 24px;
	}
	.avatar.big {
		width: 56px;
		height: 56px;
	}
	.grid {
		display: grid;
		grid-template-columns: repeat(auto-fill, minmax(260px, 1fr));
		gap: 14px;
	}
	.lcard {
		background: var(--surface);
		border-radius: 16px;
		padding: 16px;
		display: flex;
		flex-direction: column;
		gap: 8px;
		color: var(--text);
		border: 2px solid transparent;
	}
	.lcard:hover {
		text-decoration: none;
		border-color: var(--line);
	}
	h3 {
		margin: 0;
		font-size: 1.02rem;
	}
	p {
		margin: 0;
		font-size: 0.85rem;
	}
	.meta {
		margin-top: auto;
		display: flex;
		justify-content: space-between;
		font-size: 0.84rem;
		color: var(--muted);
	}
</style>
