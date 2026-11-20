import { redirect } from '@sveltejs/kit';
import { auth } from '#lib/server/auth.ts';

/** Sign out (a form post from the navbar), then back to the app. */
export async function POST({ request }) {
	await auth.api.signOut({ headers: request.headers });
	redirect(303, '/exejeeze');
}
