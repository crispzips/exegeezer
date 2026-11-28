import { and, asc, eq, inArray, isNull, or, sql } from 'drizzle-orm';
import { db } from '#lib/server/db/index.js';
import { persona, proposal, proposalConsent, text_, textAuthor, user, userPersona } from '#lib/server/db/schema.js';
import { ACTIONS, PERSONA_SCALE } from '#lib/server/actions.js';
import { isAuthor, isEditor, UUID } from '#lib/server/access.js';
import { namedAuthors } from '#lib/server/texts.js';
import { OWNERS } from '#lib/server/ownership.js';
import { joinNames } from '#lib/textStatus.js';

/**
 * Agreement. All the users puppeteering a persona must agree on anything that affects it or its texts, so a text's
 * settings, status and repression wait for every user of every author persona; renouncing (and returning), and changes
 * to a persona, wait for that persona's users only. Writing a text's words does not wait.
 *
 * Whatever only the person asking must agree to is done at once. Otherwise it is kept as a proposal until everyone has
 * agreed, or someone declines. Editors may propose publishing, circulating, deleting and repressing; the authors decide.
 *
 * @typedef {{ ok: true, done: boolean, message?: string } | { ok: false, status: number, message: string }} Outcome
 * @typedef {import('#lib/server/actions.js').Proposal} Proposal
 */

/** what an editor may put forward (and, of a text's settings, which) */
const EDITOR_ACTIONS = new Set(['burn', 'recant', 'derecant', 'mark', 'properties']);
const EDITOR_PROPERTIES = new Set(['productionStatus', 'visibility', 'shares']);

/**
 * The users whose agreement a proposal needs.
 * @param {Pick<typeof db, 'select' | 'execute'>} conn
 * @param {Pick<Proposal, 'textId' | 'personaId' | 'action' | 'payload'>} p
 * @returns {Promise<string[]>}
 */
async function required(conn, p) {
	if (PERSONA_SCALE.has(p.action)) {
		const rows = await conn.select({ id: userPersona.userId }).from(userPersona).where(eq(userPersona.personaId, /** @type {string} */ (p.personaId)));
		return rows.map((r) => r.id);
	}
	const rows = /** @type {{ id: string }[]} */ ([
		...(await conn.execute(sql`
			select up.user_id as id from text_author a join user_persona up on up.persona_id = a.persona_id where a.text_id = ${p.textId}
			union
			select user_id from text where id = ${p.textId} and user_id is not null`))
	]);
	const users = new Set(rows.map((r) => r.id));
	// bringing a persona in as an author is a matter for everyone who has it too
	const added = /** @type {any} */ (p.payload)?.personaIds;
	if (p.action === 'properties' && added?.length) {
		const had = new Set((await conn.select({ id: textAuthor.personaId }).from(textAuthor).where(eq(textAuthor.textId, /** @type {string} */ (p.textId)))).map((a) => a.id));
		const joining = added.filter((/** @type {string} */ id) => !had.has(id));
		if (joining.length) for (const r of await conn.select({ id: userPersona.userId }).from(userPersona).where(inArray(userPersona.personaId, joining))) users.add(r.id);
	}
	return [...users];
}

/** whether a user may put a proposal forward @param {string} uid @param {Proposal} p */
async function mayPropose(uid, p) {
	if (PERSONA_SCALE.has(p.action)) {
		const [link] = await db.select({ id: userPersona.personaId }).from(userPersona).where(and(eq(userPersona.userId, uid), eq(userPersona.personaId, /** @type {string} */ (p.personaId))));
		return !!link;
	}
	const textId = /** @type {string} */ (p.textId);
	if (await isAuthor(uid, textId)) return true;
	if (!EDITOR_ACTIONS.has(p.action) || !(await isEditor(uid, textId))) return false;
	return p.action !== 'properties' || Object.keys(p.payload ?? {}).every((k) => EDITOR_PROPERTIES.has(k));
}

/** the same JSON, whatever order its keys are in @param {unknown} v @returns {string} */
const stable = (v) =>
	JSON.stringify(v ?? null, (_k, x) => (x && typeof x === 'object' && !Array.isArray(x) ? Object.fromEntries(Object.entries(x).sort(([a], [b]) => (a < b ? -1 : 1))) : x));

