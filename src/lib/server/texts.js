import { and, asc, desc, eq, inArray, isNull, notExists, sql } from 'drizzle-orm';
import { db } from '#lib/server/db/index.js';
import { PRODUCTION_STATUSES, VISIBILITIES } from '#lib/textStatus.js';
import { selfPersonaId } from '#lib/server/personae.js';
import { isPublicized } from '#lib/textStatus.js';
import { paragraph, persona, section, text_, textAuthor, textItem, userPersona } from '#lib/server/db/schema.js';

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
 * The text row if the requester may use it: only its owner (a signed-in user). Texts with no owner
 * (saved before accounts existed) are reachable by nobody until someone claims them.
 * @param {string} id
 * @param {App.Locals} locals
 */
async function accessible(id, locals) {
	if (!UUID.test(id)) return null;
	const [row] = await db.select().from(text_).where(eq(text_.id, id));
	const uid = owner(locals);
	if (!row || !uid || row.userId !== uid) return null;
	return row;
}

/**
 * The requester's texts, most recently changed first.
 * @param {App.Locals} locals
 */
export async function listTexts(locals) {
	const uid = owner(locals);
	const rows = await db
		.select({ id: text_.id, title: text_.title, type: text_.type, productionStatus: text_.productionStatus, visibility: text_.visibility, createdAt: text_.createdAt, updatedAt: text_.updatedAt })
		.from(text_)
		.where(uid ? eq(text_.userId, uid) : isNull(text_.userId))
		.orderBy(desc(text_.updatedAt));
	const choices = await authorChoices(locals);
	return Promise.all(
		rows.map(async (r) => ({
			...r,
			author: (await authorIds(r.id)).map((id) => choices.find((c) => c.id === id)?.name).filter(Boolean).join(', ') || null
		}))
	);
}

/**
 * Rebuild a text's ordered list from its items.
 * @param {string} id
 * @param {App.Locals} locals
 * @returns {Promise<{ id: string, title: string, rallyStyle: string | null, authors: string[], items: Item[] } | null>}
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
	return { id: row.id, title: row.title, rallyStyle: row.rallyStyle, authors: await authorNames(id, locals), items };
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
 * @param {string} visibility 'private' or 'public'
 * @param {string | null} [rallyStyle] the text's default rally type, when it is made by a rally
 */
export async function createText(locals, title, items, visibility, rallyStyle = null) {
	const uid = owner(locals);
	const personaId = uid ? await selfPersonaId(uid) : null;
	const [row] = await db.insert(text_).values({ userId: uid, personaId, visibility, rallyStyle, title: title ?? 'Untitled' }).returning({ id: text_.id });
	if (personaId) await setAuthors(db, row.id, [personaId]);
	await writeItems(row.id, items);
	return row.id;
}

/**
 * Replace an existing text's contents (and optionally its title).
 * @param {string} id
 * @param {App.Locals} locals
 * @param {Item[]} items
 * @param {string | undefined} title
 * @param {{ productionStatus?: string, visibility?: string }} [status]
 * @returns {Promise<boolean>} false when the text does not exist or is not the requester's
 */
export async function saveText(id, locals, items, title, status = {}) {
	const row = await accessible(id, locals);
	if (!row) return false;
	if (title) await db.update(text_).set({ title }).where(eq(text_.id, id));
	if (status.productionStatus || status.visibility) await db.update(text_).set(status).where(eq(text_.id, id));
	await writeItems(id, items);
	return true;
}

/** @param {unknown} v */
export const isRallyStyle = (v) => typeof v === 'string' && ['compose', 'copy', 'recall', 'dictate'].includes(v);

/**
 * Give a text its default rally type.
 * @param {string} id
 * @param {App.Locals} locals
 * @param {string} rallyStyle
 * @returns {Promise<boolean>} false when the text does not exist or is not the requester's
 */
export async function setRallyStyle(id, locals, rallyStyle) {
	const row = await accessible(id, locals);
	if (!row) return false;
	await db.update(text_).set({ rallyStyle }).where(eq(text_.id, id));
	return true;
}

/** @param {unknown} v */
export const isVisibility = (v) => typeof v === 'string' && VISIBILITIES.includes(v);
/** @param {unknown} v */
export const isProductionStatus = (v) => typeof v === 'string' && PRODUCTION_STATUSES.includes(v);

/**
 * Delete a text and the paragraphs and sections that only it used.
 * @param {string} id
 * @param {App.Locals} locals
 * @returns {Promise<boolean>} false when the text does not exist or is not the requester's
 */
export async function deleteText(id, locals) {
	const row = await accessible(id, locals);
	if (!row) return false;
	await db.transaction(async (tx) => {
		const items = await tx.select({ p: textItem.paragraphId, s: textItem.sectionId }).from(textItem).where(eq(textItem.textId, id));
		await tx.delete(text_).where(eq(text_.id, id)); // its text_item rows go with it
		const ps = /** @type {string[]} */ (items.map((i) => i.p).filter(Boolean));
		const ss = /** @type {string[]} */ (items.map((i) => i.s).filter(Boolean));
		for (let k = 0; k < ps.length; k += CHUNK) {
			await tx.delete(paragraph).where(and(inArray(paragraph.id, ps.slice(k, k + CHUNK)), notExists(tx.select().from(textItem).where(eq(textItem.paragraphId, paragraph.id)))));
		}
		for (let k = 0; k < ss.length; k += CHUNK) {
			await tx.delete(section).where(and(inArray(section.id, ss.slice(k, k + CHUNK)), notExists(tx.select().from(textItem).where(eq(textItem.sectionId, section.id)))));
		}
	});
	return true;
}

