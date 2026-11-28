import { propose } from '#lib/server/consent.js';
import { reply, signedIn } from '#lib/server/reply.js';

/** Erase all of a text's content, keeping the text itself. */
export async function POST({ params, locals }) {
	return reply(await propose(signedIn(locals), { action: 'wipe', textId: params.id }));
}
