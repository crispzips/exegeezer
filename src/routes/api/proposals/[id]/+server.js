import { error } from '@sveltejs/kit';
import { answer } from '#lib/server/consent.js';
import { bodyOf, reply, signedIn } from '#lib/server/reply.js';

/** Agree to a request, or decline (or withdraw) it: `{ agree }`. */
export async function POST({ params, request, locals }) {
	const uid = signedIn(locals);
	const body = await bodyOf(request);
	if (typeof body.agree !== 'boolean') error(400, 'Say whether you agree');
	return reply(await answer(uid, params.id, body.agree));
}
