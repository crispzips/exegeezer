import { and, asc, desc, eq, inArray, ne, or, sql } from 'drizzle-orm';
import { db } from '#lib/server/db/index.js';
import { persona, renunciation, text_, textShare, user, userGroup, userGroupMember, userPersona } from '#lib/server/db/schema.js';
import { UUID } from '#lib/server/access.js';
import { namedAuthors } from '#lib/server/texts.js';

/** Circulating private texts: the users' groups, finding whom to circulate to (or to make an editor), and what has come to a user. */

const like = (/** @type {string} */ q) => `%${q.replace(/[\\%_]/g, '\\$&')}%`;

/** Other users whose name holds what was typed. Never matched or shown by anything but their profile name. @param {string} me @param {string} q */
export async function findUsers(me, q) {
	if (q.trim().length < 2) return [];
	return db.select({ id: user.id, name: user.name }).from(user).where(and(ne(user.id, me), sql`${user.name} ilike ${like(q.trim())}`)).orderBy(asc(user.name)).limit(10);
}

/**
 * Personae whose name holds what was typed, named as authors are (a "self" by its user's profile name), without
 * saying whose any other is.
 * @param {string} q
 */
export async function findPersonae(q) {
	if (q.trim().length < 2) return [];
	const rows = /** @type {{ id: string, name: string }[]} */ ([
		...(await db.execute(sql`
			select p.id, coalesce(nullif(su.name, ''), p.name) as name from persona p
				left join user_persona s on s.persona_id = p.id and s.is_self
				left join "user" su on su.id = s.user_id
			where coalesce(nullif(su.name, ''), p.name) ilike ${like(q.trim())}
			order by 2 limit 10`))
	]);
	return rows;
}

/** Personae by id, named as authors are. @param {string[]} ids @returns {Promise<{ id: string, name: string }[]>} */
export async function namePersonae(ids) {
	if (!ids.length) return [];
	return db
		.select({ id: persona.id, name: sql`coalesce(nullif(${user.name}, ''), ${persona.name})`.mapWith(String) })
		.from(persona)
		.leftJoin(userPersona, and(eq(userPersona.personaId, persona.id), eq(userPersona.isSelf, true)))
		.leftJoin(user, eq(user.id, userPersona.userId))
		.where(inArray(persona.id, ids));
}

/** The names of those a text is circulated to. @param {{ userId: string | null, groupId: string | null, privilege: string }[]} shares */
export async function nameShares(shares) {
	const users = shares.flatMap((s) => (s.userId ? [s.userId] : []));
	const groups = shares.flatMap((s) => (s.groupId ? [s.groupId] : []));
	const names = new Map([
		...(users.length ? (await db.select({ id: user.id, name: user.name }).from(user).where(inArray(user.id, users))).map((u) => /** @type {const} */ ([u.id, u.name])) : []),
		...(groups.length ? (await db.select({ id: userGroup.id, name: userGroup.name }).from(userGroup).where(inArray(userGroup.id, groups))).map((g) => /** @type {const} */ ([g.id, `Group: ${g.name}`])) : [])
	]);
	return shares.map((s) => ({ ...s, name: names.get(s.userId ?? s.groupId ?? '') ?? 'Someone' }));
}

/** A user's own groups, with their members. @param {string} uid */
export async function groupsOf(uid) {
	const groups = await db.select({ id: userGroup.id, name: userGroup.name }).from(userGroup).where(eq(userGroup.ownerId, uid)).orderBy(asc(userGroup.createdAt));
	if (!groups.length) return [];
	const members = await db
		.select({ groupId: userGroupMember.groupId, id: user.id, name: user.name })
		.from(userGroupMember)
		.innerJoin(user, eq(user.id, userGroupMember.userId))
		.where(inArray(userGroupMember.groupId, groups.map((g) => g.id)))
		.orderBy(asc(user.name));
	return groups.map((g) => ({ ...g, members: members.filter((m) => m.groupId === g.id).map(({ id, name }) => ({ id, name })) }));
}

/** @param {string} uid @param {string} name @returns {Promise<boolean>} */
export async function createGroup(uid, name) {
	const clean = name.trim().slice(0, 100);
	if (!clean) return false;
	await db.insert(userGroup).values({ ownerId: uid, name: clean });
	return true;
}

/** One of the user's groups. @param {string} uid @param {string} id */
async function ownGroup(uid, id) {
	if (!UUID.test(id)) return false;
	const [g] = await db.select({ id: userGroup.id }).from(userGroup).where(and(eq(userGroup.id, id), eq(userGroup.ownerId, uid)));
	return !!g;
}

/** Add or take out a member. @param {string} uid @param {string} id @param {string} memberId @param {boolean} on */
export async function setMember(uid, id, memberId, on) {
	if (!(await ownGroup(uid, id))) return false;
	if (!on) await db.delete(userGroupMember).where(and(eq(userGroupMember.groupId, id), eq(userGroupMember.userId, memberId)));
	else {
		const [u] = await db.select({ id: user.id }).from(user).where(eq(user.id, memberId));
		if (!u) return false;
		await db.insert(userGroupMember).values({ groupId: id, userId: memberId }).onConflictDoNothing();
	}
	return true;
}

/** @param {string} uid @param {string} id */
export async function deleteGroup(uid, id) {
	if (!(await ownGroup(uid, id))) return false;
	await db.delete(userGroup).where(eq(userGroup.id, id));
	return true;
}

/** The texts circulated to a user (directly or through a group), while they are circulated. @param {string} uid */
export async function circulatedTo(uid) {
	const groups = db.select({ id: userGroupMember.groupId }).from(userGroupMember).where(eq(userGroupMember.userId, uid));
	const rows = await db
		.select({ id: text_.id, title: text_.title, privilege: textShare.privilege, updatedAt: text_.updatedAt })
		.from(textShare)
		.innerJoin(text_, eq(text_.id, textShare.textId))
		.where(and(eq(text_.productionStatus, 'circulated'), or(eq(textShare.userId, uid), inArray(textShare.groupId, groups))))
		.orderBy(desc(text_.updatedAt));
	/** @type {Map<string, { id: string, title: string, privilege: string, updatedAt: string }>} */
	const out = new Map();
	for (const r of rows) if (!out.has(r.id) || r.privilege === 'comment') out.set(r.id, { ...r, updatedAt: r.updatedAt.toISOString() });
	const named = await namedAuthors([...out.keys()]);
	return [...out.values()].map((t) => ({ ...t, authors: named.get(t.id)?.map((a) => a.name) ?? [] }));
}

/** The renunciations made by the user's personae, most recent first. @param {string} uid */
export async function renunciationsOf(uid) {
	const rows = await db
		.select({ textId: renunciation.textId, personaId: renunciation.personaId, extreme: renunciation.extreme, title: text_.title, visibility: text_.visibility, createdAt: renunciation.createdAt })
		.from(renunciation)
		.innerJoin(text_, eq(text_.id, renunciation.textId))
		.innerJoin(userPersona, and(eq(userPersona.personaId, renunciation.personaId), eq(userPersona.userId, uid)))
		.orderBy(desc(renunciation.createdAt));
	const names = new Map((await namePersonae(rows.map((r) => r.personaId))).map((p) => [p.id, p.name]));
	return rows.map((r) => ({ ...r, persona: names.get(r.personaId) ?? 'A persona', createdAt: r.createdAt.toISOString() }));
}
