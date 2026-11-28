import { and, eq, inArray, sql } from 'drizzle-orm';
import { db } from '#lib/server/db/index.js';
import { follow, personaFollow, user, userPersona } from '#lib/server/db/schema.js';
import { OWNERS } from '#lib/server/ownership.js';

/**
 * What a user card shows about another user, and how they relate to the viewer.
 * @typedef {{ id: string, name: string, image: string | null, colors: Record<string, string> | null, bio: string, publicTexts: number, memberSince: string, relations: string[], following: boolean }} Card
 */

/**
 * What a persona card shows. `mine`: the persona is one of the viewer's own. `following`: the viewer follows it,
 * by itself or (`viaUser`) by following a user who has it.
 * @typedef {{ id: string, name: string, image: string | null, colors: Record<string, string> | null, bio: string, publicTexts: number, mine: boolean, relations: string[], following: boolean, viaUser: boolean }} PersonaCard
 */

const LIMIT = 60;
const UUID = /^[0-9a-f]{8}-(?:[0-9a-f]{4}-){3}[0-9a-f]{12}$/i;

/** ids of the users related to `me` in each way the community page browses by */
export async function relatedIds(/** @type {string} */ me) {
	const rows = async (/** @type {any} */ q) => /** @type {{ id: string }[]} */ (await db.execute(q)).map((r) => r.id);
	// amiables: users I follow (or whose anthologies/collections I follow), and users who follow me (or mine, my
	// personae included). Following a persona does not list its user: that would say whose the persona is.
	const iFollow = await rows(sql`select distinct owner_id as id from follow where follower_id = ${me}`);
	const followMe = await rows(sql`
		select follower_id as id from follow where owner_id = ${me}
		union
		select f.follower_id from persona_follow f join user_persona up on up.persona_id = f.persona_id
			where up.user_id = ${me} and f.follower_id <> ${me}`);
	// republic of letters: commentaries on my texts, and mine on theirs
	const commentedOnMine = await rows(sql`
		select distinct co.user_id as id from text c
			join ${OWNERS} mine on mine.text_id = c.commentary_on and mine.user_id = ${me}
			join ${OWNERS} co on co.text_id = c.id and co.user_id <> ${me}`);
	const iCommentedOn = await rows(sql`
		select distinct oo.user_id as id from text c
			join ${OWNERS} mine on mine.text_id = c.id and mine.user_id = ${me}
			join ${OWNERS} oo on oo.text_id = c.commentary_on and oo.user_id <> ${me}`);
	return { iFollow, followMe, commentedOnMine, iCommentedOn };
}

/** ids of the personae related to `me` in each way the community page browses by */
export async function relatedPersonaIds(/** @type {string} */ me) {
	const rows = async (/** @type {any} */ q) => /** @type {{ id: string }[]} */ (await db.execute(q)).map((r) => r.id);
	// followed by themselves
	const iFollow = await rows(sql`select persona_id as id from persona_follow where follower_id = ${me} order by created_at`);
	// republic of letters, most recent commentary first: who wrote commentaries on my texts, and the authors of the
	// texts I wrote commentaries on. My own personae count like any other.
	const commentedOnMine = await rows(sql`
		select a.persona_id as id from text c
			join ${OWNERS} mine on mine.text_id = c.commentary_on and mine.user_id = ${me}
			join text_author a on a.text_id = c.id
		group by a.persona_id order by max(c.created_at) desc`);
	const iCommentedOn = await rows(sql`
		select a.persona_id as id from text c
			join ${OWNERS} mine on mine.text_id = c.id and mine.user_id = ${me}
			join text_author a on a.text_id = c.commentary_on
		group by a.persona_id order by max(c.created_at) desc`);
	return { iFollow, commentedOnMine, iCommentedOn };
}

/**
 * Cards for the given personae, in the given order. A "self" shows as its user's profile name; no other persona
 * says whose it is.
 * @param {string[]} ids
 * @param {string} me the viewer
 * @returns {Promise<PersonaCard[]>}
 */
