import { fail, redirect } from '@sveltejs/kit';
import { eq } from 'drizzle-orm';
import { db } from '#lib/server/db/index.ts';
import { users } from '#lib/server/db/schema.ts';
import {
	acknowledgeBase,
	deleteList,
	followersOf,
	getRevision,
	requireList,
	resolveList,
	setListFollowMode,
	stopFollowing
} from '#lib/server/lists.ts';
import type { Actions, PageServerLoad } from './$types';

export const load: PageServerLoad = ({ params, locals }) => {
	const { list, access } = requireList(params.id, locals.user, 'view');
	const { content, follow } = resolveList(list);
	const revision = getRevision(list.id, list.currentRevision);

	const lastEditor = revision?.authorId
		? db.select({ handle: users.handle }).from(users).where(eq(users.id, revision.authorId)).get()
		: undefined;

	return {
		list: {
			id: list.id,
			name: list.name,
			description: list.description,
			visibility: list.visibility,
			loader: list.loader,
			includeSnapshots: list.includeSnapshots,
			currentRevision: list.currentRevision,
			updatedAt: list.updatedAt
		},
		content,
		follow,
		followers: followersOf(list.id),
		lastEditor: lastEditor?.handle ?? null,
		access
	};
};

export const actions: Actions = {
	delete: ({ params, locals }) => {
		const { list } = requireList(params.id, locals.user, 'own');
		deleteList(list.id, locals.user!.id);
		redirect(303, '/');
	},

	followMode: async ({ params, locals, request }) => {
		const { list } = requireList(params.id, locals.user, 'edit');
		const mode = String((await request.formData()).get('mode'));
		if (mode !== 'default' && mode !== 'auto' && mode !== 'manual') return fail(400, { error: 'Unknown mode' });
		setListFollowMode(list.id, mode);
	},

	// Manual mode: apply the base's changes. Auto mode: dismiss the "what changed" notice.
	acknowledge: ({ params, locals }) => {
		const { list } = requireList(params.id, locals.user, 'edit');
		acknowledgeBase(list.id);
	},

	stopFollowing: ({ params, locals }) => {
		const { list } = requireList(params.id, locals.user, 'own');
		stopFollowing(list.id, locals.user!.id);
	}
};
