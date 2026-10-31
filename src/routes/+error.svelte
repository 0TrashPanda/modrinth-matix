<script lang="ts">
	import { page } from '$app/state';
</script>

<svelte:head><title>{page.status} · Modlist Matrix</title></svelte:head>

<div class="page error-page">
	<h1>{page.status}</h1>
	<p class="muted">{page.error?.message ?? 'Something went wrong'}</p>
	<a class="btn" href="/">Go home</a>
</div>

<style>
	.error-page {
		text-align: center;
		margin-top: 12vh;
	}
	p {
		margin: 10px 0 20px;
	}
</style>
