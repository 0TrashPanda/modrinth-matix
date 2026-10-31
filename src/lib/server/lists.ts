import { error } from '@sveltejs/kit';
import { and, desc, eq, inArray } from 'drizzle-orm';
import * as v from 'valibot';
import { diffContent, type DiffLine } from '#lib/core/diff.ts';
import { applyOverrides, withoutRemovals } from '#lib/core/overrides.ts';
import { emptyContent, LOADERS, type FollowMode, type ListContent } from '#lib/core/types.ts';
import type { SessionUser } from './auth';
import { db } from './db';
import { modlists, modlistShares, revisions, users, type Modlist } from './db/schema';
import { randomId } from './ids';

export type Access = 'view' | 'edit' | 'own';
const ACCESS_RANK: Record<Access, number> = { view: 1, edit: 2, own: 3 };

const sideSchema = v.picklist(['client', 'server', 'both']);
const contentSchema = v.object({
	version: v.literal(1),
	entries: v.pipe(
		v.array(
			v.object({
				alternatives: v.pipe(
					v.array(
						v.object({
							platform: v.literal('modrinth'),
							slug: v.pipe(v.string(), v.minLength(1), v.maxLength(100)),
							projectType: v.pipe(v.string(), v.regex(/^[a-z]+$/), v.maxLength(20)),
							sideMode: v.picklist(['auto', 'fallback', 'force']),
							side: v.optional(sideSchema)
						})
					),
					v.minLength(1),
					v.maxLength(10)
				)
			})
		),
		v.maxLength(1000)
	),
	removals: v.optional(
		v.pipe(
			v.array(
				v.object({
					slug: v.pipe(v.string(), v.minLength(1), v.maxLength(100)),
					projectType: v.pipe(v.string(), v.regex(/^[a-z]+$/), v.maxLength(20))
				})
			),
			v.maxLength(1000)
		)
	)
});

export const settingsSchema = v.object({
	name: v.pipe(v.string(), v.trim(), v.minLength(1, 'Name is required'), v.maxLength(80)),
	description: v.pipe(v.string(), v.trim(), v.maxLength(500)),
	loader: v.picklist(LOADERS),
	includeSnapshots: v.boolean()
});
export type ListSettingsInput = v.InferOutput<typeof settingsSchema>;

export function parseContent(json: unknown): ListContent {
	return v.parse(contentSchema, json);
}

function accessFor(list: Modlist, user: SessionUser | null): Access | null {
	if (user && list.ownerId === user.id) return 'own';
	if (user) {
		const share = db
			.select({ role: modlistShares.role })
			.from(modlistShares)
			.where(and(eq(modlistShares.modlistId, list.id), eq(modlistShares.userId, user.id)))
			.get();
		if (share) return share.role === 'editor' ? 'edit' : 'view';
	}
	if (list.visibility === 'public') return 'view';
	return null;
}

/** Loads a list or throws 404, so private lists aren't revealed to people without access. */
export function requireList(id: string, user: SessionUser | null, need: Access) {
	const list = db.select().from(modlists).where(eq(modlists.id, id)).get();
	const access = list ? accessFor(list, user) : null;
	if (!list || !access) error(404, 'List not found');
	if (ACCESS_RANK[access] < ACCESS_RANK[need]) error(403, "You don't have permission to do that");
	return { list, access };
}

export function listsForUser(userId: string) {
	const own = db
		.select()
		.from(modlists)
		.where(eq(modlists.ownerId, userId))
		.orderBy(desc(modlists.updatedAt))
		.all();
	const shared = db
		.select({ list: modlists, role: modlistShares.role, owner: users.handle })
		.from(modlistShares)
		.innerJoin(modlists, eq(modlistShares.modlistId, modlists.id))
		.innerJoin(users, eq(modlists.ownerId, users.id))
		.where(eq(modlistShares.userId, userId))
		.orderBy(desc(modlists.updatedAt))
		.all();
	return { own, shared };
}

export function getRevision(listId: string, number: number) {
	const revision = db
		.select()
		.from(revisions)
		.where(and(eq(revisions.modlistId, listId), eq(revisions.number, number)))
		.get();
	if (!revision) return null;
	return { ...revision, content: parseContent(JSON.parse(revision.content)) };
}

export function listRevisions(listId: string) {
	return db
		.select({
			number: revisions.number,
			message: revisions.message,
			createdAt: revisions.createdAt,
			author: users.handle,
			authorName: users.displayName,
			authorAvatar: users.avatarUrl
		})
		.from(revisions)
		.leftJoin(users, eq(revisions.authorId, users.id))
		.where(eq(revisions.modlistId, listId))
		.orderBy(desc(revisions.number))
		.all();
}

