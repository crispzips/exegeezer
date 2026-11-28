import { asc, eq } from 'drizzle-orm';
import { db } from '#lib/server/db/index.js';
import { renunciation, tag, text_, textAuthor, textEditor, textTag, userPersona } from '#lib/server/db/schema.js';
import { standing } from '#lib/server/access.js';
import { namePersonae } from '#lib/server/circulation.js';
import { namedAuthors } from '#lib/server/texts.js';
import { globalCredits } from '#lib/server/tags.js';

/**
 * A text's head: its metadata, which anyone who may read the text may read, whatever has become of its words. With it,
 * what the requester is to the text (`me`), for the menus.
 * @param {string} id
 * @param {App.Locals} locals
 */
export async function textHead(id, locals) {
	const uid = locals.user?.id;
	const s = await standing(uid, id);
	if (!uid || !s?.read) return null;
	const { row } = s;
	const authors = (await namedAuthors([id])).get(id) ?? [];
	const editors = await db.select({ id: textEditor.personaId }).from(textEditor).where(eq(textEditor.textId, id));
	const left = await db.select().from(renunciation).where(eq(renunciation.textId, id)).orderBy(asc(renunciation.createdAt));
	const names = new Map((await namePersonae(left.map((r) => r.personaId))).map((p) => [p.id, p.name]));
	// the text's own tags (a commentary's describe the text it is on, so it shows none of its own)
	const tags = row.type === 'commentary' ? [] : await db.selectDistinct({ name: tag.name }).from(textTag).innerJoin(tag, eq(tag.id, textTag.tagId)).where(eq(textTag.textId, id)).orderBy(asc(tag.name));
	const on = row.commentaryOn ? (await db.select({ title: text_.title }).from(text_).where(eq(text_.id, row.commentaryOn)))[0] : null;
	const mine = new Set((await db.select({ id: userPersona.personaId }).from(userPersona).where(eq(userPersona.userId, uid))).map((p) => p.id));
	const authored = (await db.select({ id: textAuthor.personaId }).from(textAuthor).where(eq(textAuthor.textId, id))).map((a) => a.id);
	return {
		id,
		title: row.title,
		description: row.description ?? '',
		type: row.type,
		productionStatus: row.productionStatus,
		visibility: row.visibility,
		authors: authors.map((a) => a.name),
		editors: (await namePersonae(editors.map((e) => e.id))).map((e) => e.name),
		renunciations: left.map((r) => ({ name: names.get(r.personaId) ?? 'A persona', extreme: r.extreme, on: r.createdAt.toISOString() })),
		tags: tags.map((t) => t.name),
		// a global set's tags are shown with its credit
		credits: tags.length ? await globalCredits() : [],
		commentaryOn: on ? { id: /** @type {string} */ (row.commentaryOn), title: on.title } : null,
		importedDetails: /** @type {Record<string, string>[]} */ (row.importedDetails ?? []),
		createdAt: row.createdAt.toISOString(),
		updatedAt: row.updatedAt.toISOString(),
		me: {
			access: s.author ? 'author' : s.editor ? 'editor' : 'reader',
			coAuthored: authored.length > 1,
			// the requester's personae that author the text, and those of theirs that have renounced it
			authorPersonae: authors.filter((a) => mine.has(a.id)),
			renounced: left.filter((r) => mine.has(r.personaId)).map((r) => ({ id: r.personaId, name: names.get(r.personaId) ?? 'A persona', extreme: r.extreme }))
		}
	};
}
