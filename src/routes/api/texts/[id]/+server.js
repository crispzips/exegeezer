import { json, error } from '@sveltejs/kit';
import { LOCKED_MESSAGE, PUBLIC_MEMORY_MESSAGE, isPermanent } from '#lib/textStatus.js';
import { isRallyStyle, loadText, parseImportedDetails, parseItems, saveText, setRallyStyle } from '#lib/server/texts.js';
import { standing } from '#lib/server/access.js';
import { propose } from '#lib/server/consent.js';
import { reply, signedIn } from '#lib/server/reply.js';

/** A text with its paragraphs and sections arranged in order, as the requester may read it. */
export async function GET({ params, locals }) {
	signedIn(locals);
	const text = await loadText(params.id, locals);
	if (!text) error(404, 'No such text');
	return json(text);
}

/** Replace a text's contents with `{ items, addImportedDetails? }` (addImportedDetails: details of texts just imported into it, added to its own). Its settings change through `properties`. */
export async function PUT({ params, request, locals }) {
	signedIn(locals);
	const body = await request.json().catch(() => null);
	const items = parseItems(body?.items);
	if (!items) error(400, 'items must be a list of { id, text, level }');
	const addDetails = parseImportedDetails(body.addImportedDetails);
	if (!addDetails) error(400, 'addImportedDetails must be a list of entries with short text fields');
	const saved = await saveText(params.id, locals, items, addDetails);
	if (saved === 'locked') error(409, LOCKED_MESSAGE);
	if (saved === 'memory') error(409, PUBLIC_MEMORY_MESSAGE);
	if (saved === 'foreign') error(400, "Some of that content belongs to someone else's text");
	if (!saved) error(404, 'No such text');
	return json({ ok: true });
}

/** Give a text its default rally type: `{ rallyStyle }`. */
export async function PATCH({ params, request, locals }) {
	signedIn(locals);
	const body = await request.json().catch(() => null);
	if (!isRallyStyle(body?.rallyStyle)) error(400, 'invalid rallyStyle');
	const set = await setRallyStyle(params.id, locals, body.rallyStyle);
	if (set === 'locked') error(409, LOCKED_MESSAGE);
	if (!set) error(404, 'No such text');
	return json({ ok: true });
}

/** Delete a text that was never published: everything of it is burned, commentaries too. A publication can only be repressed. */
export async function DELETE({ params, locals }) {
	const uid = signedIn(locals);
	const s = await standing(uid, params.id);
	if (!s?.read) error(404, 'No such text');
	if (isPermanent(s.row)) error(409, LOCKED_MESSAGE);
	return reply(await propose(uid, { action: 'burn', textId: params.id }));
}
