<script lang="ts">
	import type { PageProps } from './$types';

	let { data }: PageProps = $props();

	const formatDate = (date: Date) => date.toLocaleDateString(undefined, { day: 'numeric', month: 'short' });
</script>

<svelte:head><title>Invite · Modlist Matrix</title></svelte:head>

<div class="auth">
	<div class="auth-card">
		{#if !data.valid}
			<h1>Invite not valid</h1>
			<p>{data.problem}</p>
			<a class="btn" href="/">Go to the home page</a>
		{:else if data.user}
			<h1>You're already a member</h1>
			<p>You're signed in as @{data.user.handle}, so you don't need this invite.</p>
			<a class="btn primary" href="/">Open dashboard</a>
		{:else}
			{#if data.inviter}
				<div class="inviter">
					{#if data.inviter.avatarUrl}
						<img class="avatar" src={data.inviter.avatarUrl} alt="" referrerpolicy="no-referrer" />
					{/if}
					<span class="muted">{data.inviter.displayName} invited you</span>
				</div>
			{/if}
			<h1>Join Modlist Matrix</h1>
			<p>Save modlists, share them with friends, and find the best Minecraft version for your pack.</p>
			<a class="google" href="/login/google"><span class="g"></span> Continue with Google</a>
			<div class="caption">
				{#if data.expiresAt}Valid until {formatDate(data.expiresAt)} ·{/if}
				{data.usesLeft} use{data.usesLeft === 1 ? '' : 's'} left
				{#if data.lockedEmail}· for {data.lockedEmail}{/if}
			</div>
		{/if}
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
	.inviter {
		display: flex;
		align-items: center;
		justify-content: center;
		gap: 8px;
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
	.caption {
		color: var(--faint);
		font-size: 0.8rem;
	}
</style>
