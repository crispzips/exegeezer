import { and, asc, count, eq, inArray, ne } from 'drizzle-orm';
import { paragraph, persona, renunciation, text_, textAuthor, textEditor, textItem, textShare, userPersona } from '#lib/server/db/schema.js';
import { setAuthors } from '#lib/server/texts.js';
import { selfPersonaId } from '#lib/server/personae.js';
import { lockedParagraphs, syncCommentaries, syncCommentary } from '#lib/server/commentaries.js';
import { destroyText, dropUnused, eraseContent } from '#lib/server/repression.js';
import { CHOOSABLE_STATUSES, COMMENT_POLICIES, LOCKED_MESSAGE, PUBLIC_MEMORY_MESSAGE, VISIBILITIES, isPalimpsest, isPermanent, isPublication } from '#lib/textStatus.js';

/**
 * Everything that waits on agreement (see consent.js). Each action says whether it still makes sense (`check`: what is
 * wrong, or null) and carries itself out (`run`, in a transaction).
 *
 * @typedef {Parameters<Parameters<typeof import('#lib/server/db/index.js').db.transaction>[0]>[0]} Tx
 * @typedef {Pick<typeof import('#lib/server/db/index.js').db, 'select' | 'execute'>} Conn
 * @typedef {{ textId: string | null, personaId: string | null, action: string, payload: any, proposedBy: string }} Proposal
 * @typedef {{ check: (conn: Conn, p: Proposal) => Promise<string | null>, run: (tx: Tx, p: Proposal) => Promise<void> }} Action
 */

/** @param {Conn} conn @param {string | null} id */
async function textRow(conn, id) {
	if (!id) return null;
	const [row] = await conn.select().from(text_).where(eq(text_.id, id));
	return row ?? null;
}

/** @param {Conn} conn @param {string} textId */
async function authorsOf(conn, textId) {
	const rows = await conn.select({ id: textAuthor.personaId }).from(textAuthor).where(eq(textAuthor.textId, textId)).orderBy(asc(textAuthor.position));
	return rows.map((r) => r.id);
}

/** @param {Conn} conn @param {string} textId @param {string} personaId */
async function renunciationOf(conn, textId, personaId) {
	const [row] = await conn.select().from(renunciation).where(and(eq(renunciation.textId, textId), eq(renunciation.personaId, personaId)));
	return row ?? null;
}

/**
 * What a text's status and visibility become, or why they can't. Making a circulated text public publishes it.
 * @param {typeof text_.$inferSelect} row
 * @param {{ productionStatus?: string, visibility?: string }} next
 * @returns {{ error: string } | { productionStatus: string, visibility: string }}
 */
export function planStatus(row, next) {
	const visibility = next.visibility ?? row.visibility;
	let productionStatus = next.productionStatus ?? row.productionStatus;
	if (!VISIBILITIES.includes(visibility)) return { error: 'Choose a visibility.' };
	if (productionStatus !== row.productionStatus && !CHOOSABLE_STATUSES.includes(productionStatus)) return { error: 'Choose a production status.' };
	if (row.productionStatus === 'circulated' && row.visibility === 'private' && visibility === 'public' && productionStatus === 'circulated') productionStatus = 'published';
	if (productionStatus === 'published' && visibility !== 'public') return { error: "A private text can't be published. Circulate it instead." };
	if (productionStatus === 'circulated' && visibility !== 'private') return { error: 'Only a private text can be circulated.' };
	return { productionStatus, visibility };
}

