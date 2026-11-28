import { and, eq, or, sql } from 'drizzle-orm';
import { db } from '#lib/server/db/index.js';
import {
	personaTag,
	tag,
	tagMatchForm,
	tagSet,
	tagSetMember,
	text_,
	textTag,
	userPersona
} from '#lib/server/db/schema.js';
import { ownedBy } from '#lib/server/ownership.js';
import { commentaryBy, ensureCommentary } from '#lib/server/texts.js';
import { cleanTagName, matchForm } from '#lib/tagNames.js';

/**
 * Tags (see db/schema.js). The rules kept here:
 * - there is one tag of each name: naming one that exists, however it is capitalized and whichever apostrophe is
 *   typed, uses it
 * - global sets come from imports alone; a user's personal set is whatever tags they have applied
 * - anyone may tag any text they can see. On a text of someone else's, their tags are a commentary on it: they are
 *   kept on that user's commentary, which the first tag makes if need be
 * - so the tags on a commentary describe the text it is on, never the commentary itself (which is tagged, like any
 *   text, from a commentary on it)
 * - personae are tagged by their owners alone; any owner of a piece of work may take a tag off it
 * - a user is offered only tags from global sets, so never list the `tag` table to them otherwise
 */

/** what each user's personal set is called */
const PERSONAL_SET = 'My tags';

/** the kinds of work that can be tagged: where their tags are, and whether a user owns one */
const WORKS = {
	text: {
		table: textTag,
		column: textTag.textId,
		key: 'textId',
		owns: async (uid, id) => {
			const [row] = await db
				.select({ id: text_.id })
				.from(text_)
				.where(and(eq(text_.id, id), ownedBy(uid)));
			return !!row;
		}
	},
	persona: {
		table: personaTag,
		column: personaTag.personaId,
		key: 'personaId',
		owns: async (uid, id) => {
			const [row] = await db
				.select({ id: userPersona.personaId })
				.from(userPersona)
				.where(and(eq(userPersona.personaId, id), eq(userPersona.userId, uid)));
			return !!row;
		}
	}
};

/**
 * Where a user's tags for a piece of work are kept: on the work itself if they own it. Anyone else's tags for a text
 * are kept on their commentary on it. (A private text of someone else's can't be seen, so it can't be tagged: the
 * commentary would even carry its title.)
 * @param {string} userId
 * @param {keyof typeof WORKS} kind
 * @param {string} workId
 * @returns {Promise<{ holder: string | null, referent?: { id: string, title: string } } | null>} null if they may not
 *   tag it. `holder` is what the tags are on (null = the commentary on `referent` that isn't made yet).
 */
export async function placeFor(userId, kind, workId) {
	if (await WORKS[kind].owns(userId, workId)) return { holder: workId };
	if (kind !== 'text') return null;
	const [referent] = await db
		.select({ id: text_.id, title: text_.title })
		.from(text_)
		.where(and(eq(text_.id, workId), eq(text_.visibility, 'public')));
	if (!referent) return null;
	return { holder: (await commentaryBy(db, userId, workId))?.id ?? null, referent };
}

/**
 * The id of the tag of this name, made only if nobody has named it yet: an existing one is used as it is, spelling
 * included.
 * @returns {Promise<string | null>} null for a blank name
 */
async function tagNamed(name) {
	const clean = cleanTagName(name);
	if (!clean) return null;
	await db.insert(tag).values({ name: clean }).onConflictDoNothing();
	const [row] = await db
		.select({ id: tag.id })
		.from(tag)
		.where(eq(tag.matchName, tagMatchForm(sql`${clean}::text`)));
	return row.id;
}

/** whether a tag is in a global set, or already in the user's personal one */
async function usable(userId, tagId) {
	const [row] = await db
		.select({ id: tagSetMember.tagId })
		.from(tagSetMember)
		.innerJoin(tagSet, eq(tagSet.id, tagSetMember.tagSetId))
		.where(
			and(eq(tagSetMember.tagId, tagId), or(eq(tagSet.kind, 'global'), eq(tagSet.ownerId, userId)))
		)
		.limit(1);
	return !!row;
}

/**
 * Applies a tag for a piece of work: one picked (`tagId`) or one typed (`name`). That puts it in the user's personal
 * set, which is made with their first tag. For someone else's text it also makes the user's commentary on it, if they
 * have none yet.
 * @param {string} userId
 * @param {keyof typeof WORKS} kind
 * @param {string} workId
 * @param {{ tagId?: string | null, name?: string }} choice
 * @returns {Promise<boolean>} false if they may not tag it, the name is blank or the tag isn't one they can pick
 */
export async function addTag(userId, kind, workId, { tagId = null, name = '' }) {
	// (all checked before any tag, set or commentary is made)
	const place = await placeFor(userId, kind, workId);
	if (!place) return false;
	if (tagId && !(await usable(userId, tagId))) return false;
	tagId ??= await tagNamed(name);
	if (!tagId) return false;
	const holder =
		place.holder ?? (await ensureCommentary(userId, /** @type {any} */ (place.referent)));
	await db
		.insert(tagSet)
		.values({ kind: 'personal', ownerId: userId, name: PERSONAL_SET })
		.onConflictDoNothing();
	const work = WORKS[kind];
	await db
		.insert(work.table)
		.values(/** @type {any} */ ({ [work.key]: holder, tagId, userId }))
		.onConflictDoNothing();
	return true;
}

