import { error, json } from '@sveltejs/kit';
import { auth } from '#lib/server/auth.ts';

/**
 * Admin account switching, for testing. `{ userId }` switches the admin into that account (it must be sent from the
 * admin's own session); `{ stop: true }` returns to the admin's own account. Switching from one account straight to
 * another is two requests, stop then switch, which the account switcher makes. better-auth's admin plugin does the
 * checking: only a user with role 'admin' may impersonate, and it sets the session cookies.
 */
export const POST = async ({ request, locals }) => {
	if (!locals.user) error(401, 'Sign in first.');
	const body = await request.json().catch(() => ({}));
	try {
		if (body?.stop === true) await auth.api.stopImpersonating({ headers: request.headers });
		else if (typeof body?.userId === 'string') await auth.api.impersonateUser({ body: { userId: body.userId }, headers: request.headers });
		else error(400, 'Nothing to do.');
	} catch (e) {
		if (e && typeof e === 'object' && 'status' in e && 'body' in e && typeof e.status === 'number' && e.status < 500) {
			// a refusal from better-auth (not an admin, impersonating an admin, ...)
			error(403, /** @type {any} */ (e).body?.message ?? 'Not allowed.');
		}
		throw e;
	}
	return json({ ok: true });
};
