import type { Alternative, ModrinthProject, Pack, Side } from './types';

function works(value: string | undefined): boolean {
	return value === 'required' || value === 'optional';
}

/**
 * Modrinth's own answer. Unlike v1, `optional` counts as "works on that side":
 * client required + server unsupported is client, both optional is both.
 */
export function modrinthSide(project: Pick<ModrinthProject, 'client_side' | 'server_side'> | null): Side {
	if (!project) return 'unknown';
	const client = works(project.client_side);
	const server = works(project.server_side);
	if (client && server) return 'both';
	if (client) return 'client';
	if (server) return 'server';
	return 'unknown';
}

/** Order: forced override, then Modrinth, then fallback override if Modrinth doesn't know. */
export function resolveSide(
	project: Pick<ModrinthProject, 'client_side' | 'server_side'> | null,
	alternative: Pick<Alternative, 'sideMode' | 'side'>
): Side {
	if (alternative.sideMode === 'force' && alternative.side) return alternative.side;
	const fromModrinth = modrinthSide(project);
	if (fromModrinth === 'unknown' && alternative.sideMode === 'fallback' && alternative.side) {
		return alternative.side;
	}
	return fromModrinth;
}

/** `maybe` means the side is unknown: offered in both packs but not ticked by default. */
export function packMembership(side: Side, pack: Pack): 'yes' | 'no' | 'maybe' {
	if (side === 'unknown') return 'maybe';
	if (side === 'both' || side === pack) return 'yes';
	return 'no';
}

export const SIDE_LABEL: Record<Side, string> = {
	client: 'C',
	server: 'S',
	both: 'B',
	unknown: '?'
};

export const SIDE_TITLE: Record<Side, string> = {
	client: 'Client',
	server: 'Server',
	both: 'Client + server',
	unknown: 'Unknown side'
};
