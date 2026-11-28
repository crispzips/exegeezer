import { error, json } from '@sveltejs/kit';

/**
 * How an API route answers what came of asking for something (see consent.js): `{ done, message? }`, or the refusal.
 * @param {import('#lib/server/consent.js').Outcome} outcome
 */
export const reply = (outcome) =>
	'done' in outcome ? json({ done: outcome.done, message: outcome.message }) : json({ message: outcome.message }, { status: outcome.status });

/** The signed-in user's id, or a refusal. @param {App.Locals} locals */
export function signedIn(locals) {
	if (!locals.user) error(401, 'Sign in first');
	return locals.user.id;
}

/** A request's body as an object (empty when it isn't one). @param {Request} request @returns {Promise<Record<string, any>>} */
export async function bodyOf(request) {
	const body = await request.json().catch(() => null);
	return body && typeof body === 'object' ? body : {};
}
