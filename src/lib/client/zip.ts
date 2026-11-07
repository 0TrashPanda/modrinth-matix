import { strToU8, unzipSync, Zip, ZipPassThrough, zipSync } from 'fflate';
import type { PackFile } from '#lib/core/mrpack.ts';

export interface ZipProgress {
	done: number;
	total: number;
	bytes: number;
}

export async function sha1Hex(data: Uint8Array): Promise<string> {
	const digest = await crypto.subtle.digest('SHA-1', data as Uint8Array<ArrayBuffer>);
	return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, '0')).join('');
}

/**
 * Downloads files straight from the platform's CDN into a zip built in the browser,
 * so the server never relays jars. Jars are already compressed, so entries are stored.
 */
export async function buildZip(files: PackFile[], onProgress: (progress: ZipProgress) => void): Promise<Blob> {
	const parts: Uint8Array[] = [];
	const zipped = new Promise<Blob>((resolve, reject) => {
		const zip = new Zip((error, chunk, final) => {
			if (error) return reject(error);
			parts.push(chunk);
			if (final) resolve(new Blob(parts as BlobPart[], { type: 'application/zip' }));
		});

		(async () => {
			const progress: ZipProgress = { done: 0, total: files.length, bytes: 0 };
			const names = new Set<string>();
			onProgress({ ...progress });

			// Four downloads at a time; entries are added as each finishes.
			const queue = [...files];
			await Promise.all(
				Array.from({ length: Math.min(4, queue.length) }, async () => {
					for (let item = queue.shift(); item; item = queue.shift()) {
						const { file, path } = item;
						const response = await fetch(file.url);
						if (!response.ok) throw new Error(`Download failed for ${file.filename} (${response.status})`);
						const data = new Uint8Array(await response.arrayBuffer());
						if (file.hashes.sha1 && (await sha1Hex(data)) !== file.hashes.sha1) {
							throw new Error(`Hash mismatch for ${file.filename}`);
						}

						let name = path;
						for (let n = 2; names.has(name); n++) name = path.replace(/([^/]+)$/, `${n}-$1`);
						names.add(name);

						const entry = new ZipPassThrough(name);
						zip.add(entry);
						entry.push(data, true);

						progress.done++;
						progress.bytes += data.byteLength;
						onProgress({ ...progress });
					}
				})
			);
			zip.end();
		})().catch(reject);
	});
	return zipped;
}

/** A small zip of text files, e.g. an .mrpack's index. */
export function textZip(files: Record<string, string>, type = 'application/zip'): Blob {
	const data = zipSync(Object.fromEntries(Object.entries(files).map(([name, text]) => [name, strToU8(text)])));
	return new Blob([data as BlobPart], { type });
}

export function readZip(data: Uint8Array): Record<string, Uint8Array> {
	return unzipSync(data);
}

export function saveBlob(blob: Blob, filename: string): void {
	const url = URL.createObjectURL(blob);
	const link = document.createElement('a');
	link.href = url;
	link.download = filename;
	link.click();
	setTimeout(() => URL.revokeObjectURL(url), 10_000);
}

export function formatBytes(bytes: number): string {
	if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
	return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}
