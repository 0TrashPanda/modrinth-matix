import { error, json } from '@sveltejs/kit';
import { LOADERS, type Loader } from '#lib/core/types.ts';
import { loaderVersion } from '#lib/server/loaders.ts';
import type { RequestHandler } from './$types';

export const GET: RequestHandler = async ({ url }) => {
	const loader = url.searchParams.get('loader') as Loader;
	const gameVersion = url.searchParams.get('gameVersion') ?? '';
	if (!LOADERS.includes(loader) || !/^[\w.-]{1,40}$/.test(gameVersion)) error(400, 'Bad loader or game version');
	return json({ version: await loaderVersion(loader, gameVersion) }, { headers: { 'Cache-Control': 'public, max-age=3600' } });
};
