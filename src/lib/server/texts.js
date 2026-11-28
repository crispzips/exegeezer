import { and, asc, count, desc, eq, gt, inArray, isNull, lt, ne, notExists, or, sql } from 'drizzle-orm';
import { alias } from 'drizzle-orm/pg-core';
import { db } from '#lib/server/db/index.js';
import { PUBLIC_MEMORY_MESSAGE, VISIBILITIES, commentaryTitle, isLocked, isPalimpsest, isPermanent, isPublication } from '#lib/textStatus.js';
import { selfPersonaId } from '#lib/server/personae.js';
import { CREDITED, ownedBy } from '#lib/server/ownership.js';
import { editedBy, standing } from '#lib/server/access.js';
import { lockedParagraphs, syncCommentary } from '#lib/server/commentaries.js';
import { comment, commentParagraph, paragraph, persona, renunciation, section, text_, textAuthor, textEditor, textItem, textShare, user, userPersona } from '#lib/server/db/schema.js';

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

/** the fields an imported-details entry may have: short strings describing where a text came from and its rights */
const DETAIL_FIELDS = ['source', 'sourceUrl', 'title', 'author', 'published', 'publisher', 'citation', 'identifier', 'license', 'rights', 'language', 'importedAt'];
const MAX_DETAILS = 100;

/**
 * Check and clean the imported details sent by the client: a list of entries, each a few short strings.
 * @param {unknown} raw
 * @returns {Record<string, string>[] | null} null when malformed; an empty list when none
 */
export function parseImportedDetails(raw) {
	if (raw === undefined || raw === null) return [];
	if (!Array.isArray(raw) || raw.length > MAX_DETAILS) return null;
	/** @type {Record<string, string>[]} */
	const entries = [];
	for (const entry of raw) {
		if (!entry || typeof entry !== 'object' || Array.isArray(entry)) return null;
		/** @type {Record<string, string>} */
		const clean = {};
		for (const field of DETAIL_FIELDS) {
			const v = /** @type {Record<string, unknown>} */ (entry)[field];
			if (v === undefined || v === null || v === '') continue;
			if (typeof v !== 'string') return null;
			clean[field] = v.slice(0, 2000);
		}
		if (Object.keys(clean).length) entries.push(clean);
	}
	return entries;
}

/**
 * The user a request acts for (null when not signed in).
 * @param {App.Locals} locals
 */
function owner(locals) {
	return locals.user?.id ?? null;
}

/**
 * The text row if the requester may use it: only an owner (see `ownedBy`), who must be signed in. Texts with no
 * owner (saved before accounts existed) are reachable by nobody until someone claims them.
 * @param {string} id
 * @param {App.Locals} locals
 */
async function accessible(id, locals) {
	const uid = owner(locals);
	if (!uid || !UUID.test(id)) return null;
	const [row] = await db.select().from(text_).where(and(eq(text_.id, id), ownedBy(uid)));
	return row ?? null;
}

/**
 * The texts the requester authors (shared ones included) or edits, most recently changed first.
 * @param {App.Locals} locals
 */
export async function listTexts(locals) {
	const uid = owner(locals);
	const rows = await db
		.select({ id: text_.id, title: text_.title, type: text_.type, productionStatus: text_.productionStatus, visibility: text_.visibility, createdAt: text_.createdAt, updatedAt: text_.updatedAt })
		.from(text_)
		.where(uid ? or(ownedBy(uid), editedBy(uid)) : isNull(text_.userId))
		.orderBy(desc(text_.updatedAt));
	const authors = await namedAuthors(rows.map((r) => r.id));
	return rows.map((r) => ({ ...r, author: authors.get(r.id)?.map((a) => a.name).join(', ') || null }));
}

/**
 * A text as the requester may read it, in its ordered list. What they may not see (a recanted or burned text's words)
 * is replaced by a mark in each place, so the shape stays for the commentaries to hang on; a commentary shows others
 * only its public comments.
 * @param {string} id
 * @param {App.Locals} locals
 * @returns {Promise<{ id: string, title: string, rallyStyle: string | null, publicized: boolean, access: 'author' | 'editor' | 'reader', canEdit: boolean, canComment: boolean, type: string, productionStatus: string, visibility: string, repressible: boolean, lockedIds: string[], authors: string[], importedDetails: Record<string, string>[], items: Item[] } | null>}
 */
