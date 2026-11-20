import { and, asc, desc, eq, inArray, isNull, notExists, sql } from 'drizzle-orm';
import { db } from '#lib/server/db/index.js';
import { paragraph, section, text_, textItem } from '#lib/server/db/schema.js';

/**
 * What the app works with: the text as one ordered list. An item with `level` 0 is a
 * paragraph; a level of 1-6 is a section header (`text` is "## Title").
 * Paragraphs may also carry an optional `title` and `description`.
 * @typedef {{ id: string, text: string, level: number, frontmatter?: boolean, backmatter?: boolean, title?: string, description?: string }} Item
 */

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const CHUNK = 5000; // rows per insert (Postgres allows 65535 parameters per statement)

/**
 * Check and normalise a list of items sent by the client.
 * @param {unknown} raw
 * @returns {Item[] | null} null when the input is malformed
 */
export function parseItems(raw) {
	if (!Array.isArray(raw)) return null;
	const seen = new Set();
	/** @type {Item[]} */
	const items = [];
	for (const it of raw) {
		if (!it || typeof it !== 'object') return null;
		const { id, text, level, frontmatter, backmatter, title, description } = /** @type {Record<string, unknown>} */ (it);
		if (typeof id !== 'string' || !UUID.test(id) || seen.has(id)) return null;
		if (typeof text !== 'string' || !Number.isInteger(level) || /** @type {number} */ (level) < 0 || /** @type {number} */ (level) > 6) return null;
		seen.add(id);
		if ((title !== undefined && typeof title !== 'string') || (description !== undefined && typeof description !== 'string')) return null;
		items.push({
			id,
			text,
			level: /** @type {number} */ (level),
			frontmatter: frontmatter === true,
			backmatter: backmatter === true,
			// only paragraphs have them; empty means none
			...(level === 0 && title ? { title: /** @type {string} */ (title) } : {}),
			...(level === 0 && description ? { description: /** @type {string} */ (description) } : {})
		});
	}
	return items;
}

/**
 * The user a request acts for (null when not signed in).
 * @param {App.Locals} locals
 */
function owner(locals) {
	return locals.user?.id ?? null;
}

/**
 * The text row if the requester may use it (its owner, or anyone when it has no owner).
 * @param {string} id
 * @param {App.Locals} locals
 */
async function accessible(id, locals) {
	if (!UUID.test(id)) return null;
	const [row] = await db.select().from(text_).where(eq(text_.id, id));
	if (!row || (row.userId !== null && row.userId !== owner(locals))) return null;
	return row;
}

/**
 * The requester's texts, most recently changed first.
 * @param {App.Locals} locals
 */
export async function listTexts(locals) {
	const uid = owner(locals);
	return db
		.select({ id: text_.id, title: text_.title, updatedAt: text_.updatedAt })
		.from(text_)
		.where(uid ? eq(text_.userId, uid) : isNull(text_.userId))
		.orderBy(desc(text_.updatedAt));
}

/**
 * Rebuild a text's ordered list from its items.
 * @param {string} id
 * @param {App.Locals} locals
 * @returns {Promise<{ id: string, title: string, items: Item[] } | null>}
 */
export async function loadText(id, locals) {
	const row = await accessible(id, locals);
	if (!row) return null;
	const rows = await db
		.select({
			paragraphId: textItem.paragraphId,
			sectionId: textItem.sectionId,
			body: paragraph.body,
			paragraphTitle: paragraph.title,
			description: paragraph.description,
			title: section.title,
			level: textItem.level,
			frontmatter: textItem.frontmatter,
			backmatter: textItem.backmatter
		})
		.from(textItem)
		.leftJoin(paragraph, eq(paragraph.id, textItem.paragraphId))
		.leftJoin(section, eq(section.id, textItem.sectionId))
		.where(eq(textItem.textId, id))
		.orderBy(asc(textItem.position));
	/** @type {Item[]} */
	const items = rows.map((r) =>
		r.sectionId
			? { id: r.sectionId, text: `${'#'.repeat(r.level ?? 1)} ${r.title}`, level: r.level ?? 1, frontmatter: r.frontmatter ?? false, backmatter: r.backmatter ?? false }
			: {
					id: /** @type {string} */ (r.paragraphId),
					text: r.body ?? '',
					level: 0,
					...(r.paragraphTitle ? { title: r.paragraphTitle } : {}),
					...(r.description ? { description: r.description } : {})
				}
	);
	return { id: row.id, title: row.title, items };
}

/**
 * Replace a text's arrangement with `items` (all or nothing).
 *
 * Paragraphs and sections are shared content, so a text only owns its arrangement:
 *  - an item whose id this text already used is updated in place (this is how edits save);
 *  - an item whose id is new is created;
 *  - an item whose id belongs to content only other texts use is linked, not changed
 *    (a save from one text never rewrites another text's content);
 *  - content that this text used and no text uses any more is deleted.
 * @param {string} id
 * @param {Item[]} items
 */
