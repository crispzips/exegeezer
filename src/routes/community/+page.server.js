import { fail, redirect } from '@sveltejs/kit';
import { allIds, cardsFor, personaCardsFor, relatedIds, relatedPersonaIds, searchIds, searchPersonaIds, setFollowingPersona, setFollowingUser } from '#lib/server/community.js';

const uniq = (/** @type {string[][]} */ ...lists) => [...new Set(lists.flat())];

export const load = async ({ locals, url }) => {
	if (!locals.user) redirect(302, '/login');
	const me = locals.user.id;
	const q = (url.searchParams.get('q') ?? '').trim().slice(0, 100);
	const results = q ? await cardsFor(await searchIds(q, me), me) : null;
	const personaResults = q ? await personaCardsFor(await searchPersonaIds(q, me), me) : null;

	// With a search, each browse row keeps only what matches it: users as the search finds them (all of them, not just
	// the results shown), personae by the name and description on their card.
	const matched = q ? new Set(await searchIds(q, me, null)) : null;
	const users = (/** @type {string[]} */ ids) => cardsFor(matched ? ids.filter((id) => matched.has(id)) : ids, me);
	const needle = q.toLowerCase();
	const personaeFor = async (/** @type {string[]} */ ids) => (await personaCardsFor(ids, me)).filter((p) => `${p.name}\n${p.bio}`.toLowerCase().includes(needle));

	const rel = await relatedIds(me);
	const personae = await relatedPersonaIds(me);
	const rows = [
		{
			key: 'similarity',
			title: 'Similarity',
			note: 'Users close to you in what they write about. Coming with semantic interweaving of users, personae and text concept tags.',
			users: []
		},
		{ key: 'republic', title: 'Republic of letters', note: 'Personae who have commented on your texts, and personae on whose texts you have commented.', users: [], personae: await personaeFor(uniq(personae.commentedOnMine, personae.iCommentedOn)) },
		{ key: 'amiables', title: 'Amiables', note: 'Users and personae you follow, users who follow you or your personae, and the owners of anthologies and collections you follow.', users: await users(uniq(rel.iFollow, rel.followMe)), personae: await personaeFor(personae.iFollow) },
		// everyone who matches is what the search found
		{ key: 'everyone', title: 'Everyone', note: 'All users, oldest accounts first.', users: results ?? (await users(await allIds(me))) }
	];
	return { q, results, personaResults, rows };
};

export const actions = {
	follow: async ({ request, locals }) => {
		if (!locals.user) redirect(302, '/login');
		const data = await request.formData();
		const userId = data.get('userId');
		const personaId = data.get('personaId');
		const on = data.get('on') === '1';
		if (typeof personaId === 'string') {
			if (!(await setFollowingPersona(locals.user.id, personaId, on))) return fail(404, { message: 'No such persona.' });
		} else if (typeof userId === 'string') {
			if (!(await setFollowingUser(locals.user.id, userId, on))) return fail(404, { message: 'No such user.' });
		} else return fail(400, { message: 'No one to follow was given.' });
		return { ok: true };
	}
};
