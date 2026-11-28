import { json, error } from '@sveltejs/kit';
import { createGroup, groupsOf } from '#lib/server/circulation.js';
import { bodyOf, signedIn } from '#lib/server/reply.js';

/** The requester's groups. */
export async function GET({ locals }) {
	return json({ groups: await groupsOf(signedIn(locals)) });
}

/** Make a group: `{ name }`. */
export async function POST({ request, locals }) {
	const uid = signedIn(locals);
	const body = await bodyOf(request);
	if (!(await createGroup(uid, typeof body.name === 'string' ? body.name : ''))) error(400, 'Name the group');
	return json({ groups: await groupsOf(uid) });
}
