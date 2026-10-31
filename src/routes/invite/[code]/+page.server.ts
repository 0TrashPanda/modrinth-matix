import { eq } from 'drizzle-orm';
import { findInvite, INVITE_PROBLEM_TEXT, inviteProblem } from '#lib/server/accounts.ts';
import { db } from '#lib/server/db/index.ts';
import { users } from '#lib/server/db/schema.ts';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = ({ params, cookies, locals }) => {
	const invite = findInvite(params.code);
	const problem = inviteProblem(invite);
	if (problem || !invite) {
		return { valid: false as const, problem: INVITE_PROBLEM_TEXT[problem ?? 'not-found'] };
	}

	if (!locals.user) {
		// Remembered through the Google redirect and checked again on the way back.
		cookies.set('invite', invite.code, { path: '/', maxAge: 3600, sameSite: 'lax' });
	}

	const inviter = invite.createdBy
		? db
				.select({ handle: users.handle, displayName: users.displayName, avatarUrl: users.avatarUrl })
				.from(users)
				.where(eq(users.id, invite.createdBy))
				.get()
		: undefined;

	return {
		valid: true as const,
		inviter: inviter ?? null,
		expiresAt: invite.expiresAt,
		usesLeft: invite.maxUses - invite.uses,
		lockedEmail: invite.lockedEmail
	};
};
