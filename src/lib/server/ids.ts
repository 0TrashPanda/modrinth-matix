import { encodeBase32LowerCaseNoPadding } from '@oslojs/encoding';

export function randomId(bytes = 15): string {
	return encodeBase32LowerCaseNoPadding(crypto.getRandomValues(new Uint8Array(bytes)));
}
