<script lang="ts">
	import { summarizeDiff } from '#lib/core/diff.ts';
	import { serializeAlternative } from '#lib/core/text-format.ts';
	import type { Entry } from '#lib/core/types.ts';
	import type { PageProps } from './$types';

	let { data, form }: PageProps = $props();

	const formatDate = (date: Date) =>
		date.toLocaleString(undefined, { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });

	const names = (entry: Entry) => entry.alternatives.map((alt) => alt.slug).join(' or ');
	const describe = (entry: Entry) => entry.alternatives.map(serializeAlternative).join(', ');
</script>

<svelte:head><title>History · {data.list.name}</title></svelte:head>

<div class="page">
	<div class="head">
		<div>
			<h1>History · {data.list.name}</h1>
			<div class="sub">{data.revisions.length} revisions</div>
		</div>
		<a class="btn" href="/lists/{data.list.id}">Back to list</a>
	</div>

	<div class="layout">
		<nav class="revs">
			{#each data.revisions as revision (revision.number)}
				<a class="rev" class:on={revision.number === data.selected.number} href="?rev={revision.number}">
					{#if revision.authorAvatar}
						<img class="avatar" src={revision.authorAvatar} alt="" referrerpolicy="no-referrer" />
					{:else}<span class="avatar"></span>{/if}
					<div>
						<b>{revision.author ?? 'deleted user'}</b>
						{revision.message || `saved revision ${revision.number}`}
						<div class="when">
							{formatDate(revision.createdAt)} · #{revision.number}{revision.number === data.list.currentRevision ? ' · current' : ''}
						</div>
					</div>
				</a>
			{/each}
		</nav>

		<section class="card">
			<div class="head diff-head">
				<div>
					<h2>Revision {data.selected.number}</h2>
					<div class="sub">{summarizeDiff(data.diff)} compared with the revision before</div>
				</div>
				{#if data.canEdit && data.selected.number !== data.list.currentRevision}
					<form method="POST" action="?/restore">
						<input type="hidden" name="number" value={data.selected.number} />
						<button class="btn primary sm">Restore this version</button>
					</form>
				{/if}
			</div>
			{#if form?.error}<div class="alert error">{form.error}</div>{/if}

			{#each data.diff as line, index (index)}
				{#if line.kind === 'added'}
					<div class="diff-line add"><span class="sym">+</span>{names(line.entry)}<small>{describe(line.entry)}</small></div>
				{:else if line.kind === 'removed'}
					<div class="diff-line del"><span class="sym">−</span>{names(line.entry)}<small>{describe(line.entry)}</small></div>
				{:else if line.kind === 'changed'}
					<div class="diff-line mod">
						<span class="sym">~</span>{names(line.after)}
						<small>{describe(line.before)} → {describe(line.after)}</small>
					</div>
				{:else if line.kind === 'removal-added'}
					<div class="diff-line del"><span class="sym">−</span>{line.removal.slug}<small>now removed from the base list</small></div>
				{:else}
					<div class="diff-line add"><span class="sym">+</span>{line.removal.slug}<small>no longer removed from the base list</small></div>
				{/if}
			{:else}
				<div class="empty">No mod changes in this revision (settings only).</div>
			{/each}
		</section>
	</div>
</div>

<style>
	.layout {
		display: grid;
		grid-template-columns: 300px 1fr;
		gap: 18px;
		margin-top: 18px;
		align-items: start;
	}
	.revs {
		display: flex;
		flex-direction: column;
		gap: 2px;
	}
	.rev {
		display: flex;
		gap: 12px;
		padding: 12px;
		border-radius: 12px;
		font-size: 0.88rem;
		color: var(--text);
	}
	.rev:hover {
		background: var(--surface);
		text-decoration: none;
	}
	.rev.on {
		background: var(--surface);
		box-shadow: inset 3px 0 0 var(--accent);
	}
	.rev b {
		font-weight: 600;
	}
	.when {
		color: var(--muted);
		font-size: 0.8rem;
	}
	.diff-head {
		margin-bottom: 14px;
	}
	.diff-head h2 {
		margin: 0;
	}
	.diff-line {
		display: flex;
		align-items: baseline;
		flex-wrap: wrap;
		gap: 4px 12px;
		padding: 9px 12px;
		border-radius: 10px;
		margin-bottom: 6px;
		font-size: 0.9rem;
	}
	.diff-line small {
		color: var(--muted);
		font-size: 0.78rem;
		word-break: break-all;
		flex-basis: 100%;
		padding-left: 30px;
	}
	.sym {
		width: 18px;
		font-weight: 800;
		text-align: center;
	}
	.add {
		background: var(--accent-soft);
	}
	.add .sym {
		color: var(--accent);
	}
	.del {
		background: var(--danger-soft);
	}
	.del .sym {
		color: var(--danger);
	}
	.mod {
		background: var(--warn-soft);
	}
	.mod .sym {
		color: var(--warn);
	}
	@media (max-width: 800px) {
		.layout {
			grid-template-columns: 1fr;
		}
	}
</style>
