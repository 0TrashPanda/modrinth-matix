<script lang="ts">
	import { packItems, primaryFile, resolveDependencies, type DependencyResult, type PackItem } from '#lib/core/downloads.ts';
	import type { CellOption, Matrix } from '#lib/core/matrix.ts';
	import { SIDE_LABEL, SIDE_TITLE } from '#lib/core/sides.ts';
	import type { Loader, ModrinthFile, Pack } from '#lib/core/types.ts';
	import { dependencyApi } from '#lib/client/modrinth.ts';
	import { buildZip, formatBytes, saveBlob, type ZipProgress } from '#lib/client/zip.ts';
	import { loadLocal, saveLocal } from '#lib/client/storage.ts';
	import { untrack } from 'svelte';

	interface Props {
		matrix: Matrix;
		gameVersion: string;
		disabled: Set<string>;
		loader: Loader;
		name: string;
		/** Remembers picks per list and game version in this browser. */
		storageKey: string;
		onclose: () => void;
	}

	let { matrix, gameVersion, disabled, loader, name, storageKey, onclose }: Props = $props();

	interface StoredPicks {
		// Row key -> chosen alternative's slug, and row key -> ticked.
		choices: Record<string, string>;
		included: Record<string, boolean>;
	}
	const picksKey = untrack(() => `picks:${storageKey}:${gameVersion}`);
	const stored = loadLocal<Partial<Record<Pack, StoredPicks>>>(picksKey, {});

	let pack = $state<Pack>('client');
	// Per-pack overrides of the defaults, keyed by row key.
	let choices = $state<Record<Pack, Record<string, number>>>({ client: {}, server: {} });
	let included = $state<Record<Pack, Record<string, boolean>>>({
		client: { ...stored.client?.included },
		server: { ...stored.server?.included }
	});

	// Stored choices are slugs, so they survive alternatives being reordered.
	for (const target of ['client', 'server'] as const) {
		for (const item of untrack(() => packItems(matrix, gameVersion, target, disabled))) {
			const slug = stored[target]?.choices[item.row.key];
			const index = item.options.findIndex((option) => option.alternative.slug === slug);
			if (index !== -1) choices[target][item.row.key] = index;
		}
	}

	function rememberPicks() {
		const toStore = (target: Pack): StoredPicks => {
			const picked: Record<string, string> = {};
			for (const item of packItems(matrix, gameVersion, target, disabled)) {
				const index = choices[target][item.row.key];
				if (index !== undefined && item.options[index]) picked[item.row.key] = item.options[index].alternative.slug;
			}
			return { choices: picked, included: { ...included[target] } };
		};
		saveLocal(picksKey, { client: toStore('client'), server: toStore('server') });
	}
	let includeDeps = $state(true);
	let depsIncluded = $state<Record<string, boolean>>({});
	let deps = $state<DependencyResult | null>(null);
	let depsError = $state<string | null>(null);
	let zipProgress = $state<ZipProgress | null>(null);
	let zipError = $state<string | null>(null);
	let dialog: HTMLDialogElement;

	$effect(() => {
		dialog.showModal();
	});

	const items = $derived(packItems(matrix, gameVersion, pack, disabled));
	const otherPackOnly = $derived(items.filter((item) => item.options.length === 0));
	const available = $derived(items.filter((item) => item.options.length > 0));

	function chosen(item: PackItem): CellOption {
		return item.options[choices[pack][item.row.key] ?? item.defaultChoice];
	}
	function isIncluded(item: PackItem): boolean {
		return included[pack][item.row.key] ?? item.defaultIncluded;
	}

	const selectedOptions = $derived(available.filter(isIncluded).map(chosen));
	const selectedKey = $derived(selectedOptions.map((option) => option.version.id).join(','));

	let depsRun = 0;
	$effect(() => {
		const key = selectedKey;
		if (!includeDeps || !key) {
			deps = null;
			return;
		}
		const run = ++depsRun;
		deps = null;
		depsError = null;
		resolveDependencies(
			selectedOptions.map((option) => ({ title: option.project.title, version: option.version })),
			dependencyApi,
			{ loader, gameVersion }
		)
			.then((result) => {
				if (run === depsRun) deps = result;
			})
			.catch((error) => {
				if (run === depsRun) depsError = error instanceof Error ? error.message : 'Failed to resolve dependencies';
			});
	});

	const files = $derived.by(() => {
		const out: ModrinthFile[] = [];
		for (const option of selectedOptions) {
			const file = primaryFile(option.version);
			if (file) out.push(file);
		}
		if (includeDeps && deps) {
			for (const dep of deps.resolved) {
				if (depsIncluded[dep.version.project_id] === false) continue;
				const file = primaryFile(dep.version);
				if (file) out.push(file);
			}
		}
		return out;
	});
	const totalBytes = $derived(files.reduce((sum, file) => sum + file.size, 0));
	const depsPending = $derived(includeDeps && selectedOptions.length > 0 && !deps && !depsError);

	async function downloadZip() {
		rememberPicks();
		zipError = null;
		try {
			const blob = await buildZip(files, (progress) => (zipProgress = progress));
			const safeName = name.replace(/[^a-z0-9._-]+/gi, '-').replace(/^-|-$/g, '') || 'modlist';
			saveBlob(blob, `${safeName}-${gameVersion}-${pack}.zip`);
		} catch (error) {
			zipError = error instanceof Error ? error.message : 'Download failed';
		} finally {
			zipProgress = null;
		}
	}

	function openTabs() {
		rememberPicks();
		for (const file of files) window.open(file.url, '_blank', 'noopener');
	}

	function setChoice(item: PackItem, index: number) {
		choices[pack][item.row.key] = index;
	}
	function setIncluded(item: PackItem, value: boolean) {
		included[pack][item.row.key] = value;
	}
