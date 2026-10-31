import * as v from 'valibot';
import { parseText, type ParseWarning } from '#lib/core/text-format.ts';
import type { ListContent } from '#lib/core/types.ts';
import { settingsSchema, type ListSettingsInput } from './lists';

export type ListFormResult =
	| { ok: true; settings: ListSettingsInput; content: ListContent; warnings: ParseWarning[] }
	| { ok: false; error: string };

/** Reads the shared fields of the new-list and edit forms. */
export function readListForm(form: FormData, follows: boolean): ListFormResult {
	const settings = v.safeParse(settingsSchema, {
		name: String(form.get('name') ?? ''),
		description: String(form.get('description') ?? ''),
		loader: String(form.get('loader') ?? ''),
		includeSnapshots: form.get('includeSnapshots') === 'on'
	});
	if (!settings.success) return { ok: false, error: settings.issues[0].message };

	const text = String(form.get('text') ?? '');
	if (text.length > 200_000) return { ok: false, error: 'The list is too long' };
	const { content, warnings } = parseText(text);
	if (content.entries.length > 1000) return { ok: false, error: 'Lists can have at most 1000 entries' };
	if (!follows && content.removals) {
		return { ok: false, error: "Lines starting with '-' only work in a list that follows another list" };
	}

	return { ok: true, settings: settings.output, content, warnings };
}
