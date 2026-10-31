import { sha256 } from '@oslojs/crypto/sha2';
import { encodeHexLowerCase } from '@oslojs/encoding';
import type { Cookies } from '@sveltejs/kit';
import { eq } from 'drizzle-orm';
import { db } from './db';
import { sessions, users, type User } from './db/schema';
import { randomId } from './ids';

const DAY = 24 * 60 * 60 * 1000;
const SESSION_LENGTH = 30 * DAY;
const RENEW_BEFORE = 15 * DAY;

export const SESSION_COOKIE = 'session';

export type SessionUser = Pick<User, 'id' | 'email' | 'handle' | 'displayName' | 'avatarUrl' | 'role' | 'inviteQuota'>;

function hashToken(token: string): string {
	return encodeHexLowerCase(sha256(new TextEncoder().encode(token)));
}

export function createSession(userId: string): { token: string; expiresAt: Date } {
	const token = randomId(20);
	const expiresAt = new Date(Date.now() + SESSION_LENGTH);
	db.insert(sessions).values({ id: hashToken(token), userId, expiresAt }).run();
	return { token, expiresAt };
}

/** Returns the user for a session token, renewing the session when it's past halfway. */
export function validateSession(token: string): { user: SessionUser; expiresAt: Date } | null {
	const id = hashToken(token);
	const row = db
		.select({ session: sessions, user: users })
		.from(sessions)
		.innerJoin(users, eq(sessions.userId, users.id))
		.where(eq(sessions.id, id))
		.get();
	if (!row) return null;

	if (Date.now() >= row.session.expiresAt.getTime() || row.user.disabledAt) {
		db.delete(sessions).where(eq(sessions.id, id)).run();
		return null;
	}

	let expiresAt = row.session.expiresAt;
	if (expiresAt.getTime() - Date.now() < RENEW_BEFORE) {
		expiresAt = new Date(Date.now() + SESSION_LENGTH);
		db.update(sessions).set({ expiresAt }).where(eq(sessions.id, id)).run();
	}

	const { id: userId, email, handle, displayName, avatarUrl, role, inviteQuota } = row.user;
	return { user: { id: userId, email, handle, displayName, avatarUrl, role, inviteQuota }, expiresAt };
}

export function invalidateSession(token: string): void {
	db.delete(sessions).where(eq(sessions.id, hashToken(token))).run();
}

export function invalidateUserSessions(userId: string): void {
	db.delete(sessions).where(eq(sessions.userId, userId)).run();
}

export function setSessionCookie(cookies: Cookies, token: string, expiresAt: Date): void {
	cookies.set(SESSION_COOKIE, token, { path: '/', sameSite: 'lax', expires: expiresAt });
}

export function clearSessionCookie(cookies: Cookies): void {
	cookies.delete(SESSION_COOKIE, { path: '/' });
}