/**
 * Erase all of a text's content, keeping the text itself (its title and other properties).
 * Content only this text used is deleted; content other texts share stays with them.
 * @param {string} id
 * @param {App.Locals} locals
 * @returns {Promise<boolean>} false when the text does not exist or is not the requester's
 */
export async function wipeText(id, locals) {
	const row = await accessible(id, locals);
	if (!row) return false;
	await writeItems(id, []);
	return true;
}

/**
 * A text's properties (everything but its content), for the settings modal.
 * @param {string} id
 * @param {App.Locals} locals
 */
export async function loadTextProperties(id, locals) {
	const row = await accessible(id, locals);
	if (!row) return null;
	return {
		id: row.id,
		title: row.title,
		type: row.type,
		personaIds: await authorIds(id),
		productionStatus: row.productionStatus,
		visibility: row.visibility,
		publicized: isPublicized(row),
		createdAt: row.createdAt.toISOString(),
		updatedAt: row.updatedAt.toISOString()
	};
}

/**
 * A text's authors (persona ids), first author first.
 * @param {string} textId
 * @returns {Promise<string[]>}
 */
export async function authorIds(textId) {
	const rows = await db.select({ id: textAuthor.personaId }).from(textAuthor).where(eq(textAuthor.textId, textId)).orderBy(asc(textAuthor.position));
	return rows.map((r) => r.id);
}

/**
 * Set a text's authors (in order); `text.persona_id` follows the first one.
 * @param {Pick<typeof db, 'delete' | 'insert' | 'update'>} conn the database or a transaction
 * @param {string} textId
 * @param {string[]} personaIds
 */
export async function setAuthors(conn, textId, personaIds) {
	await conn.delete(textAuthor).where(eq(textAuthor.textId, textId));
	if (personaIds.length) await conn.insert(textAuthor).values(personaIds.map((personaId, position) => ({ textId, personaId, position })));
	await conn.update(text_).set({ personaId: personaIds[0] ?? null }).where(eq(text_.id, textId));
}

/**
 * The names a text is by, in order (a user's "self" shows as their profile name).
 * @param {string} textId
 * @param {App.Locals} locals
 * @returns {Promise<string[]>}
 */
async function authorNames(textId, locals) {
	const choices = await authorChoices(locals);
	return (await authorIds(textId)).map((id) => choices.find((c) => c.id === id)?.name).filter((n) => typeof n === 'string');
}

/**
 * The personae the requester may write as, named as authors (their "self" shows as their profile name).
 * @param {App.Locals} locals
 */
export async function authorChoices(locals) {
	const uid = owner(locals);
	if (!uid) return [];
	const rows = await db
		.select({ id: persona.id, name: persona.name, isSelf: userPersona.isSelf })
		.from(userPersona)
		.innerJoin(persona, eq(userPersona.personaId, persona.id))
		.where(eq(userPersona.userId, uid))
		.orderBy(desc(userPersona.isSelf), asc(persona.createdAt));
	return rows.map((r) => ({ id: r.id, name: r.isSelf ? (locals.user?.name ?? r.name) : r.name }));
}

/**
 * Change a text's properties.
 * @param {string} id
 * @param {App.Locals} locals
 * @param {{ title: string, personaIds: string[], productionStatus: string, visibility: string }} next
 * @returns {Promise<{ ok: true } | { ok: false, status: number, message: string }>}
 */
export async function updateTextProperties(id, locals, { title, personaIds, productionStatus, visibility }) {
	const row = await accessible(id, locals);
	if (!row) return { ok: false, status: 404, message: 'No such text' };
	if (!title) return { ok: false, status: 400, message: 'Enter a title.' };
	if (!isProductionStatus(productionStatus) || !isVisibility(visibility)) return { ok: false, status: 400, message: 'Choose a production status and visibility.' };
	const choices = await authorChoices(locals);
	const unique = [...new Set(personaIds)];
	if (!unique.length || !unique.every((p) => choices.some((c) => c.id === p))) return { ok: false, status: 400, message: 'Choose at least one of your personae as an author.' };
	if (isPublicized(row)) {
		const had = await authorIds(id);
		if (had.length !== unique.length || !had.every((p) => unique.includes(p))) return { ok: false, status: 400, message: "The authors of a published, public text can't be changed." };
	}
	await db.transaction(async (tx) => {
		await tx.update(text_).set({ title, productionStatus, visibility }).where(eq(text_.id, id));
		await setAuthors(tx, id, unique);
	});
	return { ok: true };
}

/**
 * Copy a text into a new one called `COPYOF--<title>`, with the same properties and content.
 * The copy gets fresh paragraph and section ids, so it shares nothing with the original.
 * @param {string} id
 * @param {App.Locals} locals
 * @returns {Promise<string | null>} the copy's id; null when the text does not exist or is not the requester's
 */
export async function duplicateText(id, locals) {
	const row = await accessible(id, locals);
	const loaded = row && (await loadText(id, locals));
	if (!row || !loaded) return null;
	const [copy] = await db
		.insert(text_)
		.values({
			userId: row.userId,
			personaId: row.personaId,
			type: row.type,
			productionStatus: row.productionStatus,
			visibility: row.visibility,
			title: `COPYOF--${row.title}`.slice(0, 200)
		})
		.returning({ id: text_.id });
	await setAuthors(db, copy.id, await authorIds(id));
	await writeItems(copy.id, loaded.items.map((i) => ({ ...i, id: crypto.randomUUID() })));
	return copy.id;
}
