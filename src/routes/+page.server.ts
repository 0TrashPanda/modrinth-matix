import { listNames, listsForUser } from '#lib/server/lists.ts';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = ({ locals }) => {
	if (!locals.user) return { lists: null };
	const { own, shared } = listsForUser(locals.user.id);
	const baseNames = listNames([...own, ...shared.map((row) => row.list)].flatMap((list) => (list.baseListId ? [list.baseListId] : [])));
	const summary = ({ id, name, loader, entryCount, visibility, updatedAt, baseListId }: (typeof own)[number]) => ({
		id,
		name,
		loader,
		entryCount,
		visibility,
		updatedAt,
		follows: baseListId ? (baseNames.get(baseListId) ?? null) : null
	});
	return {
		lists: {
			own: own.map(summary),
			shared: shared.map(({ list, role, owner }) => ({ ...summary(list), role, owner }))
		}
	};
};
