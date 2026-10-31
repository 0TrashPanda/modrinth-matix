import { fail, redirect } from '@sveltejs/kit';
import { readListForm } from '#lib/server/list-form.ts';
import { createList, followDepth, listsForUser, MAX_FOLLOW_DEPTH, requireList, resolveList } from '#lib/server/lists.ts';
import type { Actions, PageServerLoad } from './$types';

export const load: PageServerLoad = ({ locals, url }) => {
	if (!locals.user) redirect(302, '/login');
	const { own, shared } = listsForUser(locals.user.id);
	const candidates = [...own, ...shared.map((row) => row.list)]
		.filter((list) => followDepth(list) < MAX_FOLLOW_DEPTH)
		.map((list) => {
			const { content } = resolveList(list);
			return { id: list.id, name: list.name, loader: list.loader, includeSnapshots: list.includeSnapshots, content };
		});
	return { bases: candidates, preselectedBase: url.searchParams.get('base') };
};

export const actions: Actions = {
	default: async ({ request, locals }) => {
		if (!locals.user) redirect(303, '/login');
		const form = await request.formData();
		const baseId = String(form.get('baseListId') ?? '');

		const base = baseId ? requireList(baseId, locals.user, 'view').list : null;
		if (base && followDepth(base) >= MAX_FOLLOW_DEPTH) {
			return fail(400, { error: `Lists can only follow ${MAX_FOLLOW_DEPTH} levels deep` });
		}

		const result = readListForm(form, Boolean(base));
		if (!result.ok) return fail(400, { error: result.error });
		const list = createList(locals.user.id, result.settings, result.content, base);
		redirect(303, `/lists/${list.id}`);
	}
};
