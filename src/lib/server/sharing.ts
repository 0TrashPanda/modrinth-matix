import { and, asc, desc, eq, ne } from 'drizzle-orm';
import { db } from './db';
import { modlists, modlistShares, users, type Modlist } from './db/schema';
import { createList, resolveList, type ListSettingsInput } from './lists';

export type Visibility = 'private' | 'shared' | 'public';
export type ShareRole = 'viewer' | 'editor';

export function setVisibility(listId: string, visibility: Visibility): void {
	db.update(modlists).set({ visibility }).where(eq(modlists.id, listId)).run();
}

export function listShares(listId: string) {
	return db
		.select({
			userId: users.id,
			handle: users.handle,
			displayName: users.displayName,
			avatarUrl: users.avatarUrl,
			role: modlistShares.role
		})
		.from(modlistShares)
		.innerJoin(users, eq(modlistShares.userId, users.id))
		.where(eq(modlistShares.modlistId, listId))
		.orderBy(asc(users.handle))
		.all();
}

/** Returns an error message, or null when the person was added (or their role updated). */
export function addShare(list: Modlist, handle: string, role: ShareRole): string | null {
	const user = db
		.select({ id: users.id, disabledAt: users.disabledAt })
		.from(users)
		.where(eq(users.handle, handle.replace(/^@/, '').toLowerCase()))
		.get();
	if (!user || user.disabledAt) return `No one with the handle ${handle} is on this instance`;
	if (user.id === list.ownerId) return 'You already own this list';

	db.insert(modlistShares)
		.values({ modlistId: list.id, userId: user.id, role })
		.onConflictDoUpdate({ target: [modlistShares.modlistId, modlistShares.userId], set: { role } })
		.run();
	// Adding people to a private list means it's meant to be shared.
	if (list.visibility === 'private') setVisibility(list.id, 'shared');
	return null;
}

export function removeShare(listId: string, userId: string): void {
	db.delete(modlistShares)
		.where(and(eq(modlistShares.modlistId, listId), eq(modlistShares.userId, userId)))
		.run();
}

/** Other people on the instance, offered as suggestions in the share dialog. */
export function otherHandles(userId: string): string[] {
	return db
		.select({ handle: users.handle })
		.from(users)
		.where(ne(users.id, userId))
		.orderBy(asc(users.handle))
		.all()
		.map((row) => row.handle);
}

/** A private copy of the list's current mods, owned by `userId`. It doesn't follow the original. */
export function forkList(source: Modlist, userId: string): Modlist {
	const { content } = resolveList(source);
	const settings: ListSettingsInput = {
		name: source.ownerId === userId ? `${source.name} (copy)` : source.name,
		description: source.description,
		loader: source.loader as ListSettingsInput['loader'],
		includeSnapshots: source.includeSnapshots
	};
	const list = createList(userId, settings, content);
	db.update(modlists).set({ forkedFrom: source.id }).where(eq(modlists.id, list.id)).run();
	return list;
}

export function profile(handle: string) {
	const user = db
		.select({ id: users.id, handle: users.handle, displayName: users.displayName, avatarUrl: users.avatarUrl, disabledAt: users.disabledAt })
		.from(users)
		.where(eq(users.handle, handle.toLowerCase()))
		.get();
	if (!user || user.disabledAt) return null;
	const lists = db
		.select({ id: modlists.id, name: modlists.name, description: modlists.description, loader: modlists.loader, entryCount: modlists.entryCount, updatedAt: modlists.updatedAt })
		.from(modlists)
		.where(and(eq(modlists.ownerId, user.id), eq(modlists.visibility, 'public')))
		.orderBy(desc(modlists.updatedAt))
		.all();
	return { user, lists };
}

export function ownerOf(list: Modlist) {
	return db
		.select({ handle: users.handle, displayName: users.displayName, avatarUrl: users.avatarUrl })
		.from(users)
		.where(eq(users.id, list.ownerId))
		.get();
}
