import { error } from '@sveltejs/kit';
import { propose } from '#lib/server/consent.js';
import { bodyOf, reply, signedIn } from '#lib/server/reply.js';

/** Mark a whole commentary public or private: `{ public }`. What has entered public memory stays public. */
export async function POST({ params, request, locals }) {
	const uid = signedIn(locals);
	const body = await bodyOf(request);
	if (typeof body.public !== 'boolean') error(400, 'Say whether it is public');
	return reply(await propose(uid, { action: 'mark', textId: params.id, payload: { public: body.public } }));
}