</script>

<dialog bind:this={dialog} onclose={onclose} onclick={(event) => event.target === dialog && dialog.close()}>
	<div class="modal">
		<div class="modal-head">
			<div>
				<h2>Download for Minecraft {gameVersion}</h2>
				<div class="sub">{loader} · {name}</div>
			</div>
			<button class="btn ghost sm" onclick={() => dialog.close()} aria-label="Close">✕</button>
		</div>

		<div class="modal-body">
			<div class="row between">
				<div class="tabs">
					<button class:on={pack === 'client'} onclick={() => (pack = 'client')}>Client pack</button>
					<button class:on={pack === 'server'} onclick={() => (pack = 'server')}>Server pack</button>
				</div>
				<label class="check-label"><input type="checkbox" bind:checked={includeDeps} /> Include required dependencies</label>
			</div>

			<div class="scroll">
				<table class="list">
					<thead><tr><th></th><th>Mod</th><th>File</th><th>Channel</th><th class="num">Size</th></tr></thead>
					<tbody>
						{#each available as item (item.row.key)}
							{@const option = chosen(item)}
							{@const file = primaryFile(option.version)}
							<tr class:off={!isIncluded(item)}>
								<td>
									<input
										type="checkbox"
										checked={isIncluded(item)}
										onchange={(event) => setIncluded(item, event.currentTarget.checked)}
										aria-label="Include {option.project.title}"
									/>
								</td>
								<td>
									<div class="mod">
										{#if option.project.icon_url}<img class="ico" src={option.project.icon_url} alt="" />{:else}<span class="ico"></span>{/if}
										{#if item.options.length > 1}
											<select
												class="select"
												value={choices[pack][item.row.key] ?? item.defaultChoice}
												onchange={(event) => setChoice(item, Number(event.currentTarget.value))}
											>
												{#each item.options as alternative, index (alternative.alternative.slug)}
													<option value={index}>{alternative.project.title}</option>
												{/each}
											</select>
										{:else}
											{option.project.title}
										{/if}
										<span class="side-pill side-{option.side}" title={SIDE_TITLE[option.side]}>{SIDE_LABEL[option.side]}</span>
									</div>
								</td>
								<td class="muted file">{file?.filename ?? 'No file'}</td>
								<td>
									<span class="badge" class:warn={option.version.version_type !== 'release'}>{option.version.version_type}</span>
								</td>
								<td class="num">{file ? formatBytes(file.size) : '—'}</td>
							</tr>
						{/each}

						{#if includeDeps && deps}
							{#each deps.resolved as dep (dep.version.project_id)}
								{@const file = primaryFile(dep.version)}
								<tr class="dep" class:off={depsIncluded[dep.version.project_id] === false}>
									<td>
										<input
											type="checkbox"
											checked={depsIncluded[dep.version.project_id] !== false}
											onchange={(event) => (depsIncluded[dep.version.project_id] = event.currentTarget.checked)}
											aria-label="Include {dep.project?.title}"
										/>
									</td>
									<td>
										<div class="mod">
											<span class="muted">↳</span>
											{#if dep.project?.icon_url}<img class="ico sm" src={dep.project.icon_url} alt="" />{/if}
											{dep.project?.title ?? dep.version.name}
										</div>
									</td>
									<td class="muted file">{file?.filename ?? 'No file'} · needed by {dep.neededBy.join(', ')}</td>
									<td><span class="badge" class:warn={dep.version.version_type !== 'release'}>{dep.version.version_type}</span></td>
									<td class="num">{file ? formatBytes(file.size) : '—'}</td>
								</tr>
							{/each}
						{/if}
					</tbody>
				</table>
			</div>

			{#if depsPending}<div class="muted note">Resolving dependencies…</div>{/if}
			{#if depsError}<div class="alert error note">{depsError}</div>{/if}
			{#if deps && deps.unresolved.length > 0}
				<div class="alert warn note">
					Couldn't find:
					{#each deps.unresolved as missing, index (missing.label)}{index > 0 ? '; ' : ''}{missing.label} (needed by {missing.neededBy.join(', ')}){/each}
				</div>
			{/if}
			{#if available.some((item) => item.options.some((option) => option.side === 'unknown'))}
				<div class="muted note">Mods with an unknown side are listed in both packs but not ticked. Tick the ones you need.</div>
			{/if}
			{#if otherPackOnly.length > 0}
				<div class="muted note">
					Not in the {pack} pack: {otherPackOnly.map((item) => `${item.allOptions[0].project.title} (${item.allOptions[0].side} only)`).join(', ')}
				</div>
			{/if}

			{#if zipProgress}
				<div class="note">
					<div class="row between">
						<span>Downloading {zipProgress.done} / {zipProgress.total} · checking hashes</span>
						<span class="muted">{formatBytes(zipProgress.bytes)} / {formatBytes(totalBytes)}</span>
					</div>
					<div class="progress"><i style:width="{(zipProgress.done / Math.max(1, zipProgress.total)) * 100}%"></i></div>
				</div>
			{/if}
			{#if zipError}<div class="alert error note">{zipError}</div>{/if}
		</div>

		<div class="modal-foot">
			<span class="muted">{files.length} files · {formatBytes(totalBytes)}</span>
			<div class="row">
				<button class="btn" onclick={openTabs} disabled={files.length === 0 || depsPending} title="Your browser may block all but the first tab">
					Open as tabs
				</button>
				<button class="btn primary" onclick={downloadZip} disabled={files.length === 0 || depsPending || zipProgress !== null}>
					{zipProgress ? 'Downloading…' : `Download ${pack}.zip`}
				</button>
			</div>
		</div>
	</div>
</dialog>

<style>
	dialog {
		border: none;
		padding: 0;
		background: none;
		color: var(--text);
		width: min(860px, calc(100vw - 32px));
		max-height: calc(100vh - 64px);
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
		display: flex;
		flex-direction: column;
		max-height: calc(100vh - 64px);
	}
	.modal-head {
		padding: 18px 22px 0;
		display: flex;
		justify-content: space-between;
		align-items: flex-start;
	}
	h2 {
		margin: 0;
		font-size: 1.25rem;
	}
	.sub {
		text-transform: none;
	}
	.modal-body {
		padding: 16px 22px;
		overflow-y: auto;
	}
	.modal-foot {
		padding: 14px 22px;
		border-top: 1px solid var(--line);
		display: flex;
		justify-content: space-between;
		align-items: center;
		gap: 10px;
		flex-wrap: wrap;
		background: var(--bg);
		border-radius: 0 0 18px 18px;
	}
	.between {
		justify-content: space-between;
	}
	.tabs {
		display: flex;
		gap: 4px;
		padding: 4px;
		background: var(--bg);
		border-radius: 12px;
	}
	.tabs button {
		padding: 6px 16px;
		border-radius: 9px;
		font-size: 0.88rem;
		color: var(--muted);
		background: none;
		border: none;
		cursor: pointer;
	}
	.tabs button.on {
		background: var(--raised);
		color: var(--text);
		font-weight: 600;
	}
	.scroll {
		overflow-x: auto;
		margin-top: 12px;
	}
	.mod {
		display: flex;
		align-items: center;
		gap: 10px;
		white-space: nowrap;
	}
	.ico.sm {
		width: 20px;
		height: 20px;
	}
	.file {
		font-size: 0.82rem;
		word-break: break-all;
	}
	.num {
		text-align: right;
		white-space: nowrap;
	}
	tr.off td {
		opacity: 0.4;
	}
	tr.dep td:nth-child(2) {
		padding-left: 22px;
	}
	.note {
		margin-top: 12px;
		font-size: 0.85rem;
	}
	.progress {
		height: 8px;
		border-radius: 999px;
		background: var(--raised);
		overflow: hidden;
		margin-top: 6px;
	}
	.progress i {
		display: block;
		height: 100%;
		background: var(--accent);
	}
</style>
