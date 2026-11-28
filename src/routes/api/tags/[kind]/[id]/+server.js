import { json, error } from '@sveltejs/kit';
import { addTag, globalCredits, placeFor, removeTag, tagsOn } from '#lib/server/tags.js';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** The signed-in user and the work named, if they may tag it. */
async function work({ params, locals }) {
	if (!locals.user) error(401, 'Sign in to use tags');
	const { kind, id } = params;
	if ((kind !== 'text' && kind !== 'persona') || !UUID.test(id)) error(404, 'No such thing to tag');
	const userId = locals.user.id;
	if (!(await placeFor(userId, kind, id))) error(404, 'No such thing to tag');
	return /** @type {const} */ ([userId, kind, id]);
}

/**
 * What every request answers with: the user's tags for the work (an owner's: the work's own; anyone else's: those in
 * their commentary on it), and the global sets' credits.
 */
async function state(userId, kind, id) {
	const holder = (await placeFor(userId, kind, id))?.holder;
	return json({ tags: holder ? await tagsOn(kind, holder) : [], credits: await globalCredits() });
}

/** The request's body as a choice of tag: `{ tagId?, name? }`. */
async function choice(request) {
	const body = await request.json().catch(() => null);
	const tagId = typeof body?.tagId === 'string' && UUID.test(body.tagId) ? body.tagId : null;
	const name = typeof body?.name === 'string' ? body.name.slice(0, 200) : '';
	return { tagId, name };
}

export async function GET(event) {
	return state(...(await work(event)));
}

/** Apply a tag: one picked (`tagId`) or one typed (`name`). */
export async function POST(event) {
	const target = await work(event);
	if (!(await addTag(...target, await choice(event.request)))) error(400, 'Could not add the tag');
	return state(...target);
}

/** Take a tag off: `{ tagId }`. */
export async function DELETE(event) {
	const target = await work(event);
	const { tagId } = await choice(event.request);
	if (!tagId) error(400, 'No such tag');
	await removeTag(...target, tagId);
	return state(...target);
}
