<script lang="ts">
	import { packItems, primaryFile, resolveDependencies, type DependencyResult, type PackItem } from '#lib/core/downloads.ts';
	import type { CellOption, Matrix } from '#lib/core/matrix.ts';
	import { SIDE_LABEL, SIDE_TITLE } from '#lib/core/sides.ts';
	import { buildMrpackIndex, downloadScript, folderFor, type MrpackEntry } from '#lib/core/mrpack.ts';
	import { cfProjectUrl } from '#lib/core/curseforge.ts';
	import type { Loader, ModrinthFile, ModrinthVersion, Pack } from '#lib/core/types.ts';
	import { dependencyApi } from '#lib/client/modrinth.ts';
	import { buildZip, formatBytes, saveBlob, textZip, type ZipProgress } from '#lib/client/zip.ts';
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

	function chosen(item: PackItem, target: Pack = pack): CellOption {
		return item.options[choices[target][item.row.key] ?? item.defaultChoice];
	}
	function isIncluded(item: PackItem, target: Pack = pack): boolean {
		return included[target][item.row.key] ?? item.defaultIncluded;
	}

	const selectedOptions = $derived(available.filter((item) => isIncluded(item)).map((item) => chosen(item)));
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

	interface PackPart {
		file: ModrinthFile;
		path: string;
		projectId: string;
		versionId: string;
		projectType: string;
	}

	function part(version: ModrinthVersion, projectType: string): PackPart | null {
		const file = primaryFile(version);
		// No URL: a CurseForge author disabled third-party downloads (listed under "manual" instead).
		if (!file?.url) return null;
		return { file, path: `${folderFor(projectType)}/${file.filename}`, projectId: version.project_id, versionId: version.id, projectType };
	}

	const parts = $derived.by(() => {
		const out: PackPart[] = [];
		for (const option of selectedOptions) {
			const item = part(option.version, option.project.project_type);
			if (item) out.push(item);
		}
		if (includeDeps && deps) {
			for (const dep of deps.resolved) {
				if (depsIncluded[dep.version.project_id] === false) continue;
				const item = part(dep.version, dep.project?.project_type ?? 'mod');
				if (item) out.push(item);
			}
		}
		return out;
	});
	const files = $derived(parts.map(({ file, path }) => ({ file, path })));

	/** Selected files that have to be downloaded by hand from CurseForge. */
	const manual = $derived.by(() => {
		const out: { title: string; url: string }[] = [];
		const add = (title: string, version: ModrinthVersion, slug: string, projectType: string) => {
			if (primaryFile(version)?.url) return;
			out.push({ title, url: `${cfProjectUrl(projectType, slug)}/files/${version.id.replace(/^cf:/, '')}` });
		};
		for (const option of selectedOptions) add(option.project.title, option.version, option.project.slug, option.project.project_type);
		for (const dep of includeDeps && deps ? deps.resolved : []) {
			if (dep.project && depsIncluded[dep.version.project_id] !== false) add(dep.project.title, dep.version, dep.project.slug, dep.project.project_type);
		}
		return out;
	});
	const totalBytes = $derived(parts.reduce((sum, item) => sum + item.file.size, 0));
	const depsPending = $derived(includeDeps && selectedOptions.length > 0 && !deps && !depsError);
	const safeName = $derived(name.replace(/[^a-z0-9._-]+/gi, '-').replace(/^-|-$/g, '') || 'modlist');

	/** Remembered per list, for "updates since your last download". */
	function recordDownload() {
		rememberPicks();
		saveLocal(`downloaded:${storageKey}`, {
			gameVersion,
			pack,
			loader,
			at: Date.now(),
			versions: Object.fromEntries(parts.map((item) => [item.projectId, item.versionId]))
		});
	}

	async function downloadZip() {
		recordDownload();
		zipError = null;
		try {
			const blob = await buildZip(files, (progress) => (zipProgress = progress));
			saveBlob(blob, `${safeName}-${gameVersion}-${pack}.zip`);
		} catch (error) {
			zipError = error instanceof Error ? error.message : 'Download failed';
		} finally {
			zipProgress = null;
		}
	}

	function openTabs() {
		recordDownload();
		for (const { file } of files) window.open(file.url, '_blank', 'noopener');
	}

	function downloadScriptFile(shell: 'bash' | 'powershell') {
		recordDownload();
		const blob = new Blob([downloadScript(files, shell)], { type: 'text/plain' });
		saveBlob(blob, `${safeName}-${gameVersion}-${pack}.${shell === 'bash' ? 'sh' : 'ps1'}`);
	}

	let exporting = $state(false);

	/** Both packs in one .mrpack: files ticked in only one pack get that side only. */
	async function exportMrpack() {
		rememberPicks();
		exporting = true;
		zipError = null;
		try {
			const entries = new Map<string, MrpackEntry>();
			const skipped = new Set<string>();
			const add = (version: ModrinthVersion, projectType: string, target: Pack) => {
				const file = primaryFile(version);
				// .mrpack only allows downloads from Modrinth and a few code hosts, not CurseForge.
				if (!file?.url || version.id.startsWith('cf:')) {
					skipped.add(version.name);
					return;
				}
				const entry = entries.get(version.id) ?? { file, projectType, packs: new Set<Pack>() };
				entry.packs.add(target);
				entries.set(version.id, entry);
			};
			for (const target of ['client', 'server'] as const) {
				const picked = packItems(matrix, gameVersion, target, disabled)
					.filter((item) => item.options.length > 0 && isIncluded(item, target))
					.map((item) => chosen(item, target));
				for (const option of picked) add(option.version, option.project.project_type, target);
				if (includeDeps && picked.length > 0) {
					const result = await resolveDependencies(
						picked.map((option) => ({ title: option.project.title, version: option.version })),
						dependencyApi,
						{ loader, gameVersion }
					);
					for (const dep of result.resolved) {
						if (depsIncluded[dep.version.project_id] !== false) add(dep.version, dep.project?.project_type ?? 'mod', target);
					}
				}
			}
			const response = await fetch(`/api/loader-version?loader=${loader}&gameVersion=${encodeURIComponent(gameVersion)}`);
			const { version: loaderVersion } = response.ok ? await response.json() : { version: null };
			const index = buildMrpackIndex({ name, gameVersion, loader, loaderVersion, entries: [...entries.values()] });
			saveBlob(textZip({ 'modrinth.index.json': JSON.stringify(index, null, 2) }, 'application/x-modrinth-modpack+zip'), `${safeName}-${gameVersion}.mrpack`);
			if (skipped.size > 0) zipError = `Left out of the .mrpack (CurseForge files aren't allowed in it): ${[...skipped].join(', ')}`;
		} catch (error) {
			zipError = error instanceof Error ? error.message : 'Export failed';
		} finally {
			exporting = false;
		}
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

			{#if manual.length > 0}
				<div class="alert warn note">
					Download by hand (the author doesn't allow other apps to download them):
					{#each manual as item, index (item.url)}{index > 0 ? ', ' : ' '}<a href={item.url} target="_blank" rel="noopener">{item.title}</a>{/each}
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
				<select
					class="select"
					value=""
					disabled={files.length === 0 || depsPending}
					onchange={(event) => {
						const shell = event.currentTarget.value as 'bash' | 'powershell' | '';
						event.currentTarget.value = '';
						if (shell) downloadScriptFile(shell);
					}}
					title="A script that downloads these files and checks them, e.g. for the server"
				>
					<option value="" disabled>Script…</option>
					<option value="bash">bash (.sh)</option>
					<option value="powershell">PowerShell (.ps1)</option>
				</select>
				<button class="btn" onclick={exportMrpack} disabled={exporting || depsPending} title="Modrinth modpack with both packs; opens in the Modrinth App, Prism and others">
					{exporting ? 'Exporting…' : '.mrpack'}
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
