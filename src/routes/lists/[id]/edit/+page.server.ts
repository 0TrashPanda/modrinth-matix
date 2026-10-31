import { fail, redirect } from '@sveltejs/kit';
import { serializeText } from '#lib/core/text-format.ts';
import { readListForm } from '#lib/server/list-form.ts';
import { effectiveContent, requireList, resolveList, saveList, StaleRevisionError } from '#lib/server/lists.ts';
import { db } from '#lib/server/db/index.ts';
import { modlists } from '#lib/server/db/schema.ts';
import { eq } from 'drizzle-orm';
import type { Actions, PageServerLoad } from './$types';

export const load: PageServerLoad = ({ params, locals }) => {
	if (!locals.user) redirect(302, '/login');
	const { list } = requireList(params.id, locals.user, 'edit');
	const { own, follow } = resolveList(list);

	// The base mods this list is currently built on, for the editor's preview.
	let base = null;
	if (follow) {
		const baseList = db.select().from(modlists).where(eq(modlists.id, follow.base.id)).get()!;
		base = { name: follow.base.name, content: effectiveContent(baseList, follow.usedRevision, 1) };
	}

	return {
		list: {
			id: list.id,
			name: list.name,
			description: list.description,
			loader: list.loader,
			includeSnapshots: list.includeSnapshots,
			currentRevision: list.currentRevision
		},
		text: serializeText(own),
		base
	};
};

export const actions: Actions = {
	default: async ({ params, request, locals }) => {
		if (!locals.user) redirect(303, '/login');
		const { list } = requireList(params.id, locals.user, 'edit');
		const form = await request.formData();
		const result = readListForm(form, Boolean(list.baseListId));
		if (!result.ok) return fail(400, { error: result.error });

		const baseRevision = Number(form.get('baseRevision'));
		const message = String(form.get('message') ?? '').trim().slice(0, 200);
		try {
			saveList(list.id, locals.user.id, baseRevision, result.settings, result.content, message);
		} catch (err) {
			if (err instanceof StaleRevisionError) {
				return fail(409, {
					error:
						'Someone else saved this list while you were editing. Copy your changes, reload the page, and apply them again.'
				});
			}
			throw err;
		}
		redirect(303, `/lists/${list.id}`);
	}
};
