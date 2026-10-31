import { error, fail, redirect } from '@sveltejs/kit';
import { diffContent } from '#lib/core/diff.ts';
import { emptyContent } from '#lib/core/types.ts';
import { getRevision, listRevisions, requireList, restoreRevision, StaleRevisionError } from '#lib/server/lists.ts';
import type { Actions, PageServerLoad } from './$types';

export const load: PageServerLoad = ({ params, locals, url }) => {
	const { list, access } = requireList(params.id, locals.user, 'view');
	const revisions = listRevisions(list.id);
	const selectedNumber = Number(url.searchParams.get('rev') ?? list.currentRevision);
	const selected = getRevision(list.id, selectedNumber);
	if (!selected) error(404, 'Revision not found');
	const previous = selectedNumber > 1 ? getRevision(list.id, selectedNumber - 1) : null;

	return {
		list: { id: list.id, name: list.name, currentRevision: list.currentRevision },
		revisions,
		selected: { number: selected.number, message: selected.message, createdAt: selected.createdAt },
		diff: diffContent(previous?.content ?? emptyContent(), selected.content),
		canEdit: access !== 'view'
	};
};

export const actions: Actions = {
	restore: async ({ params, locals, request }) => {
		if (!locals.user) redirect(303, '/login');
		const { list } = requireList(params.id, locals.user, 'edit');
		const number = Number((await request.formData()).get('number'));
		try {
			restoreRevision(list.id, locals.user.id, number);
		} catch (err) {
			if (err instanceof StaleRevisionError) return fail(409, { error: 'The list changed. Reload and try again.' });
			throw err;
		}
		redirect(303, `/lists/${list.id}`);
	}
};
