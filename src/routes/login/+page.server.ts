import { error, fail, redirect } from '@sveltejs/kit';
import { dev } from '$app/env';
import { devProfile, INVITE_PROBLEM_TEXT, signInWithGoogle, type InviteProblem } from '#lib/server/accounts.ts';
import { createSession, setSessionCookie } from '#lib/server/auth.ts';
import { googleConfigured } from '#lib/server/google.ts';
import type { Actions, PageServerLoad } from './$types';

const ERROR_TEXT: Record<string, string> = {
	...INVITE_PROBLEM_TEXT,
	'oauth-expired': 'The sign-in took too long. Please try again.',
	google: "Google sign-in didn't work. Please try again.",
	disabled: 'This account has been disabled. Ask the admin.',
	unverified: 'Your Google email address is not verified.'
};

export const load: PageServerLoad = ({ locals, url, cookies }) => {
	if (locals.user) redirect(302, '/');
	const code = url.searchParams.get('error');
	return {
		googleConfigured,
		devLogin: dev,
		needsInvite: code === 'no-invite' || code === 'wrong-email',
		deniedEmail: cookies.get('denied_email') ?? null,
		error: code ? (ERROR_TEXT[code as InviteProblem] ?? null) : null,
		hasInvite: Boolean(cookies.get('invite'))
	};
};

export const actions: Actions = {
	// Local development only: sign in as a named test account without Google.
	dev: async ({ request, cookies }) => {
		if (!dev) error(404);
		const name = String((await request.formData()).get('name') ?? '').trim();
		if (!name) return fail(400, { devError: 'Enter a name' });

		const result = signInWithGoogle(devProfile(name), cookies.get('invite'));
		if (!result.ok) return fail(403, { devError: ERROR_TEXT[result.reason] ?? 'You need an invite' });

		cookies.delete('invite', { path: '/' });
		const session = createSession(result.user.id);
		setSessionCookie(cookies, session.token, session.expiresAt);
		redirect(303, '/');
	}
};
