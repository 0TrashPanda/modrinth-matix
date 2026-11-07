import { getProjectsMeta, versionsByHash } from './modrinth';
import { readZip, sha1Hex } from './zip';

export interface ImportResult {
	/** Lines in the list text format, ready to append. */
	lines: string[];
	/** Files Modrinth didn't recognise. */
	unknown: string[];
	/** Text files (.txt/.csv) read as-is. */
	text: string[];
}

interface HashedFile {
	name: string;
	sha1: string;
}

/**
 * Turns dropped files into list lines. Text lists are passed through; an .mrpack is read
 * from its index (plus any jars in its overrides); jars and other archives are hashed in
 * the browser and looked up on Modrinth. Nothing is uploaded to the server.
 */
export async function importFiles(files: File[]): Promise<ImportResult> {
	const result: ImportResult = { lines: [], unknown: [], text: [] };
	const hashed: HashedFile[] = [];

	for (const file of files) {
		const lower = file.name.toLowerCase();
		if (lower.endsWith('.txt') || lower.endsWith('.csv')) {
			result.text.push(await file.text());
			continue;
		}
		const data = new Uint8Array(await file.arrayBuffer());
		if (lower.endsWith('.mrpack')) {
			const entries = readZip(data);
			const index = entries['modrinth.index.json'];
			if (!index) {
				result.unknown.push(`${file.name} (no modrinth.index.json)`);
				continue;
			}
			const parsed = JSON.parse(new TextDecoder().decode(index)) as { files: { path: string; hashes: { sha1: string } }[] };
			for (const entry of parsed.files) hashed.push({ name: entry.path, sha1: entry.hashes.sha1 });
			for (const [path, content] of Object.entries(entries)) {
				if (/^(client-|server-)?overrides\/.+\.(jar|zip)$/i.test(path)) hashed.push({ name: path, sha1: await sha1Hex(content) });
			}
			continue;
		}
		hashed.push({ name: file.name, sha1: await sha1Hex(data) });
	}

	if (hashed.length === 0) return result;

	const versions = await versionsByHash(hashed.map((file) => file.sha1));
	const projectIds = [...new Set([...versions.values()].map((version) => version.project_id))];
	const projects = await getProjectsMeta(projectIds);
	const seen = new Set<string>();

	for (const file of hashed) {
		const version = versions.get(file.sha1);
		const project = version ? projects.get(version.project_id.toLowerCase()) : undefined;
		if (!project) {
			result.unknown.push(file.name);
			continue;
		}
		if (seen.has(project.id)) continue;
		seen.add(project.id);
		result.lines.push(`https://modrinth.com/${project.project_type}/${project.slug}`);
	}
	return result;
}
