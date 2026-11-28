import { error, redirect } from '@sveltejs/kit';
import { personaPage } from '#lib/server/community.js';

export const load = async ({ locals, params }) => {
	if (!locals.user) redirect(302, '/login');
	const found = await personaPage(params.id, locals.user.id);
	if (!found) error(404, 'No such persona');
	// a "self" is its user
	if (found.selfOf !== null) redirect(302, found.selfOf === locals.user.id ? '/profile' : `/user/${encodeURIComponent(found.selfOf)}`);
	return found;
};
