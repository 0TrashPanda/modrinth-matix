import { curseforgeEnabled } from '#lib/server/curseforge.ts';
import { listsForUser } from '#lib/server/lists.ts';
import type { LayoutServerLoad } from './$types';

export const load: LayoutServerLoad = ({ locals }) => {
	if (!locals.user) return { user: null, sidebar: null, curseforge: false };
	const { own, shared } = listsForUser(locals.user.id);
	return {
		user: locals.user,
		curseforge: curseforgeEnabled,
		sidebar: {
			own: own.map(({ id, name, entryCount }) => ({ id, name, entryCount })),
			shared: shared.map(({ list }) => ({ id: list.id, name: list.name, entryCount: list.entryCount }))
		}
	};
};
