import { json, error } from '@sveltejs/kit';
import { deleteGroup, groupsOf, setMember } from '#lib/server/circulation.js';
import { bodyOf, signedIn } from '#lib/server/reply.js';

/** Add a member to one of the requester's groups, or take one out: `{ userId, member }`. */
export async function PATCH({ params, request, locals }) {
	const uid = signedIn(locals);
	const body = await bodyOf(request);
	if (typeof body.userId !== 'string' || !(await setMember(uid, params.id, body.userId, body.member === true))) error(404, 'No such group or user');
	return json({ groups: await groupsOf(uid) });
}

/** Delete one of the requester's groups. */
export async function DELETE({ params, locals }) {
	const uid = signedIn(locals);
	if (!(await deleteGroup(uid, params.id))) error(404, 'No such group');
	return json({ groups: await groupsOf(uid) });
}