/** @type {Action} */
const properties = {
	async check(conn, p) {
		const row = await textRow(conn, p.textId);
		if (!row) return 'No such text';
		const next = p.payload ?? {};
		if (isPermanent(row) && Object.keys(next).some((k) => k !== 'commentPolicy')) return LOCKED_MESSAGE;
		if (next.commentPolicy !== undefined && !COMMENT_POLICIES.includes(next.commentPolicy)) return 'Choose who may comment.';
		if (next.title !== undefined && !next.title) return 'Enter a title.';
		if (row.type === 'commentary' && (next.productionStatus !== undefined || next.visibility !== undefined)) return "A commentary's status and visibility follow the text it is on. Mark its comments public or private instead.";
		const planned = planStatus(row, next);
		if ('error' in planned) return planned.error;
		const authors = next.personaIds ?? (await authorsOf(conn, row.id));
		if (next.personaIds) {
			if (!next.personaIds.length) return 'Choose at least one author.';
			const [back] = await conn.select({ id: renunciation.personaId }).from(renunciation).where(and(eq(renunciation.textId, row.id), inArray(renunciation.personaId, next.personaIds)));
			if (back) return 'A persona that has renounced this text returns only by undoing its renunciation.';
		}
		if (next.editorIds?.some((/** @type {string} */ id) => authors.includes(id))) return 'An author needs no editing role as well.';
		return null;
	},
	async run(tx, p) {
		const row = /** @type {typeof text_.$inferSelect} */ (await textRow(tx, p.textId));
		const { title, description, commentPolicy, personaIds, editorIds, shares } = p.payload ?? {};
		const planned = /** @type {{ productionStatus: string, visibility: string }} */ (planStatus(row, p.payload ?? {}));
		await tx
			.update(text_)
			.set({
				...(title !== undefined ? { title } : {}),
				...(description !== undefined ? { description: description || null } : {}),
				...(commentPolicy !== undefined ? { commentPolicy } : {}),
				...(row.type === 'commentary' ? {} : planned)
			})
			.where(eq(text_.id, row.id));
		if (personaIds) await setAuthors(tx, row.id, personaIds);
		if (editorIds) {
			await tx.delete(textEditor).where(eq(textEditor.textId, row.id));
			if (editorIds.length) await tx.insert(textEditor).values(editorIds.map((/** @type {string} */ personaId) => ({ textId: row.id, personaId })));
		}
		// an author is not also listed as an editor
		if (personaIds?.length) await tx.delete(textEditor).where(and(eq(textEditor.textId, row.id), inArray(textEditor.personaId, personaIds)));
		if (shares) {
			await tx.delete(textShare).where(eq(textShare.textId, row.id));
			if (shares.length) await tx.insert(textShare).values(shares.map((/** @type {any} */ s) => ({ textId: row.id, userId: s.userId ?? null, groupId: s.groupId ?? null, privilege: s.privilege })));
		}
		if (row.type === 'commentary') await syncCommentary(tx, row.id);
		else await syncCommentaries(tx, row.id);
	}
};

/**
 * Recanting and derecanting: a publication's words are hidden from the public, or shown again.
 * @param {'published' | 'recanted'} from @param {'published' | 'recanted'} to @param {string} problem
 * @returns {Action}
 */
const turn = (from, to, problem) => ({
	async check(conn, p) {
		const row = await textRow(conn, p.textId);
		if (!row) return 'No such text';
		return row.visibility === 'public' && row.productionStatus === from ? null : problem;
	},
	async run(tx, p) {
		const id = /** @type {string} */ (p.textId);
		await tx.update(text_).set({ productionStatus: to }).where(eq(text_.id, id));
		await syncCommentaries(tx, id);
	}
});

/** Burning: a publication or recanted text loses its words for good; anything unpublished is destroyed whole. @type {Action} */
const burn = {
	async check(conn, p) {
		const row = await textRow(conn, p.textId);
		if (!row) return 'No such text';
		return row.productionStatus === 'burned' ? 'This text has been burned already.' : null;
	},
	async run(tx, p) {
		const row = /** @type {typeof text_.$inferSelect} */ (await textRow(tx, p.textId));
		if (!isPermanent(row)) return destroyText(tx, row.id);
		await eraseContent(tx, row.id);
		await tx.update(text_).set({ productionStatus: 'burned' }).where(eq(text_.id, row.id));
		await syncCommentaries(tx, row.id);
	}
};

