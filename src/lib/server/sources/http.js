/** Shared plumbing for the open-access text sources: a polite, bounded fetch. */

/** @type {Promise<string> | undefined} */
let contact;

/**
 * The operator contact (an email or web address) from the optional SOURCES_CONTACT variable.
 * Wikimedia throttles automated clients that do not give one. (Imported lazily so these modules
 * can also be run outside SvelteKit, where the process environment is read instead.)
 */
export function getContact() {
	contact ??= import('$app/env/private').then(
		(env) => String(/** @type {any} */ (env).SOURCES_CONTACT ?? ''),
		() => process.env.SOURCES_CONTACT ?? ''
	);
	return contact;
}

/** Identifies us to the sources' operators. */
export async function getUserAgent() {
	const c = (await getContact()).trim();
	return `Exegeezer/0.1 (open-access text importer${c ? `; ${c}` : ''})`;
}

/** An error that can be shown to the user, with the HTTP status the API route should answer with. */
export class SourceError extends Error {
	/** @param {number} status @param {string} message */
	constructor(status, message) {
		super(message);
		this.status = status;
	}
}

/**
 * Fetch from a source, with a time limit and a size limit.
 * @param {string} url
 * @param {{ as?: 'json' | 'text', timeoutMs?: number, maxBytes?: number, label?: string }} [options]
 * @returns {Promise<any>}
 */
export async function fetchSource(url, { as = 'json', timeoutMs = 20000, maxBytes = 12_000_000, label = 'The source' } = {}) {
	const headers = { 'User-Agent': await getUserAgent(), Accept: as === 'json' ? 'application/json' : 'text/plain, text/html;q=0.8, */*;q=0.5' };
	let res;
	// one polite retry when the source says to slow down, or stumbles (some answer 500 now and then)
	for (let attempt = 0; attempt < 2; attempt++) {
		try {
			res = await fetch(url, { headers, signal: AbortSignal.timeout(timeoutMs) });
		} catch {
			throw new SourceError(504, `${label} did not answer in time. Try again in a moment.`);
		}
		if ((res.status !== 429 && res.status < 500) || attempt) break;
		const wait = Number(res.headers.get('retry-after'));
		await sleep(Math.min(Number.isFinite(wait) && wait > 0 ? wait * 1000 : 2000, 6000));
	}
	if (!res) throw new SourceError(504, `${label} did not answer.`);
	if (res.status === 401 || res.status === 403) throw new SourceError(403, `${label} does not allow that text to be downloaded (it may be lending-only).`);
	if (res.status === 404) throw new SourceError(404, `${label} has no such text.`);
	if (res.status === 429) throw new SourceError(429, `${label} is asking us to slow down. Try again shortly.`);
	if (!res.ok) throw new SourceError(502, `${label} answered with an error (${res.status}).`);

	const declared = Number(res.headers.get('content-length'));
	if (declared > maxBytes) throw new SourceError(413, 'That text is too large to import.');
	const reader = res.body?.getReader();
	if (!reader) return as === 'json' ? res.json() : res.text();
	const chunks = [];
	let size = 0;
	for (;;) {
		const { done, value } = await reader.read();
		if (done) break;
		size += value.length;
		if (size > maxBytes) {
			await reader.cancel();
			throw new SourceError(413, 'That text is too large to import.');
		}
		chunks.push(value);
	}
	const body = Buffer.concat(chunks).toString('utf8');
	if (as === 'text') return body;
	try {
		return JSON.parse(body);
	} catch {
		throw new SourceError(502, `${label} sent something that was not understood.`);
	}
}

/** @param {number} ms */
export const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
