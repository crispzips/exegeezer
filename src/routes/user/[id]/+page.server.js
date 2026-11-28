import { error, redirect } from '@sveltejs/kit';
import { userPage } from '#lib/server/community.js';

export const load = async ({ locals, params }) => {
	if (!locals.user) redirect(302, '/login');
	if (params.id === locals.user.id) redirect(302, '/profile');
	const found = await userPage(params.id, locals.user.id);
	if (!found) error(404, 'No such user');
	return found;
};
