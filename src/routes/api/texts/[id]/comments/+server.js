import { json, error } from '@sveltejs/kit';
import { addComment, deleteComment, editComment, listComments, ownComment } from '#lib/server/texts.js';
import { propose } from '#lib/server/consent.js';
import { bodyOf, reply, signedIn } from '#lib/server/reply.js';

const str = (/** @type {unknown} */ v) => (typeof v === 'string' ? v : '');

/** The comments on this text that the requester may see. */
export async function GET({ params, locals }) {
	if (!locals.user) error(401, 'Sign in to read comments');
	const comments = await listComments(params.id, locals);
	if (!comments) error(404, 'No such text');
	return json({ comments });
}

/** Change one of the requester's comments on this text: `{ commentId, body }`, or mark it with `{ commentId, public }`. */
export async function PATCH({ params, request, locals }) {
	const uid = signedIn(locals);
	const body = await bodyOf(request);
	if (typeof body.public === 'boolean') {
		const own = await ownComment(params.id, locals, str(body.commentId));
		if (!own.ok) return json({ message: own.message }, { status: own.status });
		return reply(await propose(uid, { action: 'mark', textId: own.commentaryId, payload: { public: body.public, paragraphIds: [own.paragraphId] } }));
	}
	const result = await editComment(params.id, locals, str(body.commentId), str(body.body));
	if (!result.ok) return json({ message: result.message }, { status: result.status });
	return json({ commentaryId: result.commentaryId });
}

/** Delete one of the requester's comments on this text: `{ commentId }`. */
export async function DELETE({ params, request, locals }) {
	signedIn(locals);
	const body = await bodyOf(request);
	const result = await deleteComment(params.id, locals, str(body.commentId));
	if (!result.ok) return json({ message: result.message }, { status: result.status });
	return json({ commentaryId: result.commentaryId });
}

/** Leave a comment on paragraphs of this text: `{ paragraphIds, body, public? }`. The first one creates the requester's commentary on the text. */
export async function POST({ params, request, locals }) {
	signedIn(locals);
	const body = await bodyOf(request);
	const ids = Array.isArray(body.paragraphIds) ? body.paragraphIds.map(str) : [];
	const result = await addComment(params.id, locals, ids, str(body.body), body.public === true);
	if (!result.ok) return json({ message: result.message }, { status: result.status });
	return json({ commentaryId: result.commentaryId, commentId: result.commentId }, { status: result.created ? 201 : 200 });
}
