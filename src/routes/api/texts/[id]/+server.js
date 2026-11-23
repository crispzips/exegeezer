import { json, error } from '@sveltejs/kit';
import { LOCKED_MESSAGE } from '#lib/textStatus.js';
import { deleteText, isProductionStatus, isRallyStyle, isVisibility, loadText, parseItems, saveText, setRallyStyle } from '#lib/server/texts.js';

/** A text with its paragraphs and sections arranged in order. */
export async function GET({ params, locals }) {
	if (!locals.user) error(401, 'Sign in to use your texts');
	const text = await loadText(params.id, locals);
	if (!text) error(404, 'No such text');
	return json(text);
}

/** Replace a text's contents with `{ title?, items, productionStatus?, visibility? }`. */
export async function PUT({ params, request, locals }) {
	if (!locals.user) error(401, 'Sign in to use your texts');
	const body = await request.json().catch(() => null);
	const items = parseItems(body?.items);
	if (!items) error(400, 'items must be a list of { id, text, level }');
	const title = typeof body.title === 'string' ? body.title.trim().slice(0, 200) : undefined;
	if (body.productionStatus !== undefined && !isProductionStatus(body.productionStatus)) error(400, 'invalid productionStatus');
	if (body.visibility !== undefined && !isVisibility(body.visibility)) error(400, 'invalid visibility');
	const status = {
		...(body.productionStatus !== undefined ? { productionStatus: body.productionStatus } : {}),
		...(body.visibility !== undefined ? { visibility: body.visibility } : {})
	};
	const saved = await saveText(params.id, locals, items, title, status);
	if (saved === 'locked') error(409, LOCKED_MESSAGE);
	if (!saved) error(404, 'No such text');
	return json({ ok: true });
}

/** Give a text its default rally type: `{ rallyStyle }`. */
export async function PATCH({ params, request, locals }) {
	if (!locals.user) error(401, 'Sign in to use your texts');
	const body = await request.json().catch(() => null);
	if (!isRallyStyle(body?.rallyStyle)) error(400, 'invalid rallyStyle');
	const set = await setRallyStyle(params.id, locals, body.rallyStyle);
	if (set === 'locked') error(409, LOCKED_MESSAGE);
	if (!set) error(404, 'No such text');
	return json({ ok: true });
}

/** Permanently delete a text. */
export async function DELETE({ params, locals }) {
	if (!locals.user) error(401, 'Sign in to use your texts');
	const result = await deleteText(params.id, locals);
	if (result === 'locked') error(409, LOCKED_MESSAGE);
	if (result === 'commented') error(409, "This text has commentaries, so it can't be deleted.");
	if (!result) error(404, 'No such text');
	return json({ ok: true });
}
