import { json, error } from '@sveltejs/kit';
import { textHead } from '#lib/server/head.js';
import { signedIn } from '#lib/server/reply.js';

/** A text's head (its metadata), and what the requester is to it. */
export async function GET({ params, locals }) {
	signedIn(locals);
	const head = await textHead(params.id, locals);
	if (!head) error(404, 'No such text');
	return json(head);
}
