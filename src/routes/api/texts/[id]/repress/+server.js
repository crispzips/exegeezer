import { error } from '@sveltejs/kit';
import { propose } from '#lib/server/consent.js';
import { bodyOf, reply, signedIn } from '#lib/server/reply.js';

const ACTIONS = new Set(['recant', 'derecant', 'burn', 'renounce', 'unrenounce']);

/**
 * Repress a text, or an author's part in it: `{ action, personaId?, extreme? }`. Recanting, derecanting and burning wait
 * for every author; renouncing (and undoing it) is the persona's own, named by `personaId`.
 */
export async function POST({ params, request, locals }) {
	const uid = signedIn(locals);
	const body = await bodyOf(request);
	if (!ACTIONS.has(body.action)) error(400, 'No such action');
	const personal = body.action === 'renounce' || body.action === 'unrenounce';
	return reply(
		await propose(uid, {
			action: body.action,
			textId: params.id,
			personaId: personal && typeof body.personaId === 'string' ? body.personaId : null,
			payload: body.action === 'renounce' ? { extreme: body.extreme === true } : null
		})
	);
}