export async function loadText(id, locals) {
	const s = await standing(owner(locals), id);
	if (!s?.read) return null;
	const { row, author, editor } = s;
	let items = await itemsOf(id);
	if (row.type === 'commentary' && !(author || editor || s.overReferent)) {
		const open = new Set((await db.select({ id: paragraph.id }).from(textItem).innerJoin(paragraph, eq(paragraph.id, textItem.paragraphId)).where(and(eq(textItem.textId, id), eq(paragraph.public, true)))).map((r) => r.id));
		items = items.filter((i) => i.level > 0 || open.has(i.id));
	}
	if (!s.content || row.productionStatus === 'burned') {
		const mark = `[${row.productionStatus}]`;
		items = items.map((i) => ({ id: i.id, level: i.level, frontmatter: i.frontmatter, backmatter: i.backmatter, text: i.level > 0 ? `${'#'.repeat(i.level)} ${mark}` : mark }));
	}
	const canEdit = (author || editor) && !isLocked(row);
	const co = (await authorIds(id)).length > 1;
	const [left] = await db.select({ id: renunciation.textId }).from(renunciation).innerJoin(userPersona, eq(userPersona.personaId, renunciation.personaId)).where(and(eq(renunciation.textId, id), eq(userPersona.userId, /** @type {string} */ (owner(locals))))).limit(1);
	return {
		id: row.id,
		title: row.title,
		rallyStyle: row.rallyStyle,
		publicized: !canEdit,
		access: author ? 'author' : editor ? 'editor' : 'reader',
		canEdit,
		canComment: s.comment,
		type: row.type,
		productionStatus: row.productionStatus,
		visibility: row.visibility,
		// whether the repress menu has anything in it for the requester
		repressible: ((author || editor) && isPermanent(row)) || (author && co) || !!left,
		lockedIds: row.type === 'commentary' ? [...(await lockedParagraphs(db, id))] : [],
		authors: await authorNames(id),
		importedDetails: /** @type {Record<string, string>[]} */ (row.importedDetails ?? []),
		items
	};
}

/**
 * The text a user shows as their "about", as anyone may read it: only while it is published and public and is
 * credited to them (see `CREDITED`), so it can't give away a pseudonymous persona of theirs.
 * @param {string} id the chosen text
 * @param {string} uid the user whose about it is
 * @returns {Promise<{ title: string, items: Item[] } | null>}
 */
export async function publicAbout(id, uid) {
	const [row] = await db
		.select({ title: text_.title, productionStatus: text_.productionStatus, visibility: text_.visibility })
		.from(text_)
		.where(and(eq(text_.id, id), sql`exists (select 1 from ${CREDITED} c where c.text_id = ${id} and c.user_id = ${uid})`));
	return row && isPublication(row) ? { title: row.title, items: await itemsOf(id) } : null;
}

/**
 * A text's content, in order. Says nothing about who may read it: the callers check that.
 * @param {string} id
 * @returns {Promise<Item[]>}
 */
