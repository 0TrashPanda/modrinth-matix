<script lang="ts">
	import { enhance } from '$app/forms';
	import type { PageProps } from './$types';

	let { data, form }: PageProps = $props();
</script>

<svelte:head><title>Sign in · Modlist Matrix</title></svelte:head>

<div class="auth">
	<div class="auth-card">
		{#if data.needsInvite}
			<h1>You need an invite</h1>
			<p>
				{data.deniedEmail ?? 'That Google account'} isn't on this instance yet. Ask a member for an invite link.
			</p>
			<a class="btn" href="/login/google">Use a different account</a>
		{:else}
			<h1>Sign in</h1>
			<p>
				{#if data.hasInvite}
					Your invite is ready. Sign in with Google to create your account.
				{:else}
					Save modlists and share them with friends. New accounts need an invite.
				{/if}
			</p>
			{#if data.error}<div class="alert error">{data.error}</div>{/if}
			{#if data.googleConfigured}
				<a class="google" href="/login/google"><span class="g"></span> Continue with Google</a>
			{:else}
				<div class="alert warn">Google sign-in isn't configured. Set GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET.</div>
			{/if}
		{/if}

		{#if data.devLogin}
			<form method="POST" action="?/dev" use:enhance class="dev">
				<div class="dev-label">Dev only: sign in without Google</div>
				<div class="row">
					<input class="input" name="name" placeholder="Test user name" autocomplete="off" />
					<button class="btn">Sign in</button>
				</div>
				{#if form?.devError}<div class="alert error">{form.devError}</div>{/if}
			</form>
		{/if}

		<div class="caption"><a href="/try">Try the matrix without saving →</a></div>
	</div>
</div>

<style>
	.auth {
		min-height: calc(100vh - 60px);
		display: flex;
		align-items: center;
		justify-content: center;
		padding: 32px 16px;
		background: radial-gradient(800px 400px at 30% 20%, var(--accent-soft), transparent 60%);
	}
	.auth-card {
		width: min(400px, 100%);
		background: var(--surface);
		border-radius: 20px;
		padding: 28px;
		text-align: center;
		display: flex;
		flex-direction: column;
		gap: 14px;
	}
	h1 {
		font-size: 1.4rem;
	}
	p {
		color: var(--muted);
		margin: 0;
		font-size: 0.92rem;
	}
	.google {
		display: flex;
		align-items: center;
		justify-content: center;
		gap: 10px;
		padding: 11px;
		border-radius: 12px;
		background: #fff;
		color: #1f1f1f;
		font-weight: 600;
		border: 1px solid var(--line);
	}
	.google:hover {
		text-decoration: none;
		filter: brightness(0.96);
	}
	.g {
		width: 18px;
		height: 18px;
		border-radius: 50%;
		background: conic-gradient(#ea4335 0 25%, #fbbc05 0 50%, #34a853 0 75%, #4285f4 0);
	}
	.dev {
		border-top: 1px dashed var(--line);
		padding-top: 14px;
		display: flex;
		flex-direction: column;
		gap: 8px;
		text-align: left;
	}
	.dev .row {
		flex-wrap: nowrap;
	}
	.dev-label {
		font-size: 0.78rem;
		color: var(--warn);
	}
	.caption {
		font-size: 0.85rem;
	}
</style>
