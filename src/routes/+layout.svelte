<script lang="ts">
	import '../app.css';
	import favicon from '#lib/assets/favicon.svg';
	import Sidebar from '#lib/components/Sidebar.svelte';
	import type { LayoutProps } from './$types';

	let { children, data }: LayoutProps = $props();
</script>

<svelte:head>
	<link rel="icon" href={favicon} />
	<title>Modlist Matrix</title>
</svelte:head>

{#if data.user && data.sidebar}
	<div class="shell">
		<Sidebar user={data.user} lists={data.sidebar} />
		<main>{@render children()}</main>
	</div>
{:else}
	<header class="topbar">
		<a class="brand" href="/"><i></i> Modlist Matrix</a>
		<a class="btn sm" href="/login">Sign in</a>
	</header>
	<main>{@render children()}</main>
{/if}

<style>
	.shell {
		display: grid;
		grid-template-columns: 240px 1fr;
		min-height: 100vh;
	}
	main {
		min-width: 0;
	}
	.topbar {
		display: flex;
		justify-content: space-between;
		align-items: center;
		padding: 12px 28px;
		border-bottom: 1px solid var(--line);
	}
	.brand {
		display: flex;
		align-items: center;
		gap: 10px;
		font-weight: 700;
		font-size: 1.05rem;
		color: var(--text);
	}
	.brand:hover {
		text-decoration: none;
	}
	.brand i {
		width: 26px;
		height: 26px;
		border-radius: 8px;
		background: var(--accent);
		display: inline-block;
	}
	@media (max-width: 900px) {
		.shell {
			grid-template-columns: 1fr;
		}
	}
</style>
