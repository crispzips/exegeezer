import { json, error } from '@sveltejs/kit';
import { addComment } from '#lib/server/texts.js';

/** Leave a comment on a paragraph of this text: `{ paragraphId, body }`. The first one creates the requester's commentary on the text. */
export async function POST({ params, request, locals }) {
	if (!locals.user) error(401, 'Sign in to comment');
	const body = await request.json().catch(() => null);
	const str = (/** @type {unknown} */ v) => (typeof v === 'string' ? v : '');
	const result = await addComment(params.id, locals, str(body?.paragraphId), str(body?.body));
	if (!result.ok) return json({ message: result.message }, { status: result.status });
	return json({ commentaryId: result.commentaryId, commentId: result.commentId }, { status: result.created ? 201 : 200 });
}