export function createList(
	ownerId: string,
	settings: ListSettingsInput,
	content: ListContent,
	base: Modlist | null = null
): Modlist {
	const list = db.transaction((tx) => {
		const list = tx
			.insert(modlists)
			.values({
				id: randomId(10),
				ownerId,
				...settings,
				baseListId: base?.id ?? null,
				baseRevision: base?.currentRevision ?? null,
				currentRevision: 1,
				entryCount: content.entries.length
			})
			.returning()
			.get();
		tx.insert(revisions)
			.values({
				modlistId: list.id,
				number: 1,
				authorId: ownerId,
				message: 'Created list',
				content: JSON.stringify(content)
			})
			.run();
		return list;
	});
	if (base) refreshEntryCounts(list.id);
	return list;
}

export class StaleRevisionError extends Error {}

/**
 * Saves settings and, if it changed, a new revision. `baseRevision` is the revision
 * the editor started from; if someone saved in between, the save is rejected.
 */
export function saveList(
	listId: string,
	authorId: string,
	baseRevision: number,
	settings: ListSettingsInput,
	content: ListContent,
	message: string
): number {
	const number = db.transaction((tx) => {
		const list = tx.select().from(modlists).where(eq(modlists.id, listId)).get()!;
		if (list.currentRevision !== baseRevision) throw new StaleRevisionError();

		const current = tx
			.select({ content: revisions.content })
			.from(revisions)
			.where(and(eq(revisions.modlistId, listId), eq(revisions.number, list.currentRevision)))
			.get();
		const json = JSON.stringify(content);
		let number = list.currentRevision;

		if (current?.content !== json) {
			number++;
			tx.insert(revisions).values({ modlistId: listId, number, authorId, message, content: json }).run();
		}

		tx.update(modlists)
			.set({
				...settings,
				currentRevision: number,
				entryCount: content.entries.length,
				updatedAt: new Date()
			})
			.where(eq(modlists.id, listId))
			.run();
		return number;
	});
	refreshEntryCounts(listId);
	return number;
}

/** Restoring adds a new revision with the old content, so nothing is lost. */
export function restoreRevision(listId: string, authorId: string, number: number): number {
	const old = getRevision(listId, number);
	if (!old) error(404, 'Revision not found');
	const list = db.select().from(modlists).where(eq(modlists.id, listId)).get()!;
	const { name, description, loader, includeSnapshots } = list;
	return saveList(
		listId,
		authorId,
		list.currentRevision,
		{ name, description, loader: loader as ListSettingsInput['loader'], includeSnapshots },
		old.content,
		`Restored revision ${number}`
	);
}

/** Lists that follow this one are turned into normal lists with their current mods first. */
export function deleteList(listId: string, authorId: string): void {
	for (const follower of followersOf(listId)) {
		stopFollowing(follower.id, authorId, 'Base list was deleted; kept its mods');
	}
	db.delete(modlists).where(eq(modlists.id, listId)).run();
}

// ---------- Following another list ----------

export const MAX_FOLLOW_DEPTH = 3;

function getListRow(id: string): Modlist | undefined {
	return db.select().from(modlists).where(eq(modlists.id, id)).get();
}

export function followersOf(listId: string) {
	return db
		.select({ id: modlists.id, name: modlists.name })
		.from(modlists)
		.where(eq(modlists.baseListId, listId))
		.all();
}

function ownerDefaultMode(list: Modlist): FollowMode {
	const owner = db.select({ followMode: users.followMode }).from(users).where(eq(users.id, list.ownerId)).get();
	return owner?.followMode ?? 'auto';
}

/** The list's own setting, or its owner's default when the list says "default". */
export function effectiveFollowMode(list: Modlist): FollowMode {
	return list.followMode === 'default' ? ownerDefaultMode(list) : list.followMode;
}

/** How many lists sit above this one in its follow chain. */
export function followDepth(list: Modlist): number {
	let depth = 0;
	let current: Modlist | undefined = list;
	while (current?.baseListId && depth <= MAX_FOLLOW_DEPTH) {
		depth++;
		current = getListRow(current.baseListId);
	}
	return depth;
}

function usedBaseRevision(list: Modlist, base: Modlist): number {
	return effectiveFollowMode(list) === 'manual' && list.baseRevision ? list.baseRevision : base.currentRevision;
}

