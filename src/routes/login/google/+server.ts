import { error, redirect } from '@sveltejs/kit';
import { generateCodeVerifier, generateState } from 'arctic';
import { google, googleConfigured } from '#lib/server/google.ts';
import type { RequestHandler } from './$types';

export const GET: RequestHandler = ({ cookies, url }) => {
	if (!googleConfigured) error(503, 'Google sign-in is not configured on this server');

	const state = generateState();
	const codeVerifier = generateCodeVerifier();
	const authUrl = google(url.origin).createAuthorizationURL(state, codeVerifier, ['openid', 'profile', 'email']);
	authUrl.searchParams.set('prompt', 'select_account');

	const options = { path: '/', maxAge: 600, sameSite: 'lax' } as const;
	cookies.set('google_oauth_state', state, options);
	cookies.set('google_code_verifier', codeVerifier, options);

	redirect(302, authUrl);
};
