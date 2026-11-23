import { json, error } from '@sveltejs/kit';
import { listOpenSources, HUMAN_SOURCES } from '#lib/server/sources/index.js';

/** The open-access sources exegeezer can import from, and the ones it only links to. */
export async function GET({ locals }) {
	if (!locals.user) error(401, 'Sign in to import texts');
	return json({ open: await listOpenSources(), human: HUMAN_SOURCES });
}
