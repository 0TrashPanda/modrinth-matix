import { redirect } from '@sveltejs/kit';
import { decodeIdToken } from 'arctic';
import { signInWithGoogle } from '#lib/server/accounts.ts';
import { createSession, setSessionCookie } from '#lib/server/auth.ts';
import { google } from '#lib/server/google.ts';
import type { RequestHandler } from './$types';

interface GoogleClaims {
	sub: string;
	email: string;
	email_verified?: boolean;
	name?: string;
	picture?: string;
}

export const GET: RequestHandler = async ({ cookies, url }) => {
	const code = url.searchParams.get('code');
	const state = url.searchParams.get('state');
	const storedState = cookies.get('google_oauth_state');
	const codeVerifier = cookies.get('google_code_verifier');
	cookies.delete('google_oauth_state', { path: '/' });
	cookies.delete('google_code_verifier', { path: '/' });

	if (!code || !state || !storedState || !codeVerifier || state !== storedState) {
		redirect(302, '/login?error=oauth-expired');
	}

	let claims: GoogleClaims;
	try {
		const tokens = await google(url.origin).validateAuthorizationCode(code, codeVerifier);
		claims = decodeIdToken(tokens.idToken()) as GoogleClaims;
	} catch {
		redirect(302, '/login?error=google');
	}

	const result = signInWithGoogle(
		{
			sub: claims.sub,
			email: claims.email,
			emailVerified: claims.email_verified === true,
			name: claims.name ?? '',
			picture: claims.picture ?? null
		},
		cookies.get('invite')
	);

	if (!result.ok) {
		// Shown on the "you need an invite" page; kept out of the URL.
		cookies.set('denied_email', claims.email, { path: '/', maxAge: 300, sameSite: 'lax' });
		redirect(302, `/login?error=${result.reason}`);
	}

	cookies.delete('invite', { path: '/' });
	const session = createSession(result.user.id);
	setSessionCookie(cookies, session.token, session.expiresAt);
	redirect(302, '/');
};
