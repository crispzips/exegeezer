import { json, error } from '@sveltejs/kit';
import { wipeText } from '#lib/server/texts.js';
import { LOCKED_MESSAGE } from '#lib/textStatus.js';

/** Erase all of a text's content, keeping the text and its properties. */
export async function POST({ params, locals }) {
	if (!locals.user) error(401, 'Sign in to use your texts');
	const wiped = await wipeText(params.id, locals);
	if (wiped === 'locked') error(409, LOCKED_MESSAGE);
	if (!wiped) error(404, 'No such text');
	return json({ ok: true });
}
