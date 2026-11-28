import { and, eq, sql } from 'drizzle-orm';
import { paragraph, text_, textItem } from '#lib/server/db/schema.js';
import { isPalimpsest, isPermanent } from '#lib/textStatus.js';

/** @typedef {Pick<typeof import('#lib/server/db/index.js').db, 'select' | 'update'>} Conn the database or a transaction */

/**
 * A commentary's status and visibility follow the text it is on, never its own settings:
 * - it has that text's status; once the text is published, commentary with anything marked public is published, and
 *   commentary with nothing marked stays circulated (private texts can't be published);
 * - it is public only when the text is and something in it is marked public;
 * - one its own authors have repressed stays repressed.
 * Brings a commentary, and every commentary on it, up to date.
 * @param {Conn} conn
 * @param {string} id a commentary
 */
export async function syncCommentary(conn, id) {
	const [own] = await conn.select().from(text_).where(eq(text_.id, id));
	if (!own?.commentaryOn) return;
	const [on] = await conn.select().from(text_).where(eq(text_.id, own.commentaryOn));
	if (!isPalimpsest(own)) {
		const [marked] = await conn
			.select({ id: textItem.paragraphId })
			.from(textItem)
			.innerJoin(paragraph, eq(paragraph.id, textItem.paragraphId))
			.where(and(eq(textItem.textId, id), eq(paragraph.public, true)))
			.limit(1);
		const productionStatus = isPermanent(on) ? (marked ? 'published' : 'circulated') : on.productionStatus;
		const visibility = on.visibility === 'public' && marked ? 'public' : 'private';
		if (productionStatus !== own.productionStatus || visibility !== own.visibility) {
			// (following its text is not a change to the commentary, so the date it was last changed stays)
			await conn.update(text_).set({ productionStatus, visibility, updatedAt: own.updatedAt }).where(eq(text_.id, id));
		}
	}
	await syncCommentaries(conn, id);
}

/**
 * Bring every commentary on a text up to date with it.
 * @param {Conn} conn
 * @param {string} textId
 */
export async function syncCommentaries(conn, textId) {
	const rows = await conn.select({ id: text_.id }).from(text_).where(eq(text_.commentaryOn, textId));
	for (const r of rows) await syncCommentary(conn, r.id);
}

/**
 * The paragraphs of a commentary that have entered public memory: marked public, on a text that has been published
 * (whatever has become of it since). None of them can be changed, hidden or deleted.
 * @param {Pick<typeof import('#lib/server/db/index.js').db, 'select' | 'execute'>} conn
 * @param {string} commentaryId
 * @returns {Promise<Set<string>>}
 */
export async function lockedParagraphs(conn, commentaryId) {
	const rows = /** @type {{ id: string }[]} */ (
		await conn.execute(sql`
			select p.id from text c
				join text r on r.id = c.commentary_on and r.visibility = 'public' and r.production_status in ('published', 'recanted', 'burned')
				join text_item i on i.text_id = c.id
				join paragraph p on p.id = i.paragraph_id and p.public
			where c.id = ${commentaryId}`)
	);
	return new Set([...rows].map((r) => r.id));
}
