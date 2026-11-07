import { defineConfig } from 'vitest/config';
import adapter from '@sveltejs/adapter-node';
import { sveltekit } from '@sveltejs/kit/vite';

export default defineConfig({
	plugins: [
		sveltekit({
			compilerOptions: {
				// Force runes mode for the project, except for libraries. Can be removed in svelte 6.
				runes: ({ filename }) =>
					filename.split(/[/\\]/).includes('node_modules') ? undefined : true
			},
			adapter: adapter(),
			csp: {
				mode: 'auto',
				directives: {
					'default-src': ['self'],
					// Modrinth is called from the browser; jars are fetched from its CDN for zips.
					// CurseForge metadata goes through the server; its files come from its CDN.
					'connect-src': [
						'self',
						'https://api.modrinth.com',
						'https://cdn.modrinth.com',
						'https://edge.forgecdn.net',
						'https://mediafilez.forgecdn.net'
					],
					'img-src': ['self', 'data:', 'https://cdn.modrinth.com', 'https://media.forgecdn.net', 'https://*.googleusercontent.com'],
					'style-src': ['self', 'unsafe-inline'],
					'script-src': ['self'],
					'object-src': ['none'],
					'base-uri': ['self'],
					'frame-ancestors': ['none'],
					'form-action': ['self', 'https://accounts.google.com']
				}
			}
		})
	],
	test: {
		expect: { requireAssertions: true },
		projects: [
			{
				extends: './vite.config.ts',
				test: {
					name: 'server',
					environment: 'node',
					include: ['src/**/*.{test,spec}.{js,ts}'],
					exclude: ['src/**/*.svelte.{test,spec}.{js,ts}']
				}
			}
		]
	}
});
