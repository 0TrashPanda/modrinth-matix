<script lang="ts">
	import { getCurseforgeMeta, getProjectsMeta } from '#lib/client/modrinth.ts';
	import {
		addAlternative,
		addEntry,
		containsSlug,
		mergeEntries,
		moveEntry,
		normalize,
		removeAlternative,
		removeEntry,
		removeSection,
		renameSection,
		setPin,
		setSide,
		splitEntry,
		updateEntry
	} from '#lib/core/edit-ops.ts';
	import { modrinthSide, SIDE_TITLE } from '#lib/core/sides.ts';
	import { groupBySection, parseText, projectUrl, serializeText } from '#lib/core/text-format.ts';
	import { dataKey, type Alternative, type Entry, type KnownSide, type ListContent, type ModrinthProject, type SideMode } from '#lib/core/types.ts';
	import type { SearchHit } from '#lib/client/modrinth.ts';
	import ModSearch from './ModSearch.svelte';

	interface Props {
		text: string;
		loader: string;
	}

	let { text = $bindable(), loader }: Props = $props();

	const content = $derived(normalize(parseText(text).content));
	let meta = $state(new Map<string, ModrinthProject>());
	// Tracked by the line's first mod so it follows the line when lines move.
	let selectedSlug = $state<string | null>(null);
	const selected = $derived.by(() => {
		if (!selectedSlug) return null;
		const index = content.entries.findIndex((entry) => entry.alternatives.some((alt) => alt.slug === selectedSlug));
		return index === -1 ? null : index;
	});
	const select = (index: number | null) =>
		(selectedSlug = index === null || index === selected ? null : content.entries[index].alternatives[0].slug);
	let extraSections = $state<string[]>([]);
	let noteEditing = $state<number | null>(null);
	let dragFrom = $state<number | null>(null);
	let armed = $state<number | null>(null);
	let dropTarget = $state<{ index: number; zone: 'before' | 'after' | 'merge' } | { section: string | null } | null>(null);

	function commit(next: ListContent) {
		text = serializeText(next);
	}

	// Names and icons for the rows, keyed by dataKey(); Modrinth info is cached in IndexedDB.
	// Keys already looked up aren't retried, so unknown mods don't cause a request loop.
	const tried = new Set<string>();
	const missing = $derived(
		content.entries
			.flatMap((entry) => entry.alternatives)
			.filter((alternative) => !meta.has(dataKey(alternative)) && !tried.has(dataKey(alternative)))
	);
	$effect(() => {
		const refs = missing;
		if (refs.length === 0) return;
		const timer = setTimeout(async () => {
			for (const ref of refs) tried.add(dataKey(ref));
			try {
				const modrinth = refs.filter((ref) => ref.platform !== 'curseforge');
				const curseforge = refs.filter((ref) => ref.platform === 'curseforge');
				const [found, cf] = await Promise.all([
					modrinth.length ? getProjectsMeta(modrinth.map((ref) => ref.slug)) : new Map<string, ModrinthProject>(),
					curseforge.length ? getCurseforgeMeta(curseforge) : new Map<string, ModrinthProject>()
				]);
				meta = new Map([...meta, ...found, ...cf]);
			} catch {
				// Rows fall back to showing the slug.
			}
		}, 250);
		return () => clearTimeout(timer);
	});

	const groups = $derived.by(() => {
		const list = groupBySection(content.entries).map((group) => ({
			section: group.section,
			entries: group.entries.map((entry) => ({ entry, index: content.entries.indexOf(entry) }))
		}));
		if (!list.some((group) => group.section === null)) list.unshift({ section: null, entries: [] });
		for (const name of extraSections) {
			if (!list.some((group) => group.section === name)) list.push({ section: name, entries: [] });
		}
		return list;
	});

	const lastSection = $derived(groups.at(-1)?.section ?? undefined);
	const selectedEntry = $derived(selected !== null ? content.entries[selected] : null);

	function title(alternative: Alternative) {
		return meta.get(dataKey(alternative))?.title ?? alternative.slug;
	}

	function sideValue(alternative: Alternative) {
		return alternative.sideMode === 'auto' ? 'auto' : `${alternative.sideMode}:${alternative.side}`;
	}

	function changeSide(index: number, slug: string, value: string) {
		if (value === 'auto') return commit(setSide(content, index, slug, 'auto'));
		const [mode, side] = value.split(':') as [SideMode, KnownSide];
		commit(setSide(content, index, slug, mode, side));
	}

	function hitToAlternative(hit: SearchHit): Alternative {
		const platform = hit.project_id.startsWith('cf:') ? 'curseforge' : 'modrinth';
		return { platform, slug: hit.slug, projectType: hit.project_type, sideMode: 'auto' };
	}

	/** A mod Modrinth has no side info for, still on "Auto": it needs a fallback or forced side. */
	function unknownSide(entry: Entry) {
		return entry.alternatives.some((alternative) => {
			const project = meta.get(dataKey(alternative));
			return project && alternative.sideMode === 'auto' && modrinthSide(project) === 'unknown';
		});
	}

	function addFromSearch(hit: SearchHit) {
		const section = selectedEntry?.section ?? lastSection;
		commit(addEntry(content, hitToAlternative(hit), section));
		rememberHit(hit);
	}

	function addAlternativeFromSearch(hit: SearchHit) {
		if (selected === null) return;
		commit(addAlternative(content, selected, hitToAlternative(hit)));
		rememberHit(hit);
	}

	// Search results already carry everything a row shows, so skip the lookup.
	function rememberHit(hit: SearchHit) {
		meta = new Map(meta).set(dataKey(hitToAlternative(hit)), {
			id: hit.project_id,
			slug: hit.slug,
			title: hit.title,
			icon_url: hit.icon_url,
			project_type: hit.project_type,
			client_side: hit.client_side,
			server_side: hit.server_side
		});
	}

	function addSection() {
		let name = 'New section';
		for (let n = 2; groups.some((group) => group.section === name); n++) name = `New section ${n}`;
		extraSections = [...extraSections, name];
	}

	function rename(from: string, to: string) {
		extraSections = extraSections.map((name) => (name === from ? to.trim() : name)).filter(Boolean);
		if (content.entries.some((entry) => entry.section === from)) commit(renameSection(content, from, to));
	}

	function dropSection(name: string) {
		extraSections = extraSections.filter((section) => section !== name);
		commit(removeSection(content, name));
	}

	// ---- drag and drop: top/bottom third moves, middle merges into one OR-line ----
	function onDragOver(event: DragEvent, index: number) {
		if (dragFrom === null) return;
		event.preventDefault();
		const rect = (event.currentTarget as HTMLElement).getBoundingClientRect();
		const y = (event.clientY - rect.top) / rect.height;
		dropTarget = { index, zone: dragFrom === index ? 'before' : y < 0.3 ? 'before' : y > 0.7 ? 'after' : 'merge' };
	}

	function onDropEntry(event: DragEvent, index: number) {
		event.preventDefault();
		if (dragFrom === null || !dropTarget || !('index' in dropTarget)) return reset();
		const target: Entry = content.entries[index];
		if (dropTarget.zone === 'merge') {
			commit(mergeEntries(content, dragFrom, index));
		} else if (dropTarget.zone === 'before') {
			commit(moveEntry(content, dragFrom, index, target.section));
		} else {
			const next = content.entries[index + 1];
			const sameSection = next && next.section === target.section;
			commit(moveEntry(content, dragFrom, sameSection ? index + 1 : null, target.section));
		}
		reset();
	}

	function onDropSection(event: DragEvent, section: string | null) {
		event.preventDefault();
		if (dragFrom === null) return reset();
		const first = content.entries.findIndex((entry) => (entry.section ?? null) === section);
		commit(moveEntry(content, dragFrom, first === -1 ? null : first, section ?? undefined));
		if (section) extraSections = extraSections.filter((name) => name !== section);
		reset();
	}

	function reset() {
		dragFrom = null;
		dropTarget = null;
		armed = null;
	}
