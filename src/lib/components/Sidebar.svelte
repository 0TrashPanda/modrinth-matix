<script lang="ts">
	import { page } from '$app/state';
	import { onMount } from 'svelte';
	import type { SessionUser } from '#lib/server/auth.ts';

	interface SidebarList {
		id: string;
		name: string;
		entryCount: number;
	}

	let { user, lists }: { user: SessionUser; lists: { own: SidebarList[]; shared: SidebarList[] } } = $props();

	let open = $state(false);
	let theme = $state<'system' | 'dark' | 'light'>('system');

	onMount(() => {
		try {
			theme = (localStorage.getItem('theme') as typeof theme) ?? 'system';
		} catch {
			// Storage blocked; stay on the system theme.
		}
		applyTheme();
	});

	function applyTheme() {
		if (theme === 'system') document.documentElement.removeAttribute('data-theme');
		else document.documentElement.dataset.theme = theme;
	}

	function cycleTheme() {
		theme = theme === 'system' ? 'dark' : theme === 'dark' ? 'light' : 'system';
		try {
			localStorage.setItem('theme', theme);
		} catch {
			// Not remembered, but still applied for this visit.
		}
		applyTheme();
	}

	const isActive = (href: string) =>
		page.url.pathname === href || (href !== '/' && page.url.pathname.startsWith(`${href}/`));
</script>

<button class="menu-toggle btn sm" onclick={() => (open = !open)} aria-expanded={open}>☰ Menu</button>

<aside class="sidebar" class:open>
	<a class="brand" href="/"><i></i> Modlist Matrix</a>

	<nav>
		<a class="nav-item" class:on={isActive('/')} href="/">Dashboard</a>
		<a class="nav-item" class:on={isActive('/try')} href="/try">Scratch matrix</a>

		<div class="nav-label">My lists</div>
		{#each lists.own as list (list.id)}
			<a class="nav-item" class:on={isActive(`/lists/${list.id}`)} href="/lists/{list.id}">
				<span class="name">{list.name}</span><small>{list.entryCount}</small>
			</a>
		{:else}
			<div class="nav-empty">No lists yet</div>
		{/each}
		<a class="new-btn" href="/lists/new">+ New list</a>

		{#if lists.shared.length > 0}
			<div class="nav-label">Shared with me</div>
			{#each lists.shared as list (list.id)}
				<a class="nav-item" class:on={isActive(`/lists/${list.id}`)} href="/lists/{list.id}">
					<span class="name">{list.name}</span><small>{list.entryCount}</small>
				</a>
			{/each}
		{/if}

		<div class="nav-label">Account</div>
		<a class="nav-item" class:on={isActive('/settings')} href="/settings">Settings</a>
		{#if user.role === 'admin'}
			<a class="nav-item" class:on={isActive('/admin')} href="/admin">Admin</a>
		{/if}
	</nav>

	<div class="foot">
		{#if user.avatarUrl}
			<img class="avatar" src={user.avatarUrl} alt="" referrerpolicy="no-referrer" />
		{:else}
			<span class="avatar"></span>
		{/if}
		<div class="who">
			{user.displayName}<small>@{user.handle}</small>
		</div>
		<button class="btn ghost sm" onclick={cycleTheme} title="Theme: {theme}">
			{theme === 'system' ? '◐' : theme === 'dark' ? '☾' : '☀'}
		</button>
		<form method="POST" action="/logout">
			<button class="btn ghost sm" title="Sign out">⎋</button>
		</form>
	</div>
</aside>

<style>
	.sidebar {
		background: var(--side);
		border-right: 1px solid var(--line);
		padding: 18px 14px;
		display: flex;
		flex-direction: column;
		position: sticky;
		top: 0;
		height: 100vh;
		overflow-y: auto;
	}
	.brand {
		display: flex;
		align-items: center;
		gap: 10px;
		font-weight: 700;
		font-size: 1.05rem;
		margin-bottom: 18px;
		color: var(--text);
	}
	.brand:hover {
		text-decoration: none;
	}
	.brand i {
		width: 28px;
		height: 28px;
		border-radius: 8px;
		background: var(--accent);
		display: inline-block;
	}
	.nav-label {
		color: var(--muted);
		font-size: 0.72rem;
		text-transform: uppercase;
		letter-spacing: 0.06em;
		margin: 18px 8px 6px;
	}
	.nav-item {
		display: flex;
		justify-content: space-between;
		align-items: center;
		gap: 8px;
		padding: 7px 10px;
		border-radius: 10px;
		font-size: 0.92rem;
		color: var(--text);
	}
	.nav-item:hover {
		background: var(--surface);
		text-decoration: none;
	}
	.nav-item .name {
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}
	.nav-item small {
		color: var(--muted);
	}
	.nav-item.on {
		background: var(--raised);
		box-shadow: inset 3px 0 0 var(--accent);
	}
	.nav-empty {
		padding: 4px 10px;
		color: var(--faint);
		font-size: 0.85rem;
	}
	.new-btn {
		display: block;
		margin-top: 10px;
		padding: 7px;
		border-radius: 10px;
		border: 1px dashed var(--line);
		color: var(--muted);
		text-align: center;
		font-size: 0.9rem;
	}
	.new-btn:hover {
		color: var(--text);
		text-decoration: none;
		border-color: var(--muted);
	}
	.foot {
		margin-top: auto;
		padding-top: 16px;
		border-top: 1px solid var(--line);
		display: flex;
		align-items: center;
		gap: 8px;
		font-size: 0.88rem;
	}
	.foot .avatar {
		width: 30px;
		height: 30px;
	}
	.who {
		flex: 1;
		min-width: 0;
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}
	.who small {
		display: block;
		color: var(--muted);
	}
	.menu-toggle {
		display: none;
	}
	@media (max-width: 900px) {
		.menu-toggle {
			display: inline-flex;
			margin: 12px 16px 0;
			width: fit-content;
		}
		.sidebar {
			display: none;
			height: auto;
			position: static;
		}
		.sidebar.open {
			display: flex;
		}
	}
</style>
