import { json, error } from '@sveltejs/kit';
import { fetchSourceText, SourceError } from '#lib/server/sources/index.js';

/** One text from one source: `?id=<a result's id>`. Responds with `{ title, author, sourceName, sourceUrl, license, notes, markdown }`. */
export async function GET({ params, url, locals }) {
	if (!locals.user) error(401, 'Sign in to import texts');
	try {
		return json(await fetchSourceText(params.source, url.searchParams.get('id') ?? ''));
	} catch (err) {
		if (err instanceof SourceError) error(/** @type {any} */ (err.status), err.message);
		throw err;
	}
}
