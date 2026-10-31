import { error } from '@sveltejs/kit';
import type { Handle } from '@sveltejs/kit/hooks';
import { clearSessionCookie, SESSION_COOKIE, setSessionCookie, validateSession } from '#lib/server/auth.ts';
import { RateLimiter } from '#lib/server/rate-limit.ts';

// Sign-in and invite pages are public, so limit how fast one address can hit them.
const authLimiter = new RateLimiter(30, 60_000);

export const handle: Handle = async ({ event, resolve }) => {
	const path = event.url.pathname;
	if (path.startsWith('/login') || path.startsWith('/invite')) {
		if (!authLimiter.allow(event.getClientAddress())) error(429, 'Too many requests. Try again in a minute.');
	}

	const token = event.cookies.get(SESSION_COOKIE);
	event.locals.user = null;
	if (token) {
		const session = validateSession(token);
		if (session) {
			event.locals.user = session.user;
			setSessionCookie(event.cookies, token, session.expiresAt);
		} else {
			clearSessionCookie(event.cookies);
		}
	}

	return resolve(event);
};
