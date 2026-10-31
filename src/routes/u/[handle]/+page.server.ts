import { error } from '@sveltejs/kit';
import { profile } from '#lib/server/sharing.ts';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = ({ params }) => {
	const result = profile(params.handle);
	if (!result) error(404, 'User not found');
	return { profile: { ...result.user, id: undefined, disabledAt: undefined }, lists: result.lists };
};
