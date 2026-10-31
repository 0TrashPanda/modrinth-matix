<script lang="ts">
	import { enhance } from '$app/forms';
	import type { PageProps } from './$types';

	let { data, form }: PageProps = $props();

	let copied = $state<string | null>(null);

	const inviteUrl = (code: string) => `${data.origin}/invite/${code}`;
	const formatDate = (date: Date | null) =>
		date ? date.toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' }) : '—';

	async function copy(code: string) {
		await navigator.clipboard.writeText(inviteUrl(code));
		copied = code;
		setTimeout(() => (copied = null), 1500);
	}

	function inviteState(invite: PageProps['data']['invites'][number]) {
		if (invite.revokedAt) return 'Revoked';
		if (invite.uses >= invite.maxUses) return 'Used';
		if (invite.expiresAt && invite.expiresAt.getTime() < Date.now()) return 'Expired';
		return null;
	}

	const activeInvites = $derived(data.invites.filter((invite) => !inviteState(invite)).length);
</script>

<svelte:head><title>Admin · Modlist Matrix</title></svelte:head>

<div class="page">
	<h1>Admin</h1>
	<div class="sub">{data.users.length} users · {activeInvites} active invites</div>

	<section class="card">
		<h2>New invite</h2>
		<form method="POST" action="?/createInvite" use:enhance class="invite-form">
			<label class="field grow"
				><span>Locked to email (optional)</span>
				<input class="input" name="lockedEmail" type="email" placeholder="friend@gmail.com" />
			</label>
			<label class="field"
				><span>Uses</span>
				<input class="input" name="maxUses" type="number" min="1" max="100" value="1" />
			</label>
			<label class="field"
				><span>Expires in</span>
				<select class="select" name="expiresInDays">
					<option value="1">1 day</option>
					<option value="7" selected>7 days</option>
					<option value="30">30 days</option>
					<option value="0">Never</option>
				</select>
			</label>
			<button class="btn primary">Create invite</button>
		</form>
		{#if form?.inviteError}<div class="alert error">{form.inviteError}</div>{/if}
		{#if form?.createdCode}
			<div class="alert info row">
				Invite created: <code>{inviteUrl(form.createdCode)}</code>
				<button class="btn sm" onclick={() => copy(form.createdCode!)}>
					{copied === form.createdCode ? 'Copied ✓' : 'Copy link'}
				</button>
			</div>
		{/if}
	</section>

	<section class="card">
		<h2>Invites</h2>
		{#if data.invites.length === 0}
			<div class="empty">No invites yet.</div>
		{:else}
			<div class="scroll">
				<table class="list">
					<thead>
						<tr><th>Code</th><th>Created by</th><th>Uses</th><th>Expires</th><th>Used by</th><th></th></tr>
					</thead>
					<tbody>
						{#each data.invites as invite (invite.id)}
							{@const state = inviteState(invite)}
							<tr class:off={state}>
								<td>
									<code>{invite.code}</code>
									{#if invite.lockedEmail}<div class="muted small">{invite.lockedEmail}</div>{/if}
								</td>
								<td>{invite.creator ?? '—'}</td>
								<td>{invite.uses} / {invite.maxUses}</td>
								<td>{state ?? (invite.expiresAt ? formatDate(invite.expiresAt) : 'Never')}</td>
								<td>{invite.usedBy.join(', ') || '—'}</td>
								<td class="actions">
									{#if !state}
										<button class="btn sm" onclick={() => copy(invite.code)}>
											{copied === invite.code ? 'Copied ✓' : 'Copy link'}
										</button>
										<form method="POST" action="?/revokeInvite" use:enhance>
											<input type="hidden" name="id" value={invite.id} />
											<button class="btn sm danger">Revoke</button>
										</form>
									{/if}
								</td>
							</tr>
						{/each}
					</tbody>
				</table>
			</div>
		{/if}
	</section>

	<section class="card">
		<h2>Users</h2>
		<div class="scroll">
			<table class="list">
				<thead><tr><th>User</th><th>Email</th><th>Role</th><th>Joined</th><th></th></tr></thead>
				<tbody>
					{#each data.users as user (user.id)}
						<tr class:off={user.disabledAt}>
							<td>
								<div class="row">
									{#if user.avatarUrl}
										<img class="avatar" src={user.avatarUrl} alt="" referrerpolicy="no-referrer" />
									{:else}<span class="avatar"></span>{/if}
									{user.displayName} <span class="muted">@{user.handle}</span>
								</div>
							</td>
							<td class="muted">{user.email}</td>
							<td>
								<span class="badge" class:grey={user.role !== 'admin'}>{user.role === 'admin' ? 'Admin' : 'User'}</span>
								{#if user.disabledAt}<span class="badge danger">Disabled</span>{/if}
							</td>
							<td>{formatDate(user.createdAt)}</td>
							<td class="actions">
								{#if user.role !== 'admin'}
									<form method="POST" action="?/setDisabled" use:enhance>
										<input type="hidden" name="id" value={user.id} />
										<input type="hidden" name="disabled" value={user.disabledAt ? 'false' : 'true'} />
										<button class="btn sm" class:danger={!user.disabledAt}>
											{user.disabledAt ? 'Enable' : 'Disable'}
										</button>
									</form>
								{/if}
							</td>
						</tr>
					{/each}
				</tbody>
			</table>
		</div>
	</section>
</div>

<style>
	section {
		margin-top: 18px;
	}
	.invite-form {
		display: flex;
		flex-wrap: wrap;
		gap: 12px;
		align-items: flex-end;
	}
	.invite-form .field {
		margin: 0;
	}
	.invite-form .grow {
		flex: 1;
		min-width: 200px;
	}
	.invite-form input[type='number'] {
		width: 90px;
	}
	.alert {
		margin-top: 12px;
	}
	.scroll {
		overflow-x: auto;
	}
	.actions {
		display: flex;
		gap: 6px;
		justify-content: flex-end;
	}
	tr.off td {
		opacity: 0.45;
	}
	.small {
		font-size: 0.8rem;
	}
	code {
		font-size: 0.85rem;
	}
</style>
