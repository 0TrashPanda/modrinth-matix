import { error, json } from '@sveltejs/kit';
import * as v from 'valibot';
import { curseforgeEnabled, loadCurseforge } from '#lib/server/curseforge.ts';
import type { RequestHandler } from './$types';

const bodySchema = v.object({
	slugs: v.pipe(v.array(v.object({ slug: v.pipe(v.string(), v.maxLength(100)), projectType: v.pipe(v.string(), v.maxLength(20)) })), v.maxLength(500)),
	ids: v.pipe(v.array(v.pipe(v.number(), v.integer())), v.maxLength(500))
});

/** Signed-in users only, so the instance's API key isn't an open proxy. */
export const POST: RequestHandler = async ({ request, locals }) => {
	if (!curseforgeEnabled) error(404, 'CurseForge is not configured');
	if (!locals.user) error(401, 'Sign in to use CurseForge');
	const body = v.safeParse(bodySchema, await request.json());
	if (!body.success) error(400, 'Bad request');
	return json(await loadCurseforge(body.output.slugs, body.output.ids));
};