async function writeItems(id, items) {
	await db.transaction(async (tx) => {
		const before = await tx
			.select({ paragraphId: textItem.paragraphId, sectionId: textItem.sectionId })
			.from(textItem)
			.where(eq(textItem.textId, id));
		const hadParagraphs = new Set(before.map((r) => r.paragraphId).filter((x) => x !== null));
		const hadSections = new Set(before.map((r) => r.sectionId).filter((x) => x !== null));

		await tx.delete(textItem).where(eq(textItem.textId, id));

		const paragraphs = items.filter((i) => i.level === 0).map((i) => ({ id: i.id, body: i.text, title: i.title ?? null, description: i.description ?? null }));
		const sections = items.filter((i) => i.level > 0).map((i) => ({ id: i.id, title: i.text.replace(/^#{1,6}\s*/, '') }));
		const arranged = items.map((i, position) => ({
			textId: id,
			position,
			paragraphId: i.level === 0 ? i.id : null,
			sectionId: i.level > 0 ? i.id : null,
			level: i.level > 0 ? i.level : null,
			frontmatter: i.level > 0 && i.frontmatter === true,
			backmatter: i.level > 0 && i.backmatter === true
		}));

		// rows this text already had are rewritten (edits); new ids are created; ids that
		// only other texts use are left exactly as they are
		for (let k = 0; k < paragraphs.length; k += CHUNK) {
			const rows = paragraphs.slice(k, k + CHUNK);
			const own = rows.filter((r) => hadParagraphs.has(r.id));
			const rest = rows.filter((r) => !hadParagraphs.has(r.id));
			if (own.length) await tx.insert(paragraph).values(own).onConflictDoUpdate({ target: paragraph.id, set: { body: sql`excluded.body`, title: sql`excluded.title`, description: sql`excluded.description` } });
			if (rest.length) await tx.insert(paragraph).values(rest).onConflictDoNothing();
		}
		for (let k = 0; k < sections.length; k += CHUNK) {
			const rows = sections.slice(k, k + CHUNK);
			const own = rows.filter((r) => hadSections.has(r.id));
			const rest = rows.filter((r) => !hadSections.has(r.id));
			if (own.length) await tx.insert(section).values(own).onConflictDoUpdate({ target: section.id, set: { title: sql`excluded.title` } });
			if (rest.length) await tx.insert(section).values(rest).onConflictDoNothing();
		}
		for (let k = 0; k < arranged.length; k += CHUNK) await tx.insert(textItem).values(arranged.slice(k, k + CHUNK));

		// drop content this text used that no text uses now
		const nowP = new Set(paragraphs.map((p) => p.id));
		const nowS = new Set(sections.map((s) => s.id));
		const goneP = [...hadParagraphs].filter((x) => !nowP.has(/** @type {string} */ (x)));
		const goneS = [...hadSections].filter((x) => !nowS.has(/** @type {string} */ (x)));
		for (let k = 0; k < goneP.length; k += CHUNK) {
			const ids = /** @type {string[]} */ (goneP.slice(k, k + CHUNK));
			await tx.delete(paragraph).where(and(inArray(paragraph.id, ids), notExists(tx.select().from(textItem).where(eq(textItem.paragraphId, paragraph.id)))));
		}
		for (let k = 0; k < goneS.length; k += CHUNK) {
			const ids = /** @type {string[]} */ (goneS.slice(k, k + CHUNK));
			await tx.delete(section).where(and(inArray(section.id, ids), notExists(tx.select().from(textItem).where(eq(textItem.sectionId, section.id)))));
		}
		await tx.update(text_).set({ updatedAt: new Date() }).where(eq(text_.id, id));
	});
}

/**
 * Create a text holding `items`.
 * @param {App.Locals} locals
 * @param {string} title
 * @param {Item[]} items
 */
export async function createText(locals, title, items) {
	const [row] = await db.insert(text_).values({ userId: owner(locals), title: title || 'Untitled' }).returning({ id: text_.id });
	await writeItems(row.id, items);
	return row.id;
}

/**
 * Replace an existing text's contents (and optionally its title).
 * @param {string} id
 * @param {App.Locals} locals
 * @param {Item[]} items
 * @param {string | undefined} title
 * @returns {Promise<boolean>} false when the text does not exist or is not the requester's
 */
export async function saveText(id, locals, items, title) {
	const row = await accessible(id, locals);
	if (!row) return false;
	if (title) await db.update(text_).set({ title }).where(eq(text_.id, id));
	await writeItems(id, items);
	return true;
}