async function itemsOf(id) {
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
	return rows.map((r) =>
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
 * Content only texts the writer neither authors nor edits use can't be linked (that would be a way to read it), and
 * content a publication or palimpsest also uses is never rewritten.
 * @param {string} id
 * @param {Item[]} items
 * @param {string} uid who is writing
 * @returns {Promise<boolean>} false (and nothing is written) when an item belongs to someone else's text
 */
async function writeItems(id, items, uid) {
	return db.transaction(async (tx) => {
		const before = await tx
			.select({ paragraphId: textItem.paragraphId, sectionId: textItem.sectionId })
			.from(textItem)
			.where(eq(textItem.textId, id));
		const hadParagraphs = new Set(before.map((r) => r.paragraphId).filter((x) => x !== null));
		const hadSections = new Set(before.map((r) => r.sectionId).filter((x) => x !== null));

		for (const [column, had, level] of /** @type {const} */ ([[textItem.paragraphId, hadParagraphs, false], [textItem.sectionId, hadSections, true]])) {
			const fresh = items.filter((i) => i.level > 0 === level && !had.has(i.id)).map((i) => i.id);
			for (let k = 0; k < fresh.length; k += CHUNK) {
				const rows = await tx
					.select({ id: column, open: sql`bool_or(${or(ownedBy(uid), editedBy(uid))})` })
					.from(textItem)
					.innerJoin(text_, eq(text_.id, textItem.textId))
					.where(inArray(column, fresh.slice(k, k + CHUNK)))
					.groupBy(column);
				if (rows.some((r) => !r.open)) return false;
			}
		}
		// what a publication or palimpsest holds stays as it is, whoever else uses it
		const kept = new Set();
		for (const column of [textItem.paragraphId, textItem.sectionId]) {
			const ids = /** @type {string[]} */ ([...(column === textItem.paragraphId ? hadParagraphs : hadSections)]);
			for (let k = 0; k < ids.length; k += CHUNK) {
				const rows = await tx
					.select({ id: column })
					.from(textItem)
					.innerJoin(text_, eq(text_.id, textItem.textId))
					.where(and(inArray(column, ids.slice(k, k + CHUNK)), ne(text_.id, id), eq(text_.visibility, 'public'), inArray(text_.productionStatus, ['published', 'recanted', 'burned'])));
				for (const r of rows) kept.add(r.id);
			}
		}

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
			const own = rows.filter((r) => hadParagraphs.has(r.id) && !kept.has(r.id));
			const rest = rows.filter((r) => !hadParagraphs.has(r.id));
			if (own.length) await tx.insert(paragraph).values(own).onConflictDoUpdate({ target: paragraph.id, set: { body: sql`excluded.body`, title: sql`excluded.title`, description: sql`excluded.description` } });
			if (rest.length) await tx.insert(paragraph).values(rest).onConflictDoNothing();
		}
		for (let k = 0; k < sections.length; k += CHUNK) {
			const rows = sections.slice(k, k + CHUNK);
			const own = rows.filter((r) => hadSections.has(r.id) && !kept.has(r.id));
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
		return true;
	});
}

/**
 * Create a text holding `items`.
 * @param {App.Locals} locals
 * @param {string} title
 * @param {Item[]} items
 * @param {string} visibility 'private' or 'public'
 * @param {string | null} [rallyStyle] the text's default rally type, when it is made by a rally
 * @param {Record<string, string>[]} [importedDetails] where the text was imported from, and its rights (from parseImportedDetails)
 */
export async function createText(locals, title, items, visibility, rallyStyle = null, importedDetails = []) {
	const uid = /** @type {string} */ (owner(locals));
	const personaId = await selfPersonaId(uid);
	const [row] = await db.insert(text_).values({ userId: uid, personaId, visibility, rallyStyle, title: title ?? 'Untitled', importedDetails: importedDetails.length ? importedDetails : null }).returning({ id: text_.id });
	if (personaId) await setAuthors(db, row.id, [personaId]);
	if (!(await writeItems(row.id, items, uid))) {
		await db.delete(text_).where(eq(text_.id, row.id));
		return null;
	}
	return row.id;
}

/**
 * Replace an existing text's contents. Its authors and editors may, while its words are open to change; in a published
 * commentary the public comments are not.
 * @param {string} id
 * @param {App.Locals} locals
 * @param {Item[]} items
 * @param {Record<string, string>[]} [addDetails] imported details to add to the text's own (an import into an existing text)
 * @returns {Promise<true | false | 'locked' | 'memory' | 'foreign'>} false when the text does not exist or is not the requester's to edit
 */
export async function saveText(id, locals, items, addDetails = []) {
	const uid = owner(locals);
	const s = await standing(uid, id);
	if (!uid || !s || !(s.author || s.editor)) return false;
	const { row } = s;
	if (isLocked(row)) return 'locked';
	if (row.type === 'commentary') {
		const locked = await lockedParagraphs(db, id);
		if (locked.size) {
			const had = (await itemsOf(id)).filter((i) => locked.has(i.id));
			const next = new Map(items.map((i) => [i.id, i]));
			const same = (/** @type {Item} */ a, /** @type {Item | undefined} */ b) => !!b && a.text === b.text && (a.title ?? '') === (b.title ?? '') && (a.description ?? '') === (b.description ?? '');
			if (!had.every((i) => same(i, next.get(i.id)))) return 'memory';
		}
	}
	if (!(await writeItems(id, items, uid))) return 'foreign';
	if (addDetails.length) {
		const had = /** @type {Record<string, string>[]} */ (row.importedDetails ?? []);
		const fresh = addDetails.filter((d) => !had.some((h) => h.source === d.source && h.sourceUrl === d.sourceUrl && h.title === d.title));
		if (fresh.length) await db.update(text_).set({ importedDetails: [...had, ...fresh].slice(0, MAX_DETAILS) }).where(eq(text_.id, id));
	}
	if (row.type === 'commentary') await syncCommentary(db, id);
	return true;
}

/** @param {unknown} v */
export const isRallyStyle = (v) => typeof v === 'string' && ['compose', 'copy', 'recall', 'dictate'].includes(v);

/**
 * Give a text its default rally type.
 * @param {string} id
 * @param {App.Locals} locals
 * @param {string} rallyStyle
 * @returns {Promise<true | false | 'locked'>} false when the text does not exist or is not the requester's; 'locked' when it is published and public
 */
export async function setRallyStyle(id, locals, rallyStyle) {
	const s = await standing(owner(locals), id);
	if (!s || !(s.author || s.editor)) return false;
	if (isLocked(s.row)) return 'locked';
	await db.update(text_).set({ rallyStyle }).where(eq(text_.id, id));
	return true;
}

/** @param {unknown} v */
export const isVisibility = (v) => typeof v === 'string' && VISIBILITIES.includes(v);

/**
 * What the profile's lists say about commentaries: which of the user's texts have one (their own, or a public one by
 * anybody), and for each of the user's commentaries the text it glosses and how many comments it holds.
 * @param {string} uid
 */
export async function commentaryOverview(uid) {
	const referent = alias(text_, 'referent');
	const owned = new Set((await db.select({ id: text_.id }).from(text_).where(ownedBy(uid))).map((t) => t.id));
	const glossing = await db
		.select({ on: text_.commentaryOn })
		.from(text_)
		.innerJoin(referent, eq(referent.id, text_.commentaryOn))
		.where(and(ownedBy(uid, referent), or(ownedBy(uid), eq(text_.visibility, 'public'))));
	const mine = await db
		.select({ id: text_.id, refId: referent.id, refTitle: referent.title, refType: referent.type, refVisibility: referent.visibility })
		.from(text_)
		.innerJoin(referent, eq(referent.id, text_.commentaryOn))
		.where(ownedBy(uid));
	const counts = await db
		.select({ id: comment.commentaryId, n: count() })
		.from(comment)
		.innerJoin(text_, eq(text_.id, comment.commentaryId))
		.where(ownedBy(uid))
		.groupBy(comment.commentaryId);
	const comments = new Map(counts.map((c) => [c.id, c.n]));
	return {
		/** ids of the user's texts that have a commentary */
		commented: new Set(glossing.map((g) => g.on)),
		/** commentary id -> its referent (named only if the user may know its title) and its number of comments */
		commentaries: new Map(
			mine.map((c) => [
				c.id,
				{
					referent: {
						kind: /** @type {'text' | 'commentary'} */ (c.refType === 'commentary' ? 'commentary' : 'text'),
						title: owned.has(c.refId) || c.refVisibility === 'public' ? c.refTitle : null
					},
					comments: comments.get(c.id) ?? 0
				}
			])
		)
	};
}

/**
 * A text's properties (everything but its content), for the settings modal: for its authors, and (to read, and to
 * propose from) its editors.
 * @param {string} id
 * @param {App.Locals} locals
 */
export async function loadTextProperties(id, locals) {
	const s = await standing(owner(locals), id);
	if (!s || !(s.author || s.editor)) return null;
	const { row } = s;
	const editors = await db.select({ id: textEditor.personaId }).from(textEditor).where(eq(textEditor.textId, id));
	const shares = await db.select({ userId: textShare.userId, groupId: textShare.groupId, privilege: textShare.privilege }).from(textShare).where(eq(textShare.textId, id));
	return {
		id: row.id,
		title: row.title,
		description: row.description ?? '',
		type: row.type,
		access: s.author ? 'author' : 'editor',
		personaIds: await authorIds(id),
		editorIds: editors.map((e) => e.id),
		shares,
		productionStatus: row.productionStatus,
		visibility: row.visibility,
		commentPolicy: row.commentPolicy,
		importedDetails: /** @type {Record<string, string>[]} */ (row.importedDetails ?? []),
		publicized: isPermanent(row),
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
 * Set a text's authors (in order); `text.persona_id` follows the first one. The authors' users own the text, so
 * if the account it is saved under no longer has an author persona, it is saved under one that does.
 * @param {Pick<typeof db, 'delete' | 'insert' | 'update'>} conn the database or a transaction
 * @param {string} textId
 * @param {string[]} personaIds
 */
export async function setAuthors(conn, textId, personaIds) {
	await conn.delete(textAuthor).where(eq(textAuthor.textId, textId));
	if (personaIds.length) await conn.insert(textAuthor).values(personaIds.map((personaId, position) => ({ textId, personaId, position })));
	// (the current account sorts first, so it stays whenever it still has an author persona)
	const userId = sql`coalesce((
		select up.user_id from text_author a join user_persona up on up.persona_id = a.persona_id
		where a.text_id = ${textId}
		order by (up.user_id = "text"."user_id") desc nulls last, a.position, up.created_at limit 1), "text"."user_id")`;
	await conn.update(text_).set({ personaId: personaIds[0] ?? null, userId }).where(eq(text_.id, textId));
}

/**
 * Each text's authors in order, named as anyone sees them (a user's "self" shows as their profile name).
 * @param {string[]} textIds
 * @returns {Promise<Map<string, { id: string, name: string }[]>>}
 */
export async function namedAuthors(textIds) {
	/** @type {Map<string, { id: string, name: string }[]>} */
	const out = new Map();
	for (let k = 0; k < textIds.length; k += CHUNK) {
		const rows = await db
			.select({ textId: textAuthor.textId, id: persona.id, name: persona.name, userName: user.name })
			.from(textAuthor)
			.innerJoin(persona, eq(persona.id, textAuthor.personaId))
			.leftJoin(userPersona, and(eq(userPersona.personaId, persona.id), eq(userPersona.isSelf, true)))
			.leftJoin(user, eq(user.id, userPersona.userId))
			.where(inArray(textAuthor.textId, textIds.slice(k, k + CHUNK)))
			.orderBy(asc(textAuthor.position));
		for (const r of rows) out.set(r.textId, [...(out.get(r.textId) ?? []), { id: r.id, name: r.userName || r.name }]);
	}
	return out;
}

/**
 * The names a text is by, in order.
 * @param {string} textId
 * @returns {Promise<string[]>}
 */
async function authorNames(textId) {
	return (await namedAuthors([textId])).get(textId)?.map((a) => a.name) ?? [];
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
	return rows.map((r) => ({ id: r.id, name: r.isSelf ? (locals.user?.name || r.name) : r.name }));
}

/**
 * The authors a text's settings can list: the requester's personae, then the text's other authors (which can be
 * kept or removed, not added).
 * @param {string} textId
 * @param {App.Locals} locals
 */
export async function authorOptions(textId, locals) {
	const choices = await authorChoices(locals);
	const others = (await namedAuthors([textId])).get(textId)?.filter((a) => !choices.some((c) => c.id === a.id)) ?? [];
	return [...choices, ...others];
}

/**
 * Copy a text into a new one called `COPYOF--<title>`, with the same content. The copy starts over as a private
 * manuscript (so copying a publication makes nothing permanent). It gets fresh paragraph and section ids, so it shares
 * nothing with the original. Only an author may.
 * @param {string} id
 * @param {App.Locals} locals
 * @returns {Promise<string | null>} the copy's id; null when the text does not exist or is not the requester's
 */
export async function duplicateText(id, locals) {
	const row = await accessible(id, locals);
	if (!row || row.productionStatus === 'burned') return null;
	const uid = /** @type {string} */ (owner(locals));
	const items = await itemsOf(id);
	const [copy] = await db
		.insert(text_)
		.values({
			// the copy is saved under whoever made it; its authors (and so its owners) are the original's
			userId: uid,
			personaId: row.personaId,
			type: row.type,
			commentaryOn: row.commentaryOn,
			commentPolicy: row.commentPolicy,
			description: row.description,
			importedDetails: row.importedDetails,
			title: `COPYOF--${row.title}`.slice(0, 200)
		})
		.returning({ id: text_.id });
	await setAuthors(db, copy.id, await authorIds(id));
	await writeItems(copy.id, items.map((i) => ({ ...i, id: crypto.randomUUID() })), uid);
	if (row.type === 'commentary') await syncCommentary(db, copy.id);
	return copy.id;
}

/**
 * A user's commentary on a text: the one saved under their account, else the oldest on it that they co-own.
 * @param {Pick<typeof db, 'select'>} conn the database or a transaction
 * @param {string} uid
 * @param {string} textId the text commented on
 */
export async function commentaryBy(conn, uid, textId) {
	const [row] = await conn
		.select({ id: text_.id, productionStatus: text_.productionStatus, visibility: text_.visibility })
		.from(text_)
		.where(and(eq(text_.commentaryOn, textId), ownedBy(uid)))
		.orderBy(sql`(${text_.userId} = ${uid}) desc nulls last`, asc(text_.createdAt))
		.limit(1);
	return row ?? null;
}

/**
 * A new, empty commentary on a text, written as the user's "self" persona.
 * @param {Pick<typeof db, 'delete' | 'insert' | 'update'>} conn the database or a transaction
 * @param {{ uid: string, personaId: string | null, textId: string, title: string }} commentary
 */
async function createCommentary(conn, { uid, personaId, textId, title }) {
	const [row] = await conn
		.insert(text_)
		.values({ userId: uid, personaId, type: 'commentary', commentaryOn: textId, title })
		.returning({ id: text_.id, productionStatus: text_.productionStatus, visibility: text_.visibility });
	if (personaId) await setAuthors(conn, row.id, [personaId]);
	return row;
}

/**
 * The id of a user's commentary on a text, made if they have none. Whether they may comment is for the caller to decide.
 * @param {string} uid
 * @param {{ id: string, title: string }} original the text commented on
 */
export async function ensureCommentary(uid, original) {
	const personaId = await selfPersonaId(uid);
	const title = commentaryTitle(await authorNames(original.id), original.title);
	return db.transaction(async (tx) => {
		const commentary = (await commentaryBy(tx, uid, original.id)) ?? (await createCommentary(tx, { uid, personaId, textId: original.id, title }));
		await syncCommentary(tx, commentary.id);
		return commentary.id;
	});
}

/**
 * Leave a comment on one or more paragraphs of a text (a section is commented on by naming all its paragraphs). A commentary
 * is a text too, so it can be commented on in turn. The comment is a paragraph in the requester's commentary on that text;
 * the commentary is created (named "Commentary on <authors>'s <title>") by the first comment, so a comment never
 * exists without a text to belong to. Who may comment is `standing`'s answer. A comment is private (for the authors'
 * and editors' eyes) unless marked public. Which commentary is the requester's is `commentaryBy`'s answer.
 * @param {string} textId the text commented on
 * @param {App.Locals} locals
 * @param {string[]} paragraphIds the paragraphs commented on (paragraphs of that text)
 * @param {string} body the comment
 * @param {boolean} [open] mark it public
 * @returns {Promise<{ ok: true, commentaryId: string, commentId: string, created: boolean } | { ok: false, status: number, message: string }>}
 */
export async function addComment(textId, locals, paragraphIds, body, open = false) {
	const uid = owner(locals);
	const s = await standing(uid, textId);
	if (!uid || !s?.read) return { ok: false, status: 404, message: 'No such text' };
	if (!s.comment) return { ok: false, status: 403, message: isPalimpsest(s.row) ? "A repressed text takes no new comments." : "You can't comment on this text." };
	if (!body.trim()) return { ok: false, status: 400, message: 'Write a comment.' };
	const targets = [...new Set(paragraphIds)];
	if (!targets.length || targets.length > CHUNK || !targets.every((id) => UUID.test(id))) return { ok: false, status: 400, message: 'Choose a paragraph.' };
	const onText = await db.select({ p: textItem.paragraphId }).from(textItem).where(and(eq(textItem.textId, textId), inArray(textItem.paragraphId, targets)));
	if (new Set(onText.map((r) => r.p)).size !== targets.length) return { ok: false, status: 400, message: "That paragraph isn't in this text." };
	const personaId = await selfPersonaId(uid);
	const title = commentaryTitle(await authorNames(textId), s.row.title);

	return db.transaction(async (tx) => {
		let commentary = await commentaryBy(tx, uid, textId);
		if (commentary && isPalimpsest(commentary)) return { ok: false, status: 409, message: 'You have repressed your commentary on this text, so nothing more goes into it.' };
		const created = !commentary;
		if (!commentary) {
			commentary = await createCommentary(tx, { uid, personaId, textId, title });
		}
		const [{ n }] = await tx.select({ n: sql`count(*)::int` }).from(textItem).where(eq(textItem.textId, commentary.id));
		const [para] = await tx.insert(paragraph).values({ body: body.trim(), public: open }).returning({ id: paragraph.id });
		await tx.insert(textItem).values({ textId: commentary.id, position: Number(n), paragraphId: para.id });
		const [row] = await tx.insert(comment).values({ commentaryId: commentary.id, bodyParagraphId: para.id }).returning({ id: comment.id });
		await tx.insert(commentParagraph).values(targets.map((paragraphId) => ({ commentId: row.id, paragraphId })));
		await syncCommentary(tx, commentary.id);
		return { ok: true, commentaryId: commentary.id, commentId: row.id, created };
	});
}

/**
 * One of the requester's comments on a text (in a commentary they author or edit), if it may still change.
 * @param {string} textId the text commented on
 * @param {App.Locals} locals
 * @param {string} commentId
 * @returns {Promise<{ ok: true, commentaryId: string, paragraphId: string } | { ok: false, status: number, message: string }>}
 */
export async function ownComment(textId, locals, commentId) {
	const uid = owner(locals);
	const missing = /** @type {const} */ ({ ok: false, status: 404, message: 'No such comment' });
	if (!uid || !UUID.test(textId) || !UUID.test(commentId)) return missing;
	const [row] = await db
		.select({ commentaryId: comment.commentaryId, paragraphId: comment.bodyParagraphId, productionStatus: text_.productionStatus, visibility: text_.visibility })
		.from(comment)
		.innerJoin(text_, eq(text_.id, comment.commentaryId))
		.where(and(eq(comment.id, commentId), eq(text_.commentaryOn, textId), or(ownedBy(uid), editedBy(uid))));
	if (!row) return missing;
	if (isPalimpsest(row) || (await lockedParagraphs(db, row.commentaryId)).has(row.paragraphId)) return { ok: false, status: 409, message: PUBLIC_MEMORY_MESSAGE };
	return { ok: true, commentaryId: row.commentaryId, paragraphId: row.paragraphId };
}

/**
 * Change the words of a comment of the requester's, on this text.
 * @param {string} textId the text commented on
 * @param {App.Locals} locals
 * @param {string} commentId
 * @param {string} body the comment's new words
 * @returns {Promise<{ ok: true, commentaryId: string } | { ok: false, status: number, message: string }>}
 */
export async function editComment(textId, locals, commentId, body) {
	const row = await ownComment(textId, locals, commentId);
	if (!row.ok) return row;
	if (!body.trim()) return { ok: false, status: 400, message: 'Write a comment.' };
	await db.transaction(async (tx) => {
		await tx.update(paragraph).set({ body: body.trim() }).where(eq(paragraph.id, row.paragraphId));
		await tx.update(text_).set({ updatedAt: new Date() }).where(eq(text_.id, row.commentaryId));
	});
	return { ok: true, commentaryId: row.commentaryId };
}

/**
 * Delete one of the requester's comments on this text: its row, and its words in their commentary. The commentary
 * itself stays, even when this was its last comment.
 * @param {string} textId the text commented on
 * @param {App.Locals} locals
 * @param {string} commentId
 * @returns {Promise<{ ok: true, commentaryId: string } | { ok: false, status: number, message: string }>}
 */
export async function deleteComment(textId, locals, commentId) {
	const row = await ownComment(textId, locals, commentId);
	if (!row.ok) return row;
	await db.transaction(async (tx) => {
		await tx.delete(comment).where(eq(comment.id, commentId));
		const inCommentary = eq(textItem.textId, row.commentaryId);
		const [gone] = await tx.delete(textItem).where(and(inCommentary, eq(textItem.paragraphId, row.paragraphId))).returning({ position: textItem.position });
		if (gone) {
			// close the gap, so positions stay 0, 1, 2… (by way of negative numbers: no two rows may share a position, even midway)
			await tx.update(textItem).set({ position: sql`-${textItem.position}` }).where(and(inCommentary, gt(textItem.position, gone.position)));
			await tx.update(textItem).set({ position: sql`-${textItem.position} - 1` }).where(and(inCommentary, lt(textItem.position, 0)));
		}
		// words another text has taken up stay with it
		await tx.delete(paragraph).where(and(eq(paragraph.id, row.paragraphId), notExists(tx.select().from(textItem).where(eq(textItem.paragraphId, paragraph.id)))));
		await tx.update(text_).set({ updatedAt: new Date() }).where(eq(text_.id, row.commentaryId));
		await syncCommentary(tx, row.commentaryId);
	});
	return { ok: true, commentaryId: row.commentaryId };
}

/**
 * The comments on a text that the requester may see, oldest first: all of them for the text's authors and editors,
 * their own commentary's for its authors and editors, and otherwise those marked public. A repressed commentary's
 * words are withheld as a text's are.
 * @param {string} textId
 * @param {App.Locals} locals
 * @returns {Promise<{ id: string, commentaryId: string, authors: string[], body: string, createdAt: string, paragraphIds: string[], editable: boolean, public: boolean, markable: boolean }[] | null>} null when the requester can't read the text
 */
export async function listComments(textId, locals) {
	const uid = owner(locals);
	const s = await standing(uid, textId);
	if (!uid || !s?.read) return null;
	const rows = await db
		.select({ id: comment.id, commentaryId: comment.commentaryId, body: paragraph.body, open: paragraph.public, bodyId: paragraph.id, createdAt: comment.createdAt, paragraphId: commentParagraph.paragraphId, productionStatus: text_.productionStatus, visibility: text_.visibility })
		.from(comment)
		.innerJoin(text_, eq(text_.id, comment.commentaryId))
		.innerJoin(paragraph, eq(paragraph.id, comment.bodyParagraphId))
		.innerJoin(commentParagraph, eq(commentParagraph.commentId, comment.id))
		.where(eq(text_.commentaryOn, textId))
		.orderBy(asc(comment.createdAt), asc(comment.id));
	const mine = new Map((await db.select({ id: text_.id, author: sql`${ownedBy(uid)}`.mapWith(Boolean) }).from(text_).where(and(eq(text_.commentaryOn, textId), or(ownedBy(uid), editedBy(uid))))).map((t) => [t.id, t.author]));
	const seen = rows.filter((r) => mine.has(r.commentaryId) || s.author || s.editor || r.open);
	/** @type {Map<string, string[]>} commentary -> its authors */
	const names = new Map();
	/** @type {Map<string, Set<string>>} commentary -> its paragraphs in public memory */
	const memory = new Map();
	for (const id of new Set(seen.map((r) => r.commentaryId))) {
		names.set(id, await authorNames(id));
		memory.set(id, await lockedParagraphs(db, id));
	}
	/** @type {Map<string, { id: string, commentaryId: string, authors: string[], body: string, createdAt: string, paragraphIds: string[], editable: boolean, public: boolean, markable: boolean }>} */
	const out = new Map();
	for (const r of seen) {
		const c = out.get(r.id);
		if (c) {
			c.paragraphIds.push(r.paragraphId);
			continue;
		}
		const own = mine.has(r.commentaryId);
		const fixed = isPalimpsest(r) || !!memory.get(r.commentaryId)?.has(r.bodyId);
		const withheld = r.productionStatus === 'burned' || (r.productionStatus === 'recanted' && !own);
		out.set(r.id, { id: r.id, commentaryId: r.commentaryId, authors: names.get(r.commentaryId) ?? [], body: withheld ? `[${r.productionStatus}]` : r.body, createdAt: r.createdAt.toISOString(), paragraphIds: [r.paragraphId], editable: own && !fixed, public: r.open, markable: !!mine.get(r.commentaryId) && !fixed });
	}
	return [...out.values()];
}
