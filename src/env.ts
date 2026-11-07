import { defineEnvVars } from '@sveltejs/kit/env';

const optional = (value: string | undefined) => (value ? value : undefined);

export const variables = defineEnvVars({
	DATABASE_URL: {
		description: 'Path to the SQLite database file.',
		schema: (value) => value || 'data/app.db'
	},
	GOOGLE_CLIENT_ID: {
		description: 'OAuth client ID from the Google Cloud console. Sign-in is disabled without it.',
		schema: optional
	},
	GOOGLE_CLIENT_SECRET: {
		description: 'OAuth client secret from the Google Cloud console.',
		schema: optional
	},
	CURSEFORGE_API_KEY: {
		description: 'CurseForge API key (console.curseforge.com). CurseForge support is hidden without it.',
		schema: optional
	},
	ADMIN_EMAIL: {
		description:
			'Google account that becomes admin on first sign-in, without an invite. If unset, the first account to sign in becomes admin.',
		schema: (value) => optional(value)?.toLowerCase()
	}
});
