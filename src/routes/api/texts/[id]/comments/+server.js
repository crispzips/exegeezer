import { json, error } from '@sveltejs/kit';
import { addComment, editComment, listComments } from '#lib/server/texts.js';

/** The comments on this text. */
export async function GET({ params, locals }) {
	if (!locals.user) error(401, 'Sign in to read comments');
	const comments = await listComments(params.id, locals);
	if (!comments) error(404, 'No such text');
	return json({ comments });
}

/** Change one of the requester's comments on this text: `{ commentId, body }`. */
export async function PATCH({ params, request, locals }) {
	if (!locals.user) error(401, 'Sign in to comment');
	const body = await request.json().catch(() => null);
	const str = (/** @type {unknown} */ v) => (typeof v === 'string' ? v : '');
	const result = await editComment(params.id, locals, str(body?.commentId), str(body?.body));
	if (!result.ok) return json({ message: result.message }, { status: result.status });
	return json({ commentaryId: result.commentaryId });
}

/** Leave a comment on paragraphs of this text: `{ paragraphIds, body }`. The first one creates the requester's commentary on the text. */
export async function POST({ params, request, locals }) {
	if (!locals.user) error(401, 'Sign in to comment');
	const body = await request.json().catch(() => null);
	const str = (/** @type {unknown} */ v) => (typeof v === 'string' ? v : '');
	const ids = Array.isArray(body?.paragraphIds) ? body.paragraphIds.map(str) : [];
	const result = await addComment(params.id, locals, ids, str(body?.body));
	if (!result.ok) return json({ message: result.message }, { status: result.status });
	return json({ commentaryId: result.commentaryId, commentId: result.commentId }, { status: result.created ? 201 : 200 });
}
