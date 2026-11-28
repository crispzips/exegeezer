import { json } from '@sveltejs/kit';
import { findPersonae } from '#lib/server/circulation.js';
import { signedIn } from '#lib/server/reply.js';

/** Personae whose name holds `q`. */
export async function GET({ url, locals }) {
	signedIn(locals);
	return json({ found: await findPersonae((url.searchParams.get('q') ?? '').slice(0, 100)) });
}
