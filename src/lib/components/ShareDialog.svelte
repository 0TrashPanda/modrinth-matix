<script lang="ts">
	import { enhance } from '$app/forms';

	interface Share {
		userId: string;
		handle: string;
		displayName: string;
		avatarUrl: string | null;
		role: 'viewer' | 'editor';
	}

	interface Props {
		name: string;
		visibility: 'private' | 'shared' | 'public';
		shares: Share[];
		handles: string[];
		url: string;
		error: string | null;
		onclose: () => void;
	}

	let { name, visibility, shares, handles, url, error, onclose }: Props = $props();

	let dialog: HTMLDialogElement;
	let handle = $state('');
	let role = $state<'viewer' | 'editor'>('viewer');
	let copied = $state(false);

	$effect(() => {
		dialog.showModal();
	});

	const OPTIONS = [
		{ value: 'private', title: 'Private', text: 'Only you' },
		{ value: 'shared', title: 'Shared', text: 'People you add' },
		{ value: 'public', title: 'Public', text: 'Anyone with the link' }
	] as const;

	const available = $derived(handles.filter((h) => !shares.some((share) => share.handle === h)));

	async function copyLink() {
		await navigator.clipboard.writeText(url);
		copied = true;
		setTimeout(() => (copied = false), 1500);
	}
</script>

<dialog bind:this={dialog} onclose={onclose} onclick={(event) => event.target === dialog && dialog.close()}>
	<div class="modal">
		<div class="modal-head">
			<h2>Share "{name}"</h2>
			<button class="btn ghost sm" onclick={() => dialog.close()} aria-label="Close">✕</button>
		</div>

		<div class="modal-body">
			<div class="vis">
				{#each OPTIONS as option (option.value)}
					<form method="POST" action="?/visibility" use:enhance={() => async ({ update }) => update({ reset: false })}>
						<input type="hidden" name="visibility" value={option.value} />
						<button class="vis-card" class:on={visibility === option.value}>
							<b>{option.title}</b><span>{option.text}</span>
						</button>
					</form>
				{/each}
			</div>
			{#if visibility === 'private' && shares.length > 0}
				<p class="muted note">The people below keep their place but can't see the list while it's private.</p>
			{/if}
			{#if visibility === 'public'}
				<p class="muted note">Anyone with the link can view the matrix, download packs and make a copy. Only you and editors can change it.</p>
			{/if}

			<form
				method="POST"
				action="?/share"
				class="add"
				use:enhance={() => async ({ result, update }) => {
					if (result.type === 'success') handle = '';
					await update({ reset: false });
				}}
			>
				<input class="input" name="handle" list="share-handles" placeholder="Add by handle, e.g. sam" bind:value={handle} autocomplete="off" required />
				<datalist id="share-handles">
					{#each available as option (option)}<option value={option}></option>{/each}
				</datalist>
				<select class="select" name="role" bind:value={role}>
					<option value="viewer">Viewer</option>
					<option value="editor">Editor</option>
				</select>
				<button class="btn primary">Add</button>
			</form>
			{#if error}<div class="alert error note">{error}</div>{/if}

			<div class="people">
				{#each shares as share (share.userId)}
					<div class="person">
						{#if share.avatarUrl}<img class="avatar" src={share.avatarUrl} alt="" referrerpolicy="no-referrer" />{:else}<span class="avatar"></span>{/if}
						<div class="grow">{share.displayName}<small>@{share.handle}</small></div>
						<form method="POST" action="?/share" use:enhance={() => async ({ update }) => update({ reset: false })}>
							<input type="hidden" name="handle" value={share.handle} />
							<select class="select sm" name="role" value={share.role} onchange={(event) => event.currentTarget.form?.requestSubmit()}>
								<option value="viewer">Viewer</option>
								<option value="editor">Editor</option>
							</select>
						</form>
						<form method="POST" action="?/unshare" use:enhance={() => async ({ update }) => update({ reset: false })}>
							<input type="hidden" name="userId" value={share.userId} />
							<button class="btn ghost sm" aria-label="Remove {share.handle}">✕</button>
						</form>
					</div>
				{:else}
					<p class="muted note">Not shared with anyone yet.</p>
				{/each}
			</div>
		</div>

		<div class="modal-foot">
			<input class="input" readonly value={url} onfocus={(event) => event.currentTarget.select()} />
			<button class="btn" onclick={copyLink}>{copied ? 'Copied ✓' : 'Copy link'}</button>
		</div>
	</div>
</dialog>

<style>
	dialog {
		border: none;
		padding: 0;
		background: none;
		color: var(--text);
		width: min(560px, calc(100vw - 32px));
	}
	dialog::backdrop {
		background: rgba(0, 0, 0, 0.6);
		backdrop-filter: blur(2px);
	}
	.modal {
		background: var(--side);
		border: 1px solid var(--line);
		border-radius: 18px;
		box-shadow: var(--shadow);
	}
	.modal-head {
		padding: 18px 22px 0;
		display: flex;
		justify-content: space-between;
		align-items: flex-start;
	}
	h2 {
		margin: 0;
		font-size: 1.2rem;
	}
	.modal-body {
		padding: 16px 22px;
	}
	.modal-foot {
		padding: 14px 22px;
		border-top: 1px solid var(--line);
		display: flex;
		gap: 8px;
		background: var(--bg);
		border-radius: 0 0 18px 18px;
	}
	.vis {
		display: grid;
		grid-template-columns: repeat(3, 1fr);
		gap: 8px;
	}
	.vis-card {
		width: 100%;
		text-align: left;
		padding: 12px;
		border-radius: 12px;
		background: var(--surface);
		border: 2px solid transparent;
		font-size: 0.85rem;
		cursor: pointer;
	}
	.vis-card b {
		display: block;
		font-size: 0.95rem;
	}
	.vis-card span {
		color: var(--muted);
	}
	.vis-card.on {
		border-color: var(--accent);
		background: var(--accent-soft);
	}
	.note {
		margin: 10px 0 0;
		font-size: 0.85rem;
	}
	.add {
		display: flex;
		gap: 8px;
		margin-top: 16px;
	}
	.add .input {
		flex: 1;
	}
	.people {
		margin-top: 8px;
	}
	.person {
		display: flex;
		align-items: center;
		gap: 10px;
		padding: 10px 0;
		border-bottom: 1px solid var(--line);
	}
	.person:last-child {
		border-bottom: none;
	}
	.person .avatar {
		width: 32px;
		height: 32px;
	}
	.grow {
		flex: 1;
	}
	.grow small {
		display: block;
		color: var(--muted);
	}
	.select.sm {
		padding: 5px 8px;
		font-size: 0.85rem;
	}
	@media (max-width: 520px) {
		.vis {
			grid-template-columns: 1fr;
		}
	}
</style>