export async function personaCardsFor(ids, me) {
	if (!ids.length) return [];
	const rel = await relatedPersonaIds(me);
	const rows = /** @type {any[]} */ (
		await db.execute(sql`
			select p.id, coalesce(nullif(su.name, ''), p.name) as name, coalesce(p.image, su.image) as image, p.theme_colors as colors, p.description as bio,
				exists (select 1 from user_persona m where m.persona_id = p.id and m.user_id = ${me}) as mine,
				exists (select 1 from user_persona up join follow f on f.kind = 'user' and f.target_id = up.user_id
					where up.persona_id = p.id and f.follower_id = ${me}) as "viaUser",
				(select count(*)::int from text_author a join text t on t.id = a.text_id
					where a.persona_id = p.id and t.visibility = 'public' and t.production_status = 'published') as "publicTexts"
			from persona p
				left join user_persona s on s.persona_id = p.id and s.is_self
				left join "user" su on su.id = s.user_id
			where p.id in ${sql`(${sql.join(ids.map((i) => sql`${i}`), sql`, `)})`}`)
	);
	const byId = new Map(rows.map((r) => [r.id, r]));
	return ids
		.filter((id) => byId.has(id))
		.map((id) => {
			const r = byId.get(id);
			const direct = rel.iFollow.includes(id);
			const viaUser = !r.mine && r.viaUser;
			const relations = [];
			if (direct) relations.push('you follow');
			if (rel.commentedOnMine.includes(id)) relations.push('commented on your texts');
			if (rel.iCommentedOn.includes(id)) relations.push('you commented on theirs');
			return {
				id,
				name: r.name,
				image: r.image ?? null,
				colors: r.colors ?? null,
				bio: r.bio ?? '',
				publicTexts: r.publicTexts,
				mine: r.mine,
				relations,
				following: direct || viaUser,
				viaUser
			};
		});
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
			select u.id, u.name, u.image, u.created_at as "createdAt", s.theme_colors as colors, s.description as bio,
				(select count(*)::int from ${OWNERS} o join text t on t.id = o.text_id
						where o.user_id = u.id and t.visibility = 'public' and t.production_status = 'published') as "publicTexts"
			from "user" u
				left join user_persona us on us.user_id = u.id and us.is_self
				left join persona s on s.id = us.persona_id
			where u.id in ${sql`(${sql.join(ids.map((i) => sql`${i}`), sql`, `)})`}`)
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
				colors: r.colors ?? null,
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

/**
 * Other people's personae matching a search by name or description. "self" personae are left out: a search finds
 * those as their users.
 */
export async function searchPersonaIds(/** @type {string} */ q, /** @type {string} */ me) {
	const like = `%${q.replace(/[\\%_]/g, '\\$&')}%`;
	const rows = /** @type {{ id: string }[]} */ (
		await db.execute(sql`
			select p.id from persona p
			where (p.name ilike ${like} or coalesce(p.description, '') ilike ${like})
				and not exists (select 1 from user_persona up where up.persona_id = p.id and (up.is_self or up.user_id = ${me}))
			order by p.created_at limit ${LIMIT}`)
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

/** Follow or unfollow a persona by itself. Returns false when there is no such persona (or it is the follower's own). */
export async function setFollowingPersona(/** @type {string} */ me, /** @type {string} */ target, /** @type {boolean} */ on) {
	if (!UUID.test(target)) return false;
	const holders = await db.select({ userId: userPersona.userId }).from(userPersona).where(eq(userPersona.personaId, target));
	if (!holders.length || holders.some((h) => h.userId === me)) return false;
	if (on) await db.insert(personaFollow).values({ followerId: me, personaId: target }).onConflictDoNothing();
	else await db.delete(personaFollow).where(and(eq(personaFollow.followerId, me), eq(personaFollow.personaId, target)));
	return true;
}
