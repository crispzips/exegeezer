import { fail, redirect } from '@sveltejs/kit';
import { allIds, cardsFor, relatedIds, searchIds, setFollowingUser } from '#lib/server/community.js';

const uniq = (/** @type {string[][]} */ ...lists) => [...new Set(lists.flat())];

export const load = async ({ locals, url }) => {
	if (!locals.user) redirect(302, '/login');
	const me = locals.user.id;
	const q = (url.searchParams.get('q') ?? '').trim().slice(0, 100);
	if (q) return { q, results: await cardsFor(await searchIds(q, me), me), rows: null };

	const rel = await relatedIds(me);
	const rows = [
		{
			key: 'similarity',
			title: 'Similarity',
			note: 'Users close to you in what they write about. Coming with semantic interweaving of users, personae and text concept tags.',
			users: []
		},
		{ key: 'republic', title: 'Republic of letters', note: 'Users who have commented on your texts, and users on whose texts you have commented.', users: await cardsFor(uniq(rel.commentedOnMine, rel.iCommentedOn), me) },
		{ key: 'amiables', title: 'Amiables', note: 'Users you follow, users who follow you, and the owners of anthologies and collections you follow.', users: await cardsFor(uniq(rel.iFollow, rel.followMe), me) },
		{ key: 'everyone', title: 'Everyone', note: 'All users, oldest accounts first.', users: await cardsFor(await allIds(me), me) }
	];
	return { q, results: null, rows };
};

export const actions = {
	follow: async ({ request, locals }) => {
		if (!locals.user) redirect(302, '/login');
		const data = await request.formData();
		const target = data.get('userId');
		if (typeof target !== 'string') return fail(400, { message: 'No user given.' });
		if (!(await setFollowingUser(locals.user.id, target, data.get('on') === '1'))) return fail(404, { message: 'No such user.' });
		return { ok: true };
	}
};
