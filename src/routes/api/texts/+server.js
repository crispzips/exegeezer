import { json, error } from '@sveltejs/kit';
import { createText, isRallyStyle, isVisibility, listTexts, parseItems } from '#lib/server/texts.js';

/** The requester's texts, most recently changed first. */
export async function GET({ locals }) {
	if (!locals.user) error(401, 'Sign in to use your texts');
	return json(await listTexts(locals));
}

/** Create a text from `{ title?, visibility, items }` (visibility is required: 'private' or 'public'; it starts as a draft); responds with its id. `rallyStyle` (optional) is its default rally type. */
export async function POST({ request, locals }) {
	if (!locals.user) error(401, 'Sign in to use your texts');
	const body = await request.json().catch(() => null);
	const items = parseItems(body?.items);
	if (!items) error(400, 'items must be a list of { id, text, level }');
	if (!isVisibility(body.visibility)) error(400, "visibility must be 'private' or 'public'");
	// an empty title is allowed (a text seeded from another starts untitled); none sent means 'Untitled'
	const title = typeof body.title === 'string' ? body.title.trim().slice(0, 200) : undefined;
	return json({ id: await createText(locals, title, items, body.visibility, isRallyStyle(body.rallyStyle) ? body.rallyStyle : null) }, { status: 201 });
}