/**
 * Carry a proposal out if everyone needed has agreed.
 * @param {string} id
 * @returns {Promise<{ done: boolean, problem?: string, textId?: string | null }>}
 */
async function settle(id) {
	const result = await db.transaction(async (tx) => {
		// locked, so two last agreements can't carry it out twice
		const [p] = await tx.select().from(proposal).where(eq(proposal.id, id)).for('update');
		if (!p) return { done: false };
		const problem = await ACTIONS[p.action].check(tx, p);
		if (problem) {
			await tx.delete(proposal).where(eq(proposal.id, id));
			return { done: false, problem };
		}
		const needed = await required(tx, p);
		const agreed = new Set((await tx.select({ u: proposalConsent.userId }).from(proposalConsent).where(eq(proposalConsent.proposalId, id))).map((r) => r.u));
		if (!needed.length || !needed.every((u) => agreed.has(u))) return { done: false };
		await tx.delete(proposal).where(eq(proposal.id, id));
		await ACTIONS[p.action].run(tx, p);
		return { done: true, textId: p.textId };
	});
	// what was done may change who must agree to the rest (an author gone), or leave it without sense
	if (result.done && result.textId) await reconsider(result.textId);
	return result;
}

/** Look again at what is waiting on a text. @param {string} textId */
async function reconsider(textId) {
	const waiting = await db.select({ id: proposal.id }).from(proposal).where(eq(proposal.textId, textId)).orderBy(asc(proposal.createdAt));
	for (const w of waiting) await settle(w.id);
}

/**
 * Ask for something to be done.
 * @param {string} uid
 * @param {{ action: string, textId?: string | null, personaId?: string | null, payload?: any }} ask
 * @returns {Promise<Outcome>}
 */
export async function propose(uid, { action, textId = null, personaId = null, payload = null }) {
	const known = Object.hasOwn(ACTIONS, action);
	const needsText = !action.startsWith('persona_');
	if (!known || (needsText && !UUID.test(textId ?? '')) || (PERSONA_SCALE.has(action) && !UUID.test(personaId ?? ''))) return { ok: false, status: 404, message: 'Not found' };
	/** @type {Proposal} */
	const p = { action, textId: needsText ? textId : null, personaId: PERSONA_SCALE.has(action) ? personaId : null, payload, proposedBy: uid };
	if (!(await mayPropose(uid, p))) return { ok: false, status: 403, message: "That isn't yours to ask for." };
	const problem = await ACTIONS[action].check(db, p);
	if (problem) return { ok: false, status: 409, message: problem };

	const id = await db.transaction(async (tx) => {
		const same = await tx
			.select()
			.from(proposal)
			.where(and(eq(proposal.action, action), p.textId ? eq(proposal.textId, p.textId) : isNull(proposal.textId), p.personaId ? eq(proposal.personaId, p.personaId) : isNull(proposal.personaId)));
		let found = same.find((s) => stable(s.payload) === stable(payload))?.id;
		if (!found) {
			// asking again about the same thing replaces what you had waiting (and its agreements): never another's request,
			// and a change of settings only one that touches the same settings
			const about = Object.keys(payload ?? {});
			const earlier = same.filter((s) => s.proposedBy === uid && (action !== 'properties' || Object.keys(/** @type {object} */ (s.payload)).some((k) => about.includes(k))));
			if (earlier.length && action !== 'mark') await tx.delete(proposal).where(inArray(proposal.id, earlier.map((s) => s.id)));
			const [row] = await tx.insert(proposal).values(p).returning({ id: proposal.id });
			found = row.id;
		}
		if ((await required(tx, p)).includes(uid)) await tx.insert(proposalConsent).values({ proposalId: found, userId: uid }).onConflictDoNothing();
		return found;
	});
	const settled = await settle(id);
	if (settled.problem) return { ok: false, status: 409, message: settled.problem };
	return { ok: true, done: settled.done, ...(settled.done ? {} : { message: 'Asked. It happens once everyone who has a say has agreed.' }) };
}

/**
 * Agree to a proposal, or decline it (which drops it; whoever made it may withdraw it the same way).
 * @param {string} uid
 * @param {string} id
 * @param {boolean} agree
 * @returns {Promise<Outcome>}
 */
