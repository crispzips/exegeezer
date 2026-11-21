import { json, error } from '@sveltejs/kit';
import { duplicateText } from '#lib/server/texts.js';

/** Copy a text into a new one called COPYOF--<title>; responds with the copy's id. */
export async function POST({ params, locals }) {
	if (!locals.user) error(401, 'Sign in to use your texts');
	const id = await duplicateText(params.id, locals);
	if (!id) error(404, 'No such text');
	return json({ id }, { status: 201 });
}
