import { json, error } from '@sveltejs/kit';
import { authorOptions, loadTextProperties } from '#lib/server/texts.js';
import { changeProperties } from '#lib/server/properties.js';
import { groupsOf, namePersonae, nameShares } from '#lib/server/circulation.js';
import { bodyOf, reply, signedIn } from '#lib/server/reply.js';

/** A text's properties (not its content), with the authors it may be written as, its editors and whom it is circulated to (named), and the requester's groups. */
export async function GET({ params, locals }) {
	const uid = signedIn(locals);
	const properties = await loadTextProperties(params.id, locals);
	if (!properties) error(404, 'No such text');
	return json({
		...properties,
		authorChoices: await authorOptions(params.id, locals),
		editorNames: await namePersonae(properties.editorIds),
		shares: await nameShares(properties.shares),
		groups: await groupsOf(uid)
	});
}

/** Change a text's properties: any of `{ title, description, personaIds, editorIds, productionStatus, visibility, commentPolicy, shares }`. */
export async function PATCH({ params, request, locals }) {
	signedIn(locals);
	return reply(await changeProperties(params.id, locals, await bodyOf(request)));
}
