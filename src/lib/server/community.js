import { and, eq, inArray, sql } from 'drizzle-orm';
import { db } from '#lib/server/db/index.js';
import { follow, user } from '#lib/server/db/schema.js';

/**
 * What a user card shows about another user, and how they relate to the viewer.
 * @typedef {{ id: string, name: string, image: string | null, bio: string, publicTexts: number, memberSince: string, relations: string[], following: boolean }} Card
 */

const LIMIT = 60;

/** ids of the users related to `me` in each way the community page browses by */
export async function relatedIds(/** @type {string} */ me) {
	const rows = async (/** @type {any} */ q) => /** @type {{ id: string }[]} */ (await db.execute(q)).map((r) => r.id);
	// amiables: users I follow (or whose anthologies/collections I follow), and users who follow me (or mine)
	const iFollow = await rows(sql`select distinct owner_id as id from follow where follower_id = ${me}`);
	const followMe = await rows(sql`select distinct follower_id as id from follow where owner_id = ${me}`);
	// republic of letters: commentaries on my texts, and mine on theirs
	const commentedOnMine = await rows(sql`select distinct c.user_id as id from text c join text o on c.commentary_on = o.id where o.user_id = ${me} and c.user_id <> ${me}`);
	const iCommentedOn = await rows(sql`select distinct o.user_id as id from text c join text o on c.commentary_on = o.id where c.user_id = ${me} and o.user_id <> ${me}`);
	return { iFollow, followMe, commentedOnMine, iCommentedOn };
}

/**
 * Cards for the given users, in the given order.
 * @param {string[]} ids
 * @param {string} me the viewer
 * @returns {Promise<Card[]>}
 */
export async function cardsFor(ids, me) {
	if (!ids.length) return [];
	const rel = await relatedIds(me);
	const rows = /** @type {any[]} */ (
		await db.execute(sql`
			select u.id, u.name, u.image, u.created_at as "createdAt",
				(select p.description from user_persona up join persona p on p.id = up.persona_id where up.user_id = u.id and up.is_self) as bio,
				(select count(*)::int from text t where t.user_id = u.id and t.visibility = 'public' and t.production_status = 'published') as "publicTexts"
			from "user" u where u.id in ${sql`(${sql.join(ids.map((i) => sql`${i}`), sql`, `)})`}`)
	);
	const byId = new Map(rows.map((r) => [r.id, r]));
	return ids
		.filter((id) => byId.has(id) && id !== me)
		.map((id) => {
			const r = byId.get(id);
			const relations = [];
			if (rel.iFollow.includes(id)) relations.push('amiable: you follow');
			if (rel.followMe.includes(id)) relations.push('amiable: follows you');
			if (rel.commentedOnMine.includes(id)) relations.push('commented on your texts');
			if (rel.iCommentedOn.includes(id)) relations.push('you commented on theirs');
			return {
				id,
				name: r.name,
				image: r.image ?? null,
				bio: r.bio ?? '',
				publicTexts: r.publicTexts,
				memberSince: new Date(r.createdAt).toISOString(),
				relations,
				following: rel.iFollow.includes(id)
			};
		});
}

/** users matching a search: name, about, or any of their personae's names and descriptions */
export async function searchIds(/** @type {string} */ q, /** @type {string} */ me) {
	const like = `%${q.replace(/[\\%_]/g, '\\$&')}%`;
	const rows = /** @type {{ id: string }[]} */ (
		await db.execute(sql`
			select u.id from "user" u
			where u.id <> ${me} and (
				u.name ilike ${like} or coalesce(u.about, '') ilike ${like}
				or exists (select 1 from user_persona up join persona p on p.id = up.persona_id
					where up.user_id = u.id and (p.name ilike ${like} or coalesce(p.description, '') ilike ${like}))
			)
			order by u.created_at limit ${LIMIT}`)
	);
	return rows.map((r) => r.id);
}

/** every other user, oldest account first (the "everyone" browse row) */
export async function allIds(/** @type {string} */ me) {
	const rows = /** @type {{ id: string }[]} */ (await db.execute(sql`select id from "user" where id <> ${me} order by created_at limit ${LIMIT}`));
	return rows.map((r) => r.id);
}

/** Follow or unfollow a user. Returns false when there is no such user (or it is the follower). */
export async function setFollowingUser(/** @type {string} */ me, /** @type {string} */ target, /** @type {boolean} */ on) {
	if (me === target) return false;
	const [u] = await db.select({ id: user.id }).from(user).where(eq(user.id, target));
	if (!u) return false;
	if (on) await db.insert(follow).values({ followerId: me, kind: 'user', targetId: target, ownerId: target }).onConflictDoNothing();
	else await db.delete(follow).where(and(eq(follow.followerId, me), eq(follow.kind, 'user'), eq(follow.targetId, target)));
	return true;
}
