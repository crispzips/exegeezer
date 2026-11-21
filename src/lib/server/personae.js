import { eq, and } from 'drizzle-orm';
import { db } from '#lib/server/db/index.js';
import { persona, userPersona } from '#lib/server/db/schema.js';

export const SELF = 'self';

/** "self" is reserved: no other persona may take the name (any case, any spacing at the ends). */
export const isReservedName = (name) => name.trim().toLowerCase() === SELF;

/** The id of a user's "self" persona (null if none yet). */
export async function selfPersonaId(userId) {
	const [row] = await db
		.select({ id: userPersona.personaId })
		.from(userPersona)
		.where(and(eq(userPersona.userId, userId), eq(userPersona.isSelf, true)));
	return row?.id ?? null;
}

/** Gives a user their default persona, "self", unless they already have one. */
export async function ensureSelfPersona(userId) {
	await db.transaction(async (tx) => {
		const [existing] = await tx
			.select({ id: persona.id })
			.from(userPersona)
			.innerJoin(persona, eq(userPersona.personaId, persona.id))
			.where(and(eq(userPersona.userId, userId), eq(userPersona.isSelf, true)));
		if (existing) return;
		const [created] = await tx.insert(persona).values({ name: SELF }).returning({ id: persona.id });
		await tx.insert(userPersona).values({ userId, personaId: created.id, isSelf: true });
	});
}
