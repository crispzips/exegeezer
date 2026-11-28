import { and, eq, inArray, or, sql } from 'drizzle-orm';
import { db } from '#lib/server/db/index.js';
import { text_, textEditor, textShare, userGroupMember, userPersona } from '#lib/server/db/schema.js';
import { ownedBy } from '#lib/server/ownership.js';
import { isPalimpsest } from '#lib/textStatus.js';

/**
 * What a user is to a text, and what that lets them do:
 * - its authors (`ownedBy`) may do anything, once every user of every author persona agrees (see consent.js);
 * - its editors may change its words, and propose the rest to the authors;
 * - others may read it if it is public, or if it is circulated to them; a commentary is also read by the authors and
 *   editors of the text it is on;
 * - what a recanted text says is for its authors and editors only, and what a burned one said is gone. Its head and
 *   tail stay as readable as before.
 */

export const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** @typedef {typeof text_.$inferSelect} TextRow */
/**
 * @typedef {{
 *   row: TextRow, author: boolean, editor: boolean, shared: string | null, overReferent: boolean,
 *   read: boolean, comment: boolean, content: boolean
 * }} Standing
 * (`shared`: the privilege the text is circulated to them with; `overReferent`: they author or edit the text this
 * commentary is on; `content`: they may see what it says)
 */

/**
 * A condition for a query over the texts table: `uid` is an editor of the text.
 * @param {string} uid
 * @param {any} [table]
 */
export const editedBy = (uid, table = text_) =>
	sql`exists (select 1 from text_editor e join user_persona eu on eu.persona_id = e.persona_id where e.text_id = ${table.id} and eu.user_id = ${uid})`;

/** @param {string} uid @param {string} textId */
export async function isAuthor(uid, textId) {
	const [row] = await db.select({ id: text_.id }).from(text_).where(and(eq(text_.id, textId), ownedBy(uid)));
	return !!row;
}

/** @param {string} uid @param {string} textId */
export async function isEditor(uid, textId) {
	const [row] = await db
		.select({ id: textEditor.textId })
		.from(textEditor)
		.innerJoin(userPersona, eq(userPersona.personaId, textEditor.personaId))
		.where(and(eq(textEditor.textId, textId), eq(userPersona.userId, uid)))
		.limit(1);
	return !!row;
}

/**
 * The privilege a text is shared with a user with, directly or through a group ('comment' wins). Says nothing about
 * whether sharing is in force: that depends on the text's status.
 * @param {string} uid
 * @param {string} textId
 */
async function sharedPrivilege(uid, textId) {
	const groups = db.select({ id: userGroupMember.groupId }).from(userGroupMember).where(eq(userGroupMember.userId, uid));
	const rows = await db
		.select({ privilege: textShare.privilege })
		.from(textShare)
		.where(and(eq(textShare.textId, textId), or(eq(textShare.userId, uid), inArray(textShare.groupId, groups))));
	if (!rows.length) return null;
	return rows.some((r) => r.privilege === 'comment') ? 'comment' : 'read';
}

/**
 * @param {string | null | undefined} uid
 * @param {string} textId
 * @returns {Promise<Standing | null>} null when there is no such text, or nobody is signed in
 */
export async function standing(uid, textId) {
	if (!uid || !UUID.test(textId)) return null;
	const [row] = await db.select().from(text_).where(eq(text_.id, textId));
	if (!row) return null;
	const author = await isAuthor(uid, textId);
	const editor = await isEditor(uid, textId);
	const shared = await sharedPrivilege(uid, textId);
	const overReferent = !!row.commentaryOn && ((await isAuthor(uid, row.commentaryOn)) || (await isEditor(uid, row.commentaryOn)));
	const inside = author || editor;
	const circulated = row.productionStatus === 'circulated' && !!shared;
	const read = inside || overReferent || row.visibility === 'public' || circulated;
	const comment =
		read &&
		!isPalimpsest(row) &&
		(inside ||
			// whoever it was circulated to with comment privileges; once public, they count as invited
			(shared === 'comment' && (row.productionStatus === 'circulated' || row.commentPolicy !== 'authors')) ||
			(row.visibility === 'public' && row.commentPolicy === 'anyone'));
	const content = read && row.productionStatus !== 'burned' && (row.productionStatus !== 'recanted' || inside);
	return { row, author, editor, shared, overReferent, read, comment, content };
}
