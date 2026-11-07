import { error, json } from '@sveltejs/kit';
import { curseforgeEnabled, searchCurseforge } from '#lib/server/curseforge.ts';
import type { RequestHandler } from './$types';

export const GET: RequestHandler = async ({ url, locals }) => {
	if (!curseforgeEnabled) error(404, 'CurseForge is not configured');
	if (!locals.user) error(401, 'Sign in to use CurseForge');
	const query = (url.searchParams.get('q') ?? '').slice(0, 100);
	const type = url.searchParams.get('type') ?? 'mod';
	const loader = url.searchParams.get('loader');
	if (!query.trim()) return json([]);
	return json(await searchCurseforge(query, type, loader));
};