/** Wiping a text clean: its content goes, the text and its settings stay. @type {Action} */
const wipe = {
	async check(conn, p) {
		const row = await textRow(conn, p.textId);
		if (!row) return 'No such text';
		if (isPublication(row) && row.type !== 'commentary') return LOCKED_MESSAGE;
		if (isPalimpsest(row)) return LOCKED_MESSAGE;
		return row.type === 'commentary' && (await lockedParagraphs(conn, row.id)).size ? PUBLIC_MEMORY_MESSAGE : null;
	},
	async run(tx, p) {
		const id = /** @type {string} */ (p.textId);
		const items = await tx.select({ p: textItem.paragraphId, s: textItem.sectionId }).from(textItem).where(eq(textItem.textId, id));
		await tx.delete(textItem).where(eq(textItem.textId, id));
		await dropUnused(tx, /** @type {string[]} */ (items.map((i) => i.p).filter(Boolean)), /** @type {string[]} */ (items.map((i) => i.s).filter(Boolean)));
		await tx.update(text_).set({ updatedAt: new Date() }).where(eq(text_.id, id));
		await syncCommentary(tx, id);
	}
};

/** An author persona leaves a co-authored text, on its own account. The renunciation stays on record. @type {Action} */
const renounce = {
	async check(conn, p) {
		const row = await textRow(conn, p.textId);
		if (!row || !p.personaId) return 'No such text';
		const extreme = !!p.payload?.extreme;
		const had = await renunciationOf(conn, row.id, p.personaId);
		if (had) return extreme && !had.extreme ? null : 'That persona has renounced this text already.';
		const authors = await authorsOf(conn, row.id);
		if (!authors.includes(p.personaId)) return 'That persona is not an author of this text.';
		return authors.length > 1 ? null : 'Only a co-authored text can be renounced.';
	},
	async run(tx, p) {
		const textId = /** @type {string} */ (p.textId);
		const personaId = /** @type {string} */ (p.personaId);
		const extreme = !!p.payload?.extreme;
		// an ordinary renunciation made one with extreme prejudice
		if (await renunciationOf(tx, textId, personaId)) {
			await tx.update(renunciation).set({ extreme }).where(and(eq(renunciation.textId, textId), eq(renunciation.personaId, personaId)));
			return;
		}
		const authors = await authorsOf(tx, textId);
		await tx.insert(renunciation).values({ textId, personaId, extreme, position: authors.indexOf(personaId) });
		await setAuthors(tx, textId, authors.filter((a) => a !== personaId));
	}
};

/** An author undoes an ordinary renunciation, and takes their place again. @type {Action} */
const unrenounce = {
	async check(conn, p) {
		if (!p.textId || !p.personaId) return 'No such text';
		const had = await renunciationOf(conn, p.textId, p.personaId);
		if (!had) return 'There is no renunciation to undo.';
		return had.extreme ? "A renunciation with extreme prejudice can't be undone." : null;
	},
	async run(tx, p) {
		const textId = /** @type {string} */ (p.textId);
		const personaId = /** @type {string} */ (p.personaId);
		const had = /** @type {typeof renunciation.$inferSelect} */ (await renunciationOf(tx, textId, personaId));
		const authors = (await authorsOf(tx, textId)).filter((a) => a !== personaId);
		authors.splice(Math.min(had.position, authors.length), 0, personaId);
		await tx.delete(renunciation).where(and(eq(renunciation.textId, textId), eq(renunciation.personaId, personaId)));
		await tx.delete(textEditor).where(and(eq(textEditor.textId, textId), eq(textEditor.personaId, personaId)));
		await setAuthors(tx, textId, authors);
	}
};

/**
 * Mark comments in a commentary public or private: `{ public, paragraphIds? }` (no ids: the whole commentary). What has
 * entered public memory stays public.
 * @type {Action}
 */
const mark = {
	async check(conn, p) {
		const row = await textRow(conn, p.textId);
		if (!row || row.type !== 'commentary') return 'No such commentary';
		if (isPalimpsest(row)) return LOCKED_MESSAGE;
		const ids = p.payload?.paragraphIds;
		if (!ids) return null;
		const locked = await lockedParagraphs(conn, row.id);
		return !p.payload.public && ids.some((/** @type {string} */ id) => locked.has(id)) ? PUBLIC_MEMORY_MESSAGE : null;
	},
	async run(tx, p) {
		const id = /** @type {string} */ (p.textId);
		const locked = await lockedParagraphs(tx, id);
		const held = await tx.select({ id: textItem.paragraphId }).from(textItem).where(eq(textItem.textId, id));
		const wanted = p.payload.paragraphIds ? new Set(p.payload.paragraphIds) : null;
		const ids = /** @type {string[]} */ (held.map((h) => h.id).filter((x) => x && (!wanted || wanted.has(x)) && !locked.has(x)));
		for (let k = 0; k < ids.length; k += 5000) await tx.update(paragraph).set({ public: !!p.payload.public }).where(inArray(paragraph.id, ids.slice(k, k + 5000)));
		await tx.update(text_).set({ updatedAt: new Date() }).where(eq(text_.id, id));
		await syncCommentary(tx, id);
	}
};