</script>

<div class="editor">
	<div class="rows">
		{#each groups as group (group.section ?? '')}
			{#if group.section !== null || group.entries.length > 0 || dragFrom !== null}
			<div
				class="section-head"
				class:drop={dropTarget && 'section' in dropTarget && dropTarget.section === group.section}
				ondragover={(event) => {
					if (dragFrom === null) return;
					event.preventDefault();
					dropTarget = { section: group.section };
				}}
				ondrop={(event) => onDropSection(event, group.section)}
				role="group"
			>
				{#if group.section === null}
					<span class="muted">No section · {group.entries.length}</span>
				{:else}
					<input
						class="section-name"
						value={group.section}
						onchange={(event) => rename(group.section!, event.currentTarget.value)}
						aria-label="Section name"
					/>
					<span class="muted">{group.entries.length}</span>
					<button type="button" class="btn ghost sm" onclick={() => dropSection(group.section!)} title="Remove heading (keeps the mods)">✕</button>
				{/if}
			</div>
			{/if}

			{#each group.entries as { entry, index } (`${index}:${entry.alternatives[0].slug}`)}
				<div
					class="entry"
					class:selected={selected === index}
					class:dragging={dragFrom === index}
					class:drop-before={dropTarget && 'index' in dropTarget && dropTarget.index === index && dropTarget.zone === 'before'}
					class:drop-after={dropTarget && 'index' in dropTarget && dropTarget.index === index && dropTarget.zone === 'after'}
					class:drop-merge={dropTarget && 'index' in dropTarget && dropTarget.index === index && dropTarget.zone === 'merge'}
					draggable={armed === index}
					ondragstart={(event) => {
						dragFrom = index;
						event.dataTransfer?.setData('text/plain', String(index));
					}}
					ondragend={reset}
					ondragover={(event) => onDragOver(event, index)}
					ondrop={(event) => onDropEntry(event, index)}
					role="listitem"
				>
					<span
						class="handle"
						title="Drag to move. Drop on the middle of another mod to make them alternatives."
						onpointerdown={() => (armed = index)}
						onpointerup={() => (armed = null)}
						role="button"
						tabindex="-1">⋮⋮</span
					>
					<div class="alts">
						{#each entry.alternatives as alternative, altIndex (alternative.slug)}
							{@const project = meta.get(dataKey(alternative)) ?? null}
							{#if altIndex > 0}<div class="or">OR</div>{/if}
							<div class="alt-row">
								{#if project?.icon_url}<img class="ico" src={project.icon_url} alt="" loading="lazy" />{:else}<span class="ico"></span>{/if}
								<a class="name" href={projectUrl(alternative)} target="_blank" rel="noopener" onclick={(event) => event.stopPropagation()}>{title(alternative)}</a>
								<select
									class="select sm"
									value={sideValue(alternative)}
									onclick={(event) => event.stopPropagation()}
									onchange={(event) => changeSide(index, alternative.slug, event.currentTarget.value)}
									title="Which side this mod runs on"
								>
									<option value="auto">Auto · {project ? SIDE_TITLE[modrinthSide(project)] : 'from Modrinth'}</option>
									<option value="fallback:client">If unknown: client</option>
									<option value="fallback:server">If unknown: server</option>
									<option value="fallback:both">If unknown: both</option>
									<option value="force:client">Always client</option>
									<option value="force:server">Always server</option>
									<option value="force:both">Always both</option>
								</select>
								<input
									class="pin"
									class:set={alternative.pin}
									value={alternative.pin ?? ''}
									placeholder="pin version"
									title="Pin to a mod version number, e.g. 1.3.2. Leave empty to use the best version."
									onkeydown={(event) => event.key === 'Enter' && (event.preventDefault(), event.currentTarget.blur())}
									onchange={(event) => commit(setPin(content, index, alternative.slug, event.currentTarget.value))}
								/>
								{#if entry.alternatives.length > 1}
									<button
										type="button"
										class="btn ghost sm"
										onclick={(event) => {
											event.stopPropagation();
											commit(removeAlternative(content, index, alternative.slug));
										}}
										title="Remove this alternative">✕</button
									>
								{/if}
							</div>
						{/each}
						{#if unknownSide(entry)}
							<div class="warn-line">Modrinth doesn't say which side this runs on. Pick "If unknown" or "Always".</div>
						{/if}
						{#if noteEditing === index}
							<input
								class="input note-input"
								value={entry.note ?? ''}
								placeholder="Note, e.g. why this mod is here"
								onclick={(event) => event.stopPropagation()}
								onkeydown={(event) => event.key === 'Enter' && event.currentTarget.blur()}
								onblur={(event) => {
									commit(updateEntry(content, index, { note: event.currentTarget.value }));
									noteEditing = null;
								}}
							/>
						{:else if entry.note}
							<div class="note">“{entry.note}”</div>
						{/if}
					</div>
					<div class="entry-actions">
						<label class="check-label small">
							<input
								type="checkbox"
								checked={entry.optional ?? false}
								onchange={(event) => commit(updateEntry(content, index, { optional: event.currentTarget.checked }))}
							/>
							Optional
						</label>
						<div class="row small-actions">
							<button
								type="button"
								class="link"
								class:active={selected === index}
								onclick={() => select(index)}
								title="Search results get a '+ as alt' button that adds to this line">{selected === index ? '✓ Adding alts here' : '+ Alt here'}</button
							>
							<button type="button" class="link" onclick={() => (noteEditing = index)}>Note</button>
							{#if entry.alternatives.length > 1}
								<button type="button" class="link" onclick={(event) => { event.stopPropagation(); commit(splitEntry(content, index)); }}>Split</button>
							{/if}
							<button
								type="button"
								class="link danger"
								onclick={(event) => {
									event.stopPropagation();
									if (selected === index) select(null);
									commit(removeEntry(content, index));
								}}>Remove</button
							>
						</div>
					</div>
				</div>
			{/each}
		{/each}
		<button type="button" class="new-section" onclick={addSection}>+ Add section</button>
	</div>

	<aside class="side">
		<ModSearch
			{loader}
			inList={(slug) => containsSlug(content, slug)}
			onadd={addFromSearch}
			onaddAlternative={selected !== null ? addAlternativeFromSearch : null}
			selectedName={selectedEntry ? title(selectedEntry.alternatives[0]) : null}
		/>
	</aside>
</div>

<style>
	.editor {
		display: grid;
		grid-template-columns: 1fr 320px;
		gap: 18px;
		align-items: start;
	}
	.rows {
		min-width: 0;
	}
	.side {
		position: sticky;
		top: 16px;
	}
	.section-head {
		display: flex;
		align-items: center;
		gap: 8px;
		margin: 14px 4px 8px;
		padding: 2px 6px;
		border-radius: 8px;
		font-size: 0.8rem;
		text-transform: uppercase;
		letter-spacing: 0.06em;
		font-weight: 600;
	}
	.section-head:first-child {
		margin-top: 0;
	}
	.section-head.drop {
		background: var(--accent-soft);
	}
	.section-name {
		background: none;
		border: 1px solid transparent;
		border-radius: 6px;
		padding: 2px 6px;
		font: inherit;
		color: var(--muted);
		text-transform: uppercase;
		letter-spacing: 0.06em;
		min-width: 0;
	}
	.section-name:hover,
	.section-name:focus {
		border-color: var(--line);
		color: var(--text);
		outline: none;
	}
	.entry {
		display: grid;
		grid-template-columns: 18px 1fr auto;
		gap: 12px;
		align-items: start;
		padding: 10px 12px;
		background: var(--surface);
		border-radius: 14px;
		margin-bottom: 8px;
		border: 2px solid transparent;
	}
	.entry.selected {
		border-color: var(--accent);
	}
	.entry.dragging {
		opacity: 0.4;
	}
	.entry.drop-before {
		box-shadow: 0 -3px 0 var(--accent);
	}
	.entry.drop-after {
		box-shadow: 0 3px 0 var(--accent);
	}
	.entry.drop-merge {
		border-color: var(--accent);
		background: var(--accent-soft);
	}
	.handle {
		color: var(--faint);
		cursor: grab;
		line-height: 26px;
		letter-spacing: -2px;
		user-select: none;
	}
	.alts {
		display: flex;
		flex-direction: column;
		gap: 6px;
		min-width: 0;
	}
	.alt-row {
		display: flex;
		align-items: center;
		gap: 10px;
		flex-wrap: wrap;
	}
	.name {
		font-weight: 600;
		color: var(--text);
	}
	.pin {
		width: 96px;
		padding: 4px 8px;
		border-radius: 8px;
		border: 1px dashed var(--line);
		background: none;
		font-size: 0.78rem;
		color: var(--muted);
	}
	.pin.set {
		border-style: solid;
		border-color: var(--blue-text);
		color: var(--blue-text);
	}
	.or {
		color: var(--faint);
		font-size: 0.72rem;
		font-weight: 700;
		margin-left: 36px;
	}
	.select.sm {
		padding: 4px 8px;
		font-size: 0.8rem;
	}
	.note {
		margin-left: 36px;
		color: var(--muted);
		font-size: 0.82rem;
		font-style: italic;
	}
	.note-input {
		margin-left: 36px;
		width: calc(100% - 36px);
		padding: 6px 10px;
		font-size: 0.85rem;
	}
	.warn-line {
		margin-left: 36px;
		color: var(--warn);
		font-size: 0.82rem;
	}
	.entry-actions {
		display: flex;
		flex-direction: column;
		align-items: flex-end;
		gap: 6px;
		font-size: 0.8rem;
		color: var(--muted);
	}
	.small {
		font-size: 0.8rem;
	}
	.small-actions {
		gap: 10px;
	}
	.link {
		background: none;
		border: none;
		padding: 0;
		color: var(--muted);
		cursor: pointer;
		font-size: 0.8rem;
	}
	.link:hover {
		color: var(--text);
	}
	.link.danger:hover {
		color: var(--danger);
	}
	.link.active {
		color: var(--accent);
	}
	.new-section {
		width: 100%;
		margin-top: 6px;
		padding: 8px;
		border-radius: 12px;
		border: 1px dashed var(--line);
		background: none;
		color: var(--muted);
		cursor: pointer;
	}
	.new-section:hover {
		color: var(--text);
	}
	@media (max-width: 1100px) {
		.editor {
			grid-template-columns: 1fr;
		}
		.side {
			position: static;
		}
	}
</style>
