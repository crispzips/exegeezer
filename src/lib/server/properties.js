import { and, eq, inArray } from 'drizzle-orm';
import { db } from '#lib/server/db/index.js';
import { persona, userGroup, user } from '#lib/server/db/schema.js';
import { UUID } from '#lib/server/access.js';
import { propose } from '#lib/server/consent.js';
import { planStatus } from '#lib/server/actions.js';
import { authorChoices, loadTextProperties } from '#lib/server/texts.js';
import { PRIVILEGES } from '#lib/textStatus.js';

/**
 * The settings a request changes, checked, as a proposal's payload holds them: only what differs.
 * @typedef {{ title?: string, description?: string, commentPolicy?: string, productionStatus?: string, visibility?: string,
 *   personaIds?: string[], editorIds?: string[], shares?: { userId: string | null, groupId: string | null, privilege: string }[] }} Change
 */

const sorted = (/** @type {unknown[]} */ list) => JSON.stringify(list.map((x) => JSON.stringify(x)).sort());
/** @param {{ userId?: string | null, groupId?: string | null, privilege: string }} s */
const share = (s) => ({ userId: s.userId ?? null, groupId: s.groupId ?? null, privilege: s.privilege });

/** @param {unknown} v @returns {string[] | null} */
const ids = (v) => (Array.isArray(v) && v.length <= 200 && v.every((x) => typeof x === 'string' && UUID.test(x)) ? [...new Set(/** @type {string[]} */ (v))] : null);

/**
 * Change a text's settings: any of `Change`'s fields. What needs others' agreement waits for it.
 * @param {string} id
 * @param {App.Locals} locals
 * @param {Record<string, unknown>} next
 * @returns {Promise<import('#lib/server/consent.js').Outcome>}
 */
export async function changeProperties(id, locals, next) {
	const had = await loadTextProperties(id, locals);
	const uid = locals.user?.id;
	if (!had || !uid) return { ok: false, status: 404, message: 'No such text' };
	const bad = (/** @type {string} */ message) => /** @type {const} */ ({ ok: false, status: 400, message });
	/** @type {Change} */
	const change = {};

	if (typeof next.title === 'string') {
		const title = next.title.trim().slice(0, 200);
		if (!title) return bad('Enter a title.');
		if (title !== had.title) change.title = title;
	}
	if (typeof next.description === 'string') {
		const description = next.description.replace(/\r\n/g, '\n').trim().slice(0, 5000);
		if (description !== had.description) change.description = description;
	}
	if (typeof next.commentPolicy === 'string' && next.commentPolicy !== had.commentPolicy) change.commentPolicy = next.commentPolicy;

	// a commentary's status and visibility are not its own to set
	if (had.type !== 'commentary') {
		const wanted = {
			...(typeof next.productionStatus === 'string' && next.productionStatus !== had.productionStatus ? { productionStatus: next.productionStatus } : {}),
			...(typeof next.visibility === 'string' && next.visibility !== had.visibility ? { visibility: next.visibility } : {})
		};
		if (Object.keys(wanted).length) {
			const planned = planStatus(/** @type {any} */ (had), wanted);
			if ('error' in planned) return bad(planned.error);
			if (planned.productionStatus !== had.productionStatus) change.productionStatus = planned.productionStatus;
			if (planned.visibility !== had.visibility) change.visibility = planned.visibility;
		}
	}

	if (next.personaIds !== undefined) {
		const list = ids(next.personaIds);
		if (!list?.length) return bad('Choose at least one author.');
		if (JSON.stringify(list) !== JSON.stringify(had.personaIds)) {
			const choices = new Set((await authorChoices(locals)).map((c) => c.id));
			// only your own personae can be brought in, and one of them stays, so saving never shuts you out of the text
			if (!list.every((p) => had.personaIds.includes(p) || choices.has(p)) || !list.some((p) => choices.has(p))) return bad('Choose at least one of your personae as an author.');
			change.personaIds = list;
		}
	}
	if (next.editorIds !== undefined) {
		const list = ids(next.editorIds);
		if (!list) return bad('Choose editors from the list.');
		if (sorted(list) !== sorted(had.editorIds)) {
			if (list.length && (await db.select({ id: persona.id }).from(persona).where(inArray(persona.id, list))).length !== list.length) return bad('Choose editors from the list.');
			change.editorIds = list;
		}
	}
	if (next.shares !== undefined) {
		if (!Array.isArray(next.shares) || next.shares.length > 500) return bad('Choose whom to circulate to.');
		const list = next.shares.map((s) => share(s ?? {}));
		const valid = list.every((s) => PRIVILEGES.includes(s.privilege) && !s.userId !== !s.groupId && (!s.userId || typeof s.userId === 'string') && (!s.groupId || UUID.test(s.groupId)));
		const unique = new Set(list.map((s) => s.userId ?? s.groupId)).size === list.length;
		if (!valid || !unique) return bad('Choose whom to circulate to.');
		const before = had.shares.map(share);
		if (sorted(list) !== sorted(before)) {
			const known = new Set(before.map((s) => s.userId ?? s.groupId));
			// new ones: real users, and your own groups
			const users = list.filter((s) => s.userId && !known.has(s.userId)).map((s) => /** @type {string} */ (s.userId));
			const groups = list.filter((s) => s.groupId && !known.has(s.groupId)).map((s) => /** @type {string} */ (s.groupId));
			if (users.length && (await db.select({ id: user.id }).from(user).where(inArray(user.id, users))).length !== users.length) return bad('Choose whom to circulate to.');
			if (groups.length && (await db.select({ id: userGroup.id }).from(userGroup).where(and(inArray(userGroup.id, groups), eq(userGroup.ownerId, uid)))).length !== groups.length) return bad('Choose one of your own groups.');
			change.shares = list;
		}
	}

	if (!Object.keys(change).length) return { ok: true, done: true };
	return propose(uid, { action: 'properties', textId: id, payload: change });
}