/**
 * Takes a tag off: off the work for one of its owners, whichever of them put it there; for anyone else, off their
 * commentary on the text (which stays, even with nothing left in it).
 * @param {string} userId
 * @param {keyof typeof WORKS} kind
 * @param {string} workId
 * @param {string} tagId
 * @returns {Promise<boolean>} false if they may not tag the work
 */
export async function removeTag(userId, kind, workId, tagId) {
	const place = await placeFor(userId, kind, workId);
	if (!place) return false;
	const work = WORKS[kind];
	if (place.holder) {
		await db
			.delete(work.table)
			.where(and(eq(work.column, place.holder), eq(work.table.tagId, tagId)));
	}
	return true;
}

/**
 * The tags kept on a piece of work (for a commentary, those are about the text it is on), each once, and whether it is
 * in a global set. Who may see them is for the caller to decide.
 * @param {keyof typeof WORKS} kind
 * @param {string} workId
 * @returns {Promise<{ id: string, name: string, global: boolean }[]>}
 */
export function tagsOn(kind, workId) {
	const work = WORKS[kind];
	return db
		.select({
			id: tag.id,
			name: tag.name,
			global: sql`exists (select 1 from tag_set_tag m where m.tag_id = ${tag}.id)`.mapWith(Boolean)
		})
		.from(work.table)
		.innerJoin(tag, eq(tag.id, work.table.tagId))
		.where(eq(work.column, workId))
		.groupBy(tag.id)
		.orderBy(sql`lower(${tag.name})`);
}

/** The credit and licence of each global set, to show wherever its tags are offered. */
export function globalCredits() {
	return db
		.select({ name: tagSet.name, attribution: tagSet.attribution, licenseUrl: tagSet.licenseUrl })
		.from(tagSet)
		.where(eq(tagSet.kind, 'global'))
		.orderBy(tagSet.name);
}

/** the part of a set's notes that lists other names for what a tag covers (Thema's wording) */
const ALSO_COVERS = 'Also class here:(.*?)(?=Use |Prefer|See also|DO NOT|Equivalent|$)';
/** how alike (0 to 1) a heading and what is typed must be to be offered despite their differences */
const ALIKE = 0.45;

/**
 * Tags in the global sets that might serve in place of what a user is typing, best first: the same name; names that
 * begin with it; names with a word beginning with each word typed; names spelled nearly like it; and tags whose set
 * lists the words among the other things they cover. Only global sets are searched, so nobody's own words show.
 * Needs the database's `pg_trgm` extension (the import script adds it).
 * @param {string} query
 * @returns {Promise<{ id: string, name: string, set: string, broader: string | null, covers: string | null }[]>}
 */
export async function searchGlobalTags(query, limit = 8) {
	const typed = matchForm(cleanTagName(query)).slice(0, 100);
	const words = typed.match(/[\p{L}\p{N}]+(?:'[\p{L}\p{N}]+)*/gu) ?? [];
	if (typed.length < 2 || !words.length) return [];

	/** @param {string[]} patterns */
	const all = (patterns) =>
		sql`all (array[${sql.join(
			patterns.map((p) => sql`${p}`),
			sql`, `
		)}]::text[])`;
	const inName = all(words.map((w) => `\\m${w}`));
	// (short words must be whole there, or they would match half of any note)
	const inNotes = all(words.map((w) => (w.length < 3 ? `\\m${w}\\M` : `\\m${w}`)));
	const alike = sql`greatest(similarity(t.match_name, ${typed}), 0.9 * word_similarity(${typed}, t.match_name))`;

	const rows = await db.execute(sql`
		select * from (
			select distinct on (t.id) t.id, t.name, s.name as set, broader.name as broader, c.also, c.score
			from tag t
			join tag_set_tag m on m.tag_id = t.id
			join tag_set s on s.id = m.tag_set_id and s.kind = 'global'
			left join tag broader on broader.id = m.parent_tag_id
			-- (picking the list out of a note is slow, so only notes that hold the words at all are opened)
			cross join lateral (select case when ${typed.length >= 3} and ${tagMatchForm(sql`m.notes`)} ~ ${inNotes}
				then substring(m.notes from ${ALSO_COVERS}) end as also) a
			cross join lateral (select a.also, case
				when t.match_name = ${typed} then 100
				when starts_with(t.match_name, ${typed}) then 90
				when t.match_name ~ ${inName} then 80
				when ${alike} >= ${ALIKE} then 40 + 30 * ${alike}
				when ${tagMatchForm(sql`a.also`)} ~ ${inNotes} then 35
				else 0 end as score) c
			order by t.id, c.score desc
		) found
		where score > 0
		order by score desc, length(name), name
		limit ${limit}`);

	return [...rows].map((r) => {
		const row = /** @type {any} */ (r);
		// when it was found by something it covers, say which
		const covers =
			Number(row.score) === 35
				? (row.also
						.split(/[,.;]/)
						.map((/** @type {string} */ p) => p.trim())
						.find((/** @type {string} */ p) => matchForm(p).includes(words[0])) ?? null)
				: null;
		return { id: row.id, name: row.name, set: row.set, broader: row.broader, covers };
	});
}
