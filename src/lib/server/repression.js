import { and, eq, inArray, ne, notExists, sql } from 'drizzle-orm';
import { db } from '#lib/server/db/index.js';
import { commentParagraph, paragraph, section, text_, textItem } from '#lib/server/db/schema.js';
import { handOverSharedTexts } from '#lib/server/ownership.js';
import { isPermanent } from '#lib/textStatus.js';

/** @typedef {Parameters<Parameters<typeof db.transaction>[0]>[0]} Tx */

const CHUNK = 5000;

/**
 * Destroy a text that was never published, with its words, its head and its tail: every commentary on it goes too
 * (and theirs). A publication or palimpsest is never destroyed.
 * @param {Tx} tx
 * @param {string} id
 */
export async function destroyText(tx, id) {
	const [row] = await tx.select().from(text_).where(eq(text_.id, id));
	if (!row) return;
	// (a commentary on an unpublished text can't have been published, so this never trips on one)
	if (isPermanent(row)) throw new Error('A published, public text is never deleted');
	for (const c of await tx.select({ id: text_.id }).from(text_).where(eq(text_.commentaryOn, id))) await destroyText(tx, c.id);
	const items = await tx.select({ p: textItem.paragraphId, s: textItem.sectionId }).from(textItem).where(eq(textItem.textId, id));
	await tx.delete(text_).where(eq(text_.id, id)); // its text_item rows go with it
	await dropUnused(tx, /** @type {string[]} */ (items.map((i) => i.p).filter(Boolean)), /** @type {string[]} */ (items.map((i) => i.s).filter(Boolean)));
}

/**
 * Delete whichever of these paragraphs and sections no text uses any more.
 * @param {Tx} tx @param {string[]} ps @param {string[]} ss
 */
export async function dropUnused(tx, ps, ss) {
	for (let k = 0; k < ps.length; k += CHUNK) {
		await tx.delete(paragraph).where(and(inArray(paragraph.id, ps.slice(k, k + CHUNK)), notExists(tx.select().from(textItem).where(eq(textItem.paragraphId, paragraph.id)))));
	}
	for (let k = 0; k < ss.length; k += CHUNK) {
		await tx.delete(section).where(and(inArray(section.id, ss.slice(k, k + CHUNK)), notExists(tx.select().from(textItem).where(eq(textItem.sectionId, section.id)))));
	}
}

/**
 * Burn a publication's content: every word, heading, paragraph title and description is erased for good. The places
 * stay, empty, so that the commentaries stay attached to them. Content another text also uses is left to that text:
 * this one gets blank places of its own, and the comments on it move to them.
 * @param {Tx} tx
 * @param {string} id
 */
export async function eraseContent(tx, id) {
	const items = await tx.select().from(textItem).where(eq(textItem.textId, id));
	for (const item of items) {
		const column = item.paragraphId ? textItem.paragraphId : textItem.sectionId;
		const used = /** @type {string} */ (item.paragraphId ?? item.sectionId);
		const [elsewhere] = await tx.select({ t: textItem.textId }).from(textItem).where(and(eq(column, used), ne(textItem.textId, id))).limit(1);
		const here = and(eq(textItem.textId, id), eq(textItem.position, item.position));
		if (item.paragraphId) {
			if (!elsewhere) await tx.update(paragraph).set({ body: '', title: null, description: null }).where(eq(paragraph.id, used));
			else {
				const [old] = await tx.select({ public: paragraph.public }).from(paragraph).where(eq(paragraph.id, used));
				const [blank] = await tx.insert(paragraph).values({ body: '', public: old.public }).returning({ id: paragraph.id });
				await tx.update(textItem).set({ paragraphId: blank.id }).where(here);
				// comments made on this text (not on the other) follow it to the blank place
				await tx.execute(sql`update ${commentParagraph} set paragraph_id = ${blank.id} where paragraph_id = ${used}
					and comment_id in (select m.id from comment m join text c on c.id = m.commentary_id where c.commentary_on = ${id})`);
			}
		} else if (!elsewhere) await tx.update(section).set({ title: '' }).where(eq(section.id, used));
		else {
			const [blank] = await tx.insert(section).values({ title: '' }).returning({ id: section.id });
			await tx.update(textItem).set({ sectionId: blank.id }).where(here);
		}
	}
}

/**
 * Before an account is deleted (which would delete the texts saved under it): shared texts move to another of their
 * owners; unpublished ones left are destroyed; publications and palimpsests are cut loose from the account, so they
 * stay in the database.
 * @param {string} uid
 */
export async function beforeAccountDelete(uid) {
	await handOverSharedTexts(uid);
	await db.transaction(async (tx) => {
		const mine = await tx.select().from(text_).where(eq(text_.userId, uid));
		for (const row of mine) if (!isPermanent(row)) await destroyText(tx, row.id);
		await tx.update(text_).set({ userId: null }).where(eq(text_.userId, uid));
	});
}