/** Change a persona's name, description, picture or pseudonymity. @type {Action} */
const persona_update = {
	async check(conn, p) {
		const [row] = await conn.select({ id: persona.id }).from(persona).where(eq(persona.id, /** @type {string} */ (p.personaId)));
		return row ? null : 'Persona not found.';
	},
	async run(tx, p) {
		await tx.update(persona).set(p.payload).where(eq(persona.id, /** @type {string} */ (p.personaId)));
	}
};

/**
 * Delete a persona for the user who asked: it stops being theirs, and goes altogether when it is nobody's. A persona
 * that authors a published text, or has renounced a text, stays.
 * @type {Action}
 */
const persona_delete = {
	async check(conn, p) {
		const id = /** @type {string} */ (p.personaId);
		const [link] = await conn.select({ isSelf: userPersona.isSelf }).from(userPersona).where(and(eq(userPersona.userId, p.proposedBy), eq(userPersona.personaId, id)));
		if (!link) return 'Persona not found.';
		if (link.isSelf) return 'Your "self" persona can\'t be deleted.';
		const rows = await conn.select({ productionStatus: text_.productionStatus, visibility: text_.visibility }).from(textAuthor).innerJoin(text_, eq(textAuthor.textId, text_.id)).where(eq(textAuthor.personaId, id));
		if (rows.some(isPermanent)) return "This persona is the author of a published, public text, so it can't be deleted.";
		const [gone] = await conn.select({ id: renunciation.textId }).from(renunciation).where(eq(renunciation.personaId, id)).limit(1);
		return gone ? "This persona has renounced a text, which stays on record, so it can't be deleted." : null;
	},
	async run(tx, p) {
		const id = /** @type {string} */ (p.personaId);
		const uid = p.proposedBy;
		const self = await selfPersonaId(uid);
		const others = await tx.select({ userId: userPersona.userId }).from(userPersona).where(and(eq(userPersona.personaId, id), ne(userPersona.userId, uid)));
		const shared = others.length > 0;
		const mine = await tx.select({ id: userPersona.personaId }).from(userPersona).where(eq(userPersona.userId, uid));
		const kept = new Set(mine.map((m) => m.id).filter((x) => x !== id));
		// The persona stops being an author; where that would leave the user no author persona, "self" takes its place.
		// A shared persona lives on for its other users, so it only leaves the texts saved under this account.
		const affected = await tx
			.select({ id: text_.id })
			.from(textAuthor)
			.innerJoin(text_, eq(textAuthor.textId, text_.id))
			.where(and(eq(textAuthor.personaId, id), shared ? eq(text_.userId, uid) : undefined));
		for (const { id: textId } of affected) {
			const rest = (await authorsOf(tx, textId)).filter((x) => x !== id);
			await setAuthors(tx, textId, rest.some((x) => kept.has(x)) || !self ? rest : [...rest, self]);
		}
		await tx.delete(userPersona).where(and(eq(userPersona.userId, uid), eq(userPersona.personaId, id)));
		const [{ n }] = await tx.select({ n: count() }).from(userPersona).where(eq(userPersona.personaId, id));
		if (n === 0) await tx.delete(persona).where(eq(persona.id, id));
	}
};

/** @type {Record<string, Action>} */
export const ACTIONS = {
	properties,
	recant: turn('published', 'recanted', 'Only a published, public text can be recanted.'),
	derecant: turn('recanted', 'published', 'Only a recanted text can be derecanted.'),
	burn,
	wipe,
	renounce,
	unrenounce,
	mark,
	persona_update,
	persona_delete
};

/** the actions a persona's own users decide (the rest are decided by every user of every author of the text) */
export const PERSONA_SCALE = new Set(['renounce', 'unrenounce', 'persona_update', 'persona_delete']);
