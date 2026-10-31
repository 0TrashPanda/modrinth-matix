import { redirect } from '@sveltejs/kit';
import { eq } from 'drizzle-orm';
import { db } from '#lib/server/db/index.ts';
import { users } from '#lib/server/db/schema.ts';
import { setUserFollowMode } from '#lib/server/lists.ts';
import type { Actions, PageServerLoad } from './$types';

export const load: PageServerLoad = ({ locals }) => {
	if (!locals.user) redirect(302, '/login');
	const user = db.select({ followMode: users.followMode }).from(users).where(eq(users.id, locals.user.id)).get()!;
	return { followMode: user.followMode };
};

export const actions: Actions = {
	default: async ({ locals, request }) => {
		if (!locals.user) redirect(303, '/login');
		const mode = String((await request.formData()).get('followMode'));
		if (mode === 'auto' || mode === 'manual') setUserFollowMode(locals.user.id, mode);
		return { saved: true };
	}
};
