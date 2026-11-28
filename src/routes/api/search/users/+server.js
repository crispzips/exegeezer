import { json } from '@sveltejs/kit';
import { findUsers } from '#lib/server/circulation.js';
import { signedIn } from '#lib/server/reply.js';

/** Other users whose name holds `q`. */
export async function GET({ url, locals }) {
	return json({ found: await findUsers(signedIn(locals), (url.searchParams.get('q') ?? '').slice(0, 100)) });
}
