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
	setTargetGameVersion,
	stopFollowing
} from '#lib/server/lists.ts';
import { addShare, forkList, listShares, otherHandles, ownerOf, removeShare, setVisibility } from '#lib/server/sharing.ts';
import type { Actions, PageServerLoad } from './$types';

export const load: PageServerLoad = ({ params, locals, url }) => {
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
			targetGameVersion: list.targetGameVersion,
			currentRevision: list.currentRevision,
			updatedAt: list.updatedAt
		},
		owner: ownerOf(list) ?? null,
		content,
		follow,
		followers: followersOf(list.id),
		lastEditor: lastEditor?.handle ?? null,
		access,
		sharing:
			access === 'own'
				? { shares: listShares(list.id), handles: otherHandles(list.ownerId), url: `${url.origin}/lists/${list.id}` }
				: null
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
	},

	visibility: async ({ params, locals, request }) => {
		const { list } = requireList(params.id, locals.user, 'own');
		const visibility = String((await request.formData()).get('visibility'));
		if (visibility !== 'private' && visibility !== 'shared' && visibility !== 'public') {
			return fail(400, { shareError: 'Unknown visibility' });
		}
		setVisibility(list.id, visibility);
	},

	share: async ({ params, locals, request }) => {
		const { list } = requireList(params.id, locals.user, 'own');
		const form = await request.formData();
		const role = form.get('role') === 'editor' ? 'editor' : 'viewer';
		const problem = addShare(list, String(form.get('handle') ?? '').trim(), role);
		if (problem) return fail(400, { shareError: problem });
	},

	unshare: async ({ params, locals, request }) => {
		const { list } = requireList(params.id, locals.user, 'own');
		removeShare(list.id, String((await request.formData()).get('userId')));
	},

	fork: ({ params, locals }) => {
		if (!locals.user) redirect(303, `/login`);
		const { list } = requireList(params.id, locals.user, 'view');
		const copy = forkList(list, locals.user.id);
		redirect(303, `/lists/${copy.id}`);
	},

	target: async ({ params, locals, request }) => {
		const { list } = requireList(params.id, locals.user, 'edit');
		const target = String((await request.formData()).get('target') ?? '').trim().slice(0, 40);
		setTargetGameVersion(list.id, target || null);
	}
};