export async function answer(uid, id, agree) {
	const [p] = UUID.test(id) ? await db.select().from(proposal).where(eq(proposal.id, id)) : [];
	if (!p) return { ok: false, status: 404, message: 'That request is no longer waiting.' };
	const needed = (await required(db, p)).includes(uid);
	if (agree) {
		if (!needed) return { ok: false, status: 403, message: "Your agreement isn't asked for." };
		await db.insert(proposalConsent).values({ proposalId: id, userId: uid }).onConflictDoNothing();
		const settled = await settle(id);
		if (settled.problem) return { ok: false, status: 409, message: settled.problem };
		return { ok: true, done: settled.done };
	}
	if (!needed && p.proposedBy !== uid) return { ok: false, status: 404, message: 'That request is no longer waiting.' };
	await db.delete(proposal).where(eq(proposal.id, id));
	return { ok: true, done: false };
}

/** what a proposal asks for, in words @param {Proposal} p */
function describe(p) {
	const extreme = p.payload?.extreme;
	/** @type {Record<string, string>} */
	const words = {
		recant: 'Recant',
		derecant: 'Derecant',
		burn: 'Burn',
		wipe: 'Wipe clean',
		renounce: extreme ? 'Renounce authorship with extreme prejudice' : 'Renounce authorship',
		unrenounce: 'Undo a renunciation',
		mark: p.payload?.public ? 'Mark comments public' : 'Mark comments private',
		persona_update: 'Change the persona',
		persona_delete: 'Delete the persona'
	};
	if (p.action !== 'properties') return words[p.action] ?? p.action;
	const { productionStatus, visibility, ...rest } = p.payload ?? {};
	/** @type {Record<string, string>} */
	const names = { title: 'title', description: 'description', commentPolicy: 'who may comment', personaIds: 'authors', editorIds: 'editors', shares: 'who it is circulated to' };
	const parts = [
		...(productionStatus ? [`status to “${productionStatus}”`] : []),
		...(visibility ? [`visibility to ${visibility}`] : []),
		...Object.keys(rest).map((k) => names[k] ?? k)
	];
	return `Change ${joinNames(parts)}`;
}

/**
 * What is waiting that concerns a user: everything their agreement is asked for, and everything they asked. Counts, never
 * names, say who has agreed, so no pseudonym is given away.
 * @param {string} uid
 */
export async function proposalsFor(uid) {
	const rows = await db
		.select()
		.from(proposal)
		.where(
			or(
				eq(proposal.proposedBy, uid),
				sql`${proposal.textId} in (select o.text_id from ${OWNERS} o where o.user_id = ${uid})`,
				sql`${proposal.personaId} in (select persona_id from user_persona where user_id = ${uid})`,
				// (and what would bring one of their personae in as an author)
				sql`jsonb_exists_any(coalesce(${proposal.payload}->'personaIds', '[]'::jsonb), array(select persona_id::text from user_persona where user_id = ${uid}))`
			)
		)
		.orderBy(asc(proposal.createdAt));
	const out = [];
	for (const p of rows) {
		const needed = await required(db, p);
		const mine = p.proposedBy === uid;
		if (!needed.includes(uid) && !mine) continue;
		const agreed = (await db.select({ u: proposalConsent.userId }).from(proposalConsent).where(eq(proposalConsent.proposalId, p.id))).map((r) => r.u);
		const [t] = p.textId ? await db.select({ title: text_.title }).from(text_).where(eq(text_.id, p.textId)) : [];
		const [who] = p.personaId
			? await db
					.select({ name: persona.name, userName: user.name })
					.from(persona)
					.leftJoin(userPersona, and(eq(userPersona.personaId, persona.id), eq(userPersona.isSelf, true)))
					.leftJoin(user, eq(user.id, userPersona.userId))
					.where(eq(persona.id, p.personaId))
			: [];
		out.push({
			id: p.id,
			textId: p.textId,
			title: t?.title ?? null,
			authors: p.textId ? ((await namedAuthors([p.textId])).get(p.textId)?.map((a) => a.name) ?? []) : [],
			persona: who ? who.userName || who.name : null,
			what: describe(p),
			mine,
			agreed: needed.filter((u) => agreed.includes(u)).length,
			needed: needed.length,
			awaitingMe: needed.includes(uid) && !agreed.includes(uid),
			createdAt: p.createdAt.toISOString()
		});
	}
	return out;
}