/** The mods a list actually has at a revision, with its base list's mods applied. */
export function effectiveContent(list: Modlist, number = list.currentRevision, depth = 0): ListContent {
	const own = getRevision(list.id, number)?.content ?? emptyContent();
	if (!list.baseListId) return own;
	const base = getListRow(list.baseListId);
	if (!base || depth >= MAX_FOLLOW_DEPTH) return withoutRemovals(own);
	return applyOverrides(effectiveContent(base, usedBaseRevision(list, base), depth + 1), own).content;
}

export interface FollowInfo {
	base: { id: string; name: string; currentRevision: number; updatedAt: Date };
	mode: FollowMode;
	modeSetting: 'default' | 'auto' | 'manual';
	/** The owner's global setting, used when modeSetting is 'default'. */
	ownerDefault: FollowMode;
	/** Base revision this list is built on. */
	usedRevision: number;
	/** Base changes since the owner last looked (auto: already applied; manual: waiting). */
	pending: DiffLine[];
	warnings: string[];
}

export function resolveList(list: Modlist): { own: ListContent; content: ListContent; follow: FollowInfo | null } {
	const own = getRevision(list.id, list.currentRevision)?.content ?? emptyContent();
	const base = list.baseListId ? getListRow(list.baseListId) : undefined;
	if (!base) return { own, content: withoutRemovals(own), follow: null };

	const usedRevision = usedBaseRevision(list, base);
	const { content, warnings } = applyOverrides(effectiveContent(base, usedRevision, 1), own);
	const seen = list.baseRevision ?? base.currentRevision;
	const pending =
		seen < base.currentRevision
			? diffContent(effectiveContent(base, seen, 1), effectiveContent(base, base.currentRevision, 1))
			: [];

	return {
		own,
		content,
		follow: {
			base: { id: base.id, name: base.name, currentRevision: base.currentRevision, updatedAt: base.updatedAt },
			mode: effectiveFollowMode(list),
			modeSetting: list.followMode,
			ownerDefault: ownerDefaultMode(list),
			usedRevision,
			pending,
			warnings
		}
	};
}

/** Marks the base's latest revision as seen. In manual mode this applies the update. */
export function acknowledgeBase(listId: string): void {
	const list = getListRow(listId);
	const base = list?.baseListId ? getListRow(list.baseListId) : undefined;
	if (!list || !base) return;
	db.update(modlists).set({ baseRevision: base.currentRevision }).where(eq(modlists.id, listId)).run();
	refreshEntryCounts(listId);
}

export function setListFollowMode(listId: string, mode: 'default' | 'auto' | 'manual'): void {
	db.update(modlists).set({ followMode: mode }).where(eq(modlists.id, listId)).run();
	refreshEntryCounts(listId);
}

export function setUserFollowMode(userId: string, mode: FollowMode): void {
	db.update(users).set({ followMode: mode }).where(eq(users.id, userId)).run();
	const lists = db
		.select({ id: modlists.id })
		.from(modlists)
		.where(and(eq(modlists.ownerId, userId), eq(modlists.followMode, 'default')))
		.all();
	for (const list of lists) refreshEntryCounts(list.id);
}

/** Turns a following list into a normal list that keeps its current mods. */
export function stopFollowing(listId: string, authorId: string, message = 'Stopped following base list'): void {
	const list = getListRow(listId);
	if (!list?.baseListId) return;
	const content = effectiveContent(list);
	db.transaction((tx) => {
		const number = list.currentRevision + 1;
		tx.insert(revisions)
			.values({ modlistId: listId, number, authorId, message, content: JSON.stringify(content) })
			.run();
		tx.update(modlists)
			.set({ baseListId: null, baseRevision: null, currentRevision: number, entryCount: content.entries.length, updatedAt: new Date() })
			.where(eq(modlists.id, listId))
			.run();
	});
}

/** Keeps the dashboard's entry counts right for this list and lists following it. */
function refreshEntryCounts(listId: string, depth = 0): void {
	const list = getListRow(listId);
	if (!list || depth > MAX_FOLLOW_DEPTH) return;
	db.update(modlists)
		.set({ entryCount: effectiveContent(list).entries.length })
		.where(eq(modlists.id, listId))
		.run();
	for (const follower of followersOf(listId)) refreshEntryCounts(follower.id, depth + 1);
}

export function listNames(ids: string[]): Map<string, string> {
	if (ids.length === 0) return new Map();
	const rows = db.select({ id: modlists.id, name: modlists.name }).from(modlists).where(inArray(modlists.id, ids)).all();
	return new Map(rows.map((row) => [row.id, row.name]));
}
