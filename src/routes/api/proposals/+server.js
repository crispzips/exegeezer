import { json } from '@sveltejs/kit';
import { proposalsFor } from '#lib/server/consent.js';
import { signedIn } from '#lib/server/reply.js';

/** What is waiting for agreement that concerns the requester. */
export async function GET({ locals }) {
	return json({ proposals: await proposalsFor(signedIn(locals)) });
}
