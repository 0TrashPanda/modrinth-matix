import type { Loader, ModrinthFile, Pack } from './types';

/** Folder a project's file goes in, in a pack zip and in an .mrpack. */
export function folderFor(projectType: string): string {
	switch (projectType) {
		case 'resourcepack':
			return 'resourcepacks';
		case 'shader':
			return 'shaderpacks';
		case 'datapack':
			return 'datapacks';
		default:
			return 'mods';
	}
}

export interface PackFile {
	file: ModrinthFile;
	path: string;
}

export interface MrpackEntry {
	file: ModrinthFile;
	projectType: string;
	/** Which packs the file was ticked in. */
	packs: Set<Pack>;
}

const LOADER_KEYS: Record<Loader, string> = {
	fabric: 'fabric-loader',
	quilt: 'quilt-loader',
	forge: 'forge',
	neoforge: 'neoforge'
};

/**
 * The modrinth.index.json of an .mrpack (format 1). A file ticked in only one pack is
 * required on that side and unsupported on the other.
 */
export function buildMrpackIndex(options: {
	name: string;
	summary?: string;
	gameVersion: string;
	loader: Loader;
	loaderVersion: string | null;
	entries: MrpackEntry[];
}) {
	const dependencies: Record<string, string> = { minecraft: options.gameVersion };
	if (options.loaderVersion) dependencies[LOADER_KEYS[options.loader]] = options.loaderVersion;

	return {
		formatVersion: 1,
		game: 'minecraft',
		versionId: '1.0.0',
		name: options.name,
		...(options.summary ? { summary: options.summary } : {}),
		files: options.entries.map(({ file, projectType, packs }) => ({
			path: `${folderFor(projectType)}/${file.filename}`,
			hashes: { sha1: file.hashes.sha1 ?? '', sha512: file.hashes.sha512 ?? '' },
			env: {
				client: packs.has('client') ? 'required' : 'unsupported',
				server: packs.has('server') ? 'required' : 'unsupported'
			},
			downloads: [file.url],
			fileSize: file.size
		})),
		dependencies
	};
}

/** A shell script that downloads the files into their folders and checks their SHA-1. */
export function downloadScript(files: PackFile[], shell: 'bash' | 'powershell'): string {
	if (shell === 'bash') {
		const lines = ['#!/usr/bin/env bash', '# Downloads the pack into the current folder and checks each file.', 'set -euo pipefail', ''];
		for (const { file, path } of files) {
			lines.push(`mkdir -p "${path.split('/')[0]}"`);
			lines.push(`curl -fsSL -o "${path}" "${file.url}"`);
			if (file.hashes.sha1) lines.push(`echo "${file.hashes.sha1}  ${path}" | sha1sum -c --quiet`);
		}
		lines.push('', `echo "Downloaded ${files.length} files."`);
		return `${lines.join('\n')}\n`;
	}

	const lines = ['# Downloads the pack into the current folder and checks each file.', '$ErrorActionPreference = "Stop"', ''];
	for (const { file, path } of files) {
		const winPath = path.replaceAll('/', '\\');
		lines.push(`New-Item -ItemType Directory -Force "${winPath.split('\\')[0]}" | Out-Null`);
		lines.push(`Invoke-WebRequest -Uri "${file.url}" -OutFile "${winPath}"`);
		if (file.hashes.sha1) {
			lines.push(`if ((Get-FileHash "${winPath}" -Algorithm SHA1).Hash -ne "${file.hashes.sha1}") { throw "Hash mismatch: ${winPath}" }`);
		}
	}
	lines.push('', `Write-Host "Downloaded ${files.length} files."`);
	return `${lines.join('\r\n')}\r\n`;
}
