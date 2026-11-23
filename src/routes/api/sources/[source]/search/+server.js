import { json, error } from '@sveltejs/kit';
import { searchSource, SourceError } from '#lib/server/sources/index.js';

/** Search one source: `?q=words` (and `&whole=1` for complete works only). Responds with `{ results: [{ id, title, author, detail, url }] }`. */
export async function GET({ params, url, locals }) {
	if (!locals.user) error(401, 'Sign in to import texts');
	try {
		return json({ results: await searchSource(params.source, url.searchParams.get('q') ?? '', { wholeOnly: url.searchParams.get('whole') === '1' }) });
	} catch (err) {
		if (err instanceof SourceError) error(/** @type {any} */ (err.status), err.message);
		throw err;
	}
}
