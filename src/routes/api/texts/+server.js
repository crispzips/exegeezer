import { json, error } from '@sveltejs/kit';
import { createText, listTexts, parseItems } from '#lib/server/texts.js';

/** The requester's texts, most recently changed first. */
export async function GET({ locals }) {
	if (!locals.user) error(401, 'Sign in to use your texts');
	return json(await listTexts(locals));
}

/** Create a text from `{ title?, items }`; responds with its id. */
export async function POST({ request, locals }) {
	if (!locals.user) error(401, 'Sign in to use your texts');
	const body = await request.json().catch(() => null);
	const items = parseItems(body?.items);
	if (!items) error(400, 'items must be a list of { id, text, level }');
	const title = typeof body.title === 'string' ? body.title.trim().slice(0, 200) : '';
	return json({ id: await createText(locals, title, items) }, { status: 201 });
}
