import { json, error } from '@sveltejs/kit';
import { authorOptions, loadTextProperties, updateTextProperties } from '#lib/server/texts.js';

/** A text's properties (not its content), with the authors it may be written as. */
export async function GET({ params, locals }) {
	if (!locals.user) error(401, 'Sign in to use your texts');
	const properties = await loadTextProperties(params.id, locals);
	if (!properties) error(404, 'No such text');
	return json({ ...properties, authorChoices: await authorOptions(params.id, locals) });
}

/** Change a text's properties: `{ title, personaId, productionStatus, visibility, commentPolicy }`. */
export async function PATCH({ params, request, locals }) {
	if (!locals.user) error(401, 'Sign in to use your texts');
	const body = await request.json().catch(() => null);
	const str = (/** @type {unknown} */ v) => (typeof v === 'string' ? v : '');
	const result = await updateTextProperties(params.id, locals, {
		title: str(body?.title).trim().slice(0, 200),
		personaIds: Array.isArray(body?.personaIds) ? body.personaIds.filter((/** @type {unknown} */ v) => typeof v === 'string') : [],
		productionStatus: str(body?.productionStatus),
		visibility: str(body?.visibility),
			commentPolicy: str(body?.commentPolicy)
	});
	if ('message' in result) return json({ message: result.message }, { status: result.status });
	return json({ ok: true });
}
