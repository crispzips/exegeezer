import { json, error } from '@sveltejs/kit';
import { wipeText } from '#lib/server/texts.js';

/** Erase all of a text's content, keeping the text and its properties. */
export async function POST({ params, locals }) {
	if (!locals.user) error(401, 'Sign in to use your texts');
	if (!(await wipeText(params.id, locals))) error(404, 'No such text');
	return json({ ok: true });
}
