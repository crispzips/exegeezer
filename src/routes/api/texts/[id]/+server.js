import { json, error } from '@sveltejs/kit';
import { isProductionStatus, isVisibility, loadText, parseItems, saveText } from '#lib/server/texts.js';

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
	if (!(await saveText(params.id, locals, items, title, status))) error(404, 'No such text');
	return json({ ok: true });
}
