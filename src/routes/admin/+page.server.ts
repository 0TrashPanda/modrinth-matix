import { error, fail } from '@sveltejs/kit';
import * as v from 'valibot';
import { createInvite, listInvites, listUsers, revokeInvite, setUserDisabled } from '#lib/server/accounts.ts';
import { invalidateUserSessions } from '#lib/server/auth.ts';
import type { Actions, PageServerLoad } from './$types';

function requireAdmin(locals: App.Locals) {
	if (locals.user?.role !== 'admin') error(404, 'Not found');
	return locals.user;
}

const inviteSchema = v.object({
	maxUses: v.pipe(v.string(), v.toNumber(), v.integer(), v.minValue(1), v.maxValue(100)),
	expiresInDays: v.pipe(v.string(), v.toNumber(), v.integer(), v.minValue(0), v.maxValue(365)),
	lockedEmail: v.pipe(v.string(), v.trim(), v.union([v.literal(''), v.pipe(v.string(), v.email('Not a valid email'))]))
});

export const load: PageServerLoad = ({ locals, url }) => {
	requireAdmin(locals);
	return {
		invites: listInvites(),
		users: listUsers().map(({ googleSub: _, ...user }) => user),
		origin: url.origin
	};
};

export const actions: Actions = {
	createInvite: async ({ request, locals }) => {
		const admin = requireAdmin(locals);
		const form = Object.fromEntries(await request.formData());
		const result = v.safeParse(inviteSchema, form);
		if (!result.success) return fail(400, { inviteError: result.issues[0].message });
		const { maxUses, expiresInDays, lockedEmail } = result.output;
		const invite = createInvite(admin.id, {
			maxUses,
			expiresInDays: expiresInDays || null,
			lockedEmail: lockedEmail || null
		});
		return { createdCode: invite.code };
	},

	revokeInvite: async ({ request, locals }) => {
		requireAdmin(locals);
		revokeInvite(String((await request.formData()).get('id')));
	},

	setDisabled: async ({ request, locals }) => {
		requireAdmin(locals);
		const form = await request.formData();
		const userId = String(form.get('id'));
		const disabled = form.get('disabled') === 'true';
		setUserDisabled(userId, disabled);
		if (disabled) invalidateUserSessions(userId);
	}
};
