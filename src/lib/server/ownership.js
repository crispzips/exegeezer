import { and, eq, exists, or, sql } from 'drizzle-orm';
import { db } from '#lib/server/db/index.js';
import { text_, textAuthor, userPersona } from '#lib/server/db/schema.js';

/**
 * Who owns a text. A text can have several owners: every user who has one of the personae listed as its authors.
 * Each owner may do anything with it. `text.user_id` is the account the text is saved under (it goes when that
 * account does); it is always an owner, and `setAuthors` keeps it one of the authors' users. It alone owns a text
 * that has no authors.
 *
 * A condition for a query over `table` (the texts table, or an alias of it): `uid` owns the text.
 * @param {string} uid
 * @param {any} [table]
 */
export const ownedBy = (uid, table = text_) =>
	or(
		eq(table.userId, uid),
		exists(
			db
				.select({ one: sql`1` })
				.from(textAuthor)
				.innerJoin(userPersona, eq(userPersona.personaId, textAuthor.personaId))
				.where(and(eq(textAuthor.textId, table.id), eq(userPersona.userId, uid)))
		)
	);

/** the same rule as a subquery for hand-written SQL: one (text_id, user_id) row for each owner of each text */
export const OWNERS = sql`(
	select id as text_id, user_id from text where user_id is not null
	union
	select a.text_id, up.user_id from text_author a join user_persona up on up.persona_id = a.persona_id
)`;

/**
 * Before an account is deleted (which deletes the texts saved under it): save the ones it shares under another of
 * their owners, so they stay.
 * @param {string} uid
 */
export async function handOverSharedTexts(uid) {
	await db.execute(sql`
		update text set user_id = heir.user_id
		from (
			select distinct on (a.text_id) a.text_id, up.user_id
			from text_author a join user_persona up on up.persona_id = a.persona_id
			where up.user_id <> ${uid}
			order by a.text_id, a.position, up.created_at
		) heir
		where heir.text_id = text.id and text.user_id = ${uid}`);
}
