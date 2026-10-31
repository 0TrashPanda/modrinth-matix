import { and, count, desc, eq, sql } from 'drizzle-orm';
import { ADMIN_EMAIL } from '$app/env/private';
import { db } from './db';
import { inviteUses, invites, users, type Invite, type User } from './db/schema';
import { randomId } from './ids';

export interface GoogleProfile {
	sub: string;
	email: string;
	emailVerified: boolean;
	name: string;
	picture: string | null;
}

export type InviteProblem = 'not-found' | 'revoked' | 'expired' | 'used-up' | 'wrong-email';

export const INVITE_PROBLEM_TEXT: Record<InviteProblem, string> = {
	'not-found': "This invite link doesn't exist.",
	revoked: 'This invite was revoked.',
	expired: 'This invite has expired.',
	'used-up': 'This invite has already been used.',
	'wrong-email': 'This invite is for a different email address.'
};

export function inviteProblem(invite: Invite | undefined, email?: string): InviteProblem | null {
	if (!invite) return 'not-found';
	if (invite.revokedAt) return 'revoked';
	if (invite.expiresAt && invite.expiresAt.getTime() < Date.now()) return 'expired';
	if (invite.uses >= invite.maxUses) return 'used-up';
	if (email && invite.lockedEmail && invite.lockedEmail.toLowerCase() !== email.toLowerCase()) return 'wrong-email';
	return null;
}

export function findInvite(code: string): Invite | undefined {
	return db.select().from(invites).where(eq(invites.code, code)).get();
}

function uniqueHandle(email: string): string {
	const base =
		email
			.split('@')[0]
			.toLowerCase()
			.replace(/[^a-z0-9_-]/g, '')
			.slice(0, 20) || 'user';
	let handle = base;
	for (let n = 2; db.select({ id: users.id }).from(users).where(eq(users.handle, handle)).get(); n++) {
		handle = `${base}${n}`;
	}
	return handle;
}

export type SignInResult =
	| { ok: true; user: User; created: boolean }
	| { ok: false; reason: 'disabled' | 'unverified' | 'no-invite' | InviteProblem };

/**
 * Existing users sign straight in. New users need a valid invite, unless they're
 * ADMIN_EMAIL or the very first account, which become admin.
 */
export function signInWithGoogle(profile: GoogleProfile, inviteCode: string | undefined): SignInResult {
	const existing = db.select().from(users).where(eq(users.googleSub, profile.sub)).get();
	if (existing) {
		if (existing.disabledAt) return { ok: false, reason: 'disabled' };
		const updated = db
			.update(users)
			.set({ email: profile.email, avatarUrl: profile.picture })
			.where(eq(users.id, existing.id))
			.returning()
			.get();
		return { ok: true, user: updated, created: false };
	}

	if (!profile.emailVerified) return { ok: false, reason: 'unverified' };

	return db.transaction((tx) => {
		const email = profile.email.toLowerCase();
		const userCount = tx.select({ n: count() }).from(users).get()!.n;
		const becomesAdmin = ADMIN_EMAIL ? email === ADMIN_EMAIL : userCount === 0;

		let invite: Invite | undefined;
		if (!becomesAdmin) {
			if (!inviteCode) return { ok: false, reason: 'no-invite' } as const;
			invite = tx.select().from(invites).where(eq(invites.code, inviteCode)).get();
			const problem = inviteProblem(invite, email);
			if (problem) return { ok: false, reason: problem } as const;
		}

		const user = tx
			.insert(users)
			.values({
				id: randomId(),
				googleSub: profile.sub,
				email,
				handle: uniqueHandle(email),
				displayName: profile.name || email.split('@')[0],
				avatarUrl: profile.picture,
				role: becomesAdmin ? 'admin' : 'user'
			})
			.returning()
			.get();

		if (invite) {
			tx.update(invites)
				.set({ uses: sql`${invites.uses} + 1` })
				.where(eq(invites.id, invite.id))
				.run();
			tx.insert(inviteUses).values({ inviteId: invite.id, userId: user.id }).run();
		}

		return { ok: true, user, created: true } as const;
	});
}

export function createInvite(
	createdBy: string,
	options: { maxUses: number; expiresInDays: number | null; lockedEmail: string | null }
): Invite {
	return db
		.insert(invites)
		.values({
			id: randomId(),
			code: randomId(8),
			createdBy,
			maxUses: options.maxUses,
			expiresAt: options.expiresInDays ? new Date(Date.now() + options.expiresInDays * 86_400_000) : null,
			lockedEmail: options.lockedEmail?.toLowerCase() || null
		})
		.returning()
		.get();
}

export function revokeInvite(id: string): void {
	db.update(invites).set({ revokedAt: new Date() }).where(eq(invites.id, id)).run();
}

export function listInvites() {
	const rows = db
		.select({ invite: invites, creator: users.handle })
		.from(invites)
		.leftJoin(users, eq(invites.createdBy, users.id))
		.orderBy(desc(invites.createdAt))
		.all();
	const usedBy = db
		.select({ inviteId: inviteUses.inviteId, handle: users.handle })
		.from(inviteUses)
		.innerJoin(users, eq(inviteUses.userId, users.id))
		.all();
	return rows.map(({ invite, creator }) => ({
		...invite,
		creator,
		usedBy: usedBy.filter((use) => use.inviteId === invite.id).map((use) => use.handle)
	}));
}

export function listUsers() {
	return db.select().from(users).orderBy(users.createdAt).all();
}

export function setUserDisabled(userId: string, disabled: boolean): void {
	db.update(users)
		.set({ disabledAt: disabled ? new Date() : null })
		.where(and(eq(users.id, userId), eq(users.role, 'user')))
		.run();
}

/** Used by the dev-only sign-in to create local test accounts without Google. */
export function devProfile(name: string): GoogleProfile {
	const slug = name.toLowerCase().replace(/[^a-z0-9]/g, '') || 'dev';
	return { sub: `dev-${slug}`, email: `${slug}@dev.localhost`, emailVerified: true, name, picture: null };
}
