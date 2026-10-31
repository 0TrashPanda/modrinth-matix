import { serializeText } from '#lib/core/text-format.ts';
import { requireList, resolveList } from '#lib/server/lists.ts';
import type { RequestHandler } from './$types';

/** Exports the list's actual mods; for a following list that's the base plus its changes. */
export const GET: RequestHandler = ({ params, locals, url }) => {
	const { list } = requireList(params.id, locals.user, 'view');
	const { content } = resolveList(list);

	const filename = list.name.replace(/[^a-z0-9._-]+/gi, '-').replace(/^-|-$/g, '') || 'modlist';
	if (url.searchParams.get('format') === 'json') {
		const body = JSON.stringify(
			{ name: list.name, description: list.description, loader: list.loader, includeSnapshots: list.includeSnapshots, content },
			null,
			2
		);
		return new Response(body, {
			headers: { 'Content-Type': 'application/json', 'Content-Disposition': `attachment; filename="${filename}.json"` }
		});
	}

	return new Response(`${serializeText(content)}\n`, {
		headers: { 'Content-Type': 'text/plain; charset=utf-8', 'Content-Disposition': `attachment; filename="${filename}.txt"` }
	});
};
