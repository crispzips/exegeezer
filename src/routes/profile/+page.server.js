import { fail, redirect } from '@sveltejs/kit';
import { and, asc, count, desc, eq } from 'drizzle-orm';
import { auth } from '#lib/server/auth.ts';
import { db } from '#lib/server/db/index.js';
import { persona, text_, textAuthor, user, userPersona } from '#lib/server/db/schema.js';
import { authorIds, deleteText, isProductionStatus, isVisibility, loadText, setAuthors } from '#lib/server/texts.js';
import { LOCKED_MESSAGE, isPublicized } from '#lib/textStatus.js';
import { isReservedName, selfPersonaId } from '#lib/server/personae.js';
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
import { APIError } from 'better-auth/api';

export const load = async ({ locals }) => {
	if (!locals.user) redirect(302, '/login');
	const [{ n }] = await db.select({ n: count() }).from(text_).where(eq(text_.userId, locals.user.id));
	const [row] = await db.select().from(user).where(eq(user.id, locals.user.id));
	const texts = (
		await db
			.select({ id: text_.id, title: text_.title, type: text_.type, personaId: text_.personaId, productionStatus: text_.productionStatus, visibility: text_.visibility, createdAt: text_.createdAt, updatedAt: text_.updatedAt })
			.from(text_)
			.where(eq(text_.userId, locals.user.id))
			.orderBy(desc(text_.updatedAt))
	).map((t) => ({ ...t, createdAt: t.createdAt.toISOString(), updatedAt: t.updatedAt.toISOString() }));
	const personae = (
		await db
			.select({ id: persona.id, name: persona.name, description: persona.description, image: persona.image, createdAt: persona.createdAt, isSelf: userPersona.isSelf })
			.from(userPersona)
			.innerJoin(persona, eq(userPersona.personaId, persona.id))
			.where(eq(userPersona.userId, locals.user.id))
			.orderBy(desc(userPersona.isSelf), asc(persona.createdAt))
	).map((r) => ({ ...r, createdAt: r.createdAt.toISOString() }));
	// personae listed as the author of a published, public text can't be deleted
	const used = await db.select({ id: text_.id, title: text_.title, type: text_.type, personaId: text_.personaId, productionStatus: text_.productionStatus, visibility: text_.visibility }).from(text_).where(eq(text_.userId, locals.user.id));
	// every author of every one of the user's texts, in order (a text can have several)
	const authorRows = await db
		.select({ textId: textAuthor.textId, personaId: textAuthor.personaId })
		.from(textAuthor)
		.innerJoin(text_, eq(textAuthor.textId, text_.id))
		.where(eq(text_.userId, locals.user.id))
		.orderBy(asc(textAuthor.position));
	/** @type {Map<string, string[]>} */
	const authorsOf = new Map();
	for (const r of authorRows) authorsOf.set(r.textId, [...(authorsOf.get(r.textId) ?? []), r.personaId]);
	const publicizedIds = new Set(used.filter(isPublicized).map((t) => t.id));
	const locked = new Set(authorRows.filter((r) => publicizedIds.has(r.textId)).map((r) => r.personaId));
	// a persona's name as an author: a user's "self" is shown as the user's profile name
	const authorName = (/** @type {{ isSelf: boolean, name: string }} */ pa) => (pa.isSelf ? row.name || pa.name : pa.name);
	const authors = new Map(personae.map((pa) => [pa.id, authorName(pa)]));
	// "about me": Markdown, or one of the user's own published, public texts (shown in its place)
	const aboutChoices = used.filter(isPublicized).map((t) => ({ id: t.id, title: t.title }));
	const aboutText = row.aboutTextId && aboutChoices.some((t) => t.id === row.aboutTextId) ? await loadText(row.aboutTextId, locals) : null;
	return {
		about: {
			markdown: row.about ?? '',
			textId: aboutText ? row.aboutTextId : null,
			text: aboutText ? { id: aboutText.id, title: aboutText.title, items: aboutText.items.map((i) => ({ id: i.id, text: i.text })) } : null,
			choices: aboutChoices
		},
		textCount: n,
		texts: texts.map((t) => ({ ...t, author: (authorsOf.get(t.id) ?? []).map((p) => authors.get(p)).filter(Boolean).join(', ') || null, publicized: isPublicized(t) })),
		authorChoices: personae.map((pa) => ({ id: pa.id, name: authorName(pa) })),
		personae: personae.map((p) => ({
			...p,
			label: authorName(p),
			locked: locked.has(p.id),
			// the user's texts written as this persona
			texts: used.filter((t) => authorsOf.get(t.id)?.includes(p.id)).map((t) => ({ id: t.id, title: t.title, type: t.type, productionStatus: t.productionStatus, visibility: t.visibility }))
		})),
		profile: {
			id: row.id,
			name: row.name,
			email: row.email,
			emailVerified: row.emailVerified,
			createdAt: row.createdAt.toISOString(),
			updatedAt: row.updatedAt.toISOString()
		}
	};
};

export const actions = {
	updateProfile: async ({ request, locals }) => {
		if (!locals.user) redirect(302, '/login');
		const formData = await request.formData();
		const name = formData.get('name')?.toString().trim() ?? '';
		if (!name) return fail(400, { message: 'Enter a name.', name });
		try {
			await auth.api.updateUser({ body: { name }, headers: request.headers });
		} catch (error) {
			return fail(400, { message: error instanceof APIError ? error.message : 'Could not save.', name });
		}
		return { saved: true, name };
	},

	updateAbout: async ({ request, locals }) => {
		if (!locals.user) redirect(302, '/login');
		const formData = await request.formData();
		const mode = formData.get('mode')?.toString() ?? '';
		const markdown = (formData.get('about')?.toString() ?? '').replace(/\r\n/g, '\n').slice(0, 50000);
		const textId = formData.get('textId')?.toString() ?? '';
		if (mode === 'text') {
			if (!UUID.test(textId)) return fail(400, { aboutMessage: 'Choose one of your published, public texts.', aboutMarkdown: markdown });
			const [t] = await db
				.select({ productionStatus: text_.productionStatus, visibility: text_.visibility })
				.from(text_)
				.where(and(eq(text_.id, textId), eq(text_.userId, locals.user.id)));
			if (!t || !isPublicized(t)) return fail(400, { aboutMessage: 'Only one of your own published, public texts can be your about.', aboutMarkdown: markdown });
			// the Markdown stays saved, so switching back to writing finds it again
			await db.update(user).set({ aboutTextId: textId, about: markdown.trim() || null }).where(eq(user.id, locals.user.id));
		} else if (mode === 'markdown') {
			await db.update(user).set({ aboutTextId: null, about: markdown.trim() || null }).where(eq(user.id, locals.user.id));
		} else return fail(400, { aboutMessage: 'Could not save.', aboutMarkdown: markdown });
		return { aboutSaved: true };
	},

	createPersona: async ({ request, locals }) => {
		if (!locals.user) redirect(302, '/login');
		const formData = await request.formData();
		const name = formData.get('name')?.toString().trim() ?? '';
		const description = formData.get('description')?.toString().trim() ?? '';
		if (!name) return fail(400, { personaMessage: 'Enter a name for the persona.', personaName: name, personaDescription: description });
		if (isReservedName(name)) return fail(400, { personaMessage: '"self" is reserved for your default persona.', personaName: name, personaDescription: description });
		await db.transaction(async (tx) => {
			const [created] = await tx.insert(persona).values({ name, description: description || null }).returning({ id: persona.id });
			await tx.insert(userPersona).values({ userId: locals.user.id, personaId: created.id });
		});
		return { personaCreated: true };
	},

	deletePersona: async ({ request, locals }) => {
		if (!locals.user) redirect(302, '/login');
		const id = (await request.formData()).get('id')?.toString() ?? '';
		if (!UUID.test(id)) return fail(404, { personaMessage: 'Persona not found.' });
		const [link] = await db
			.select({ isSelf: userPersona.isSelf })
			.from(userPersona)
			.where(and(eq(userPersona.userId, locals.user.id), eq(userPersona.personaId, id)));
		if (!link) return fail(404, { personaMessage: 'Persona not found.' });
		if (link.isSelf) return fail(400, { personaMessage: 'Your "self" persona can\'t be deleted.' });
		const rows = await db
			.select({ productionStatus: text_.productionStatus, visibility: text_.visibility })
			.from(textAuthor)
			.innerJoin(text_, eq(textAuthor.textId, text_.id))
			.where(eq(textAuthor.personaId, id));
		if (rows.some(isPublicized)) return fail(400, { personaMessage: 'This persona is the author of a published, public text, so it can\'t be deleted.' });
		const self = await selfPersonaId(locals.user.id);
		await db.transaction(async (tx) => {
			// the persona stops being an author; a text left with no author falls back to "self"
			const affected = await tx
				.select({ id: text_.id })
				.from(textAuthor)
				.innerJoin(text_, eq(textAuthor.textId, text_.id))
				.where(and(eq(text_.userId, locals.user.id), eq(textAuthor.personaId, id)));
			for (const { id: textId } of affected) {
				const rest = (await authorIds(textId)).filter((x) => x !== id);
				await setAuthors(tx, textId, rest.length ? rest : self ? [self] : []);
			}
			await tx.delete(userPersona).where(and(eq(userPersona.userId, locals.user.id), eq(userPersona.personaId, id)));
			// a persona nobody has any more goes away; one still shared stays
			const [{ n }] = await tx.select({ n: count() }).from(userPersona).where(eq(userPersona.personaId, id));
			if (n === 0) await tx.delete(persona).where(eq(persona.id, id));
		});
		return { personaDeleted: true };
	},

	updatePersona: async ({ request, locals }) => {
		if (!locals.user) redirect(302, '/login');
		const formData = await request.formData();
		const id = formData.get('id')?.toString() ?? '';
		const name = formData.get('name')?.toString().trim() ?? '';
		const description = formData.get('description')?.toString().trim() ?? '';
		const image = formData.get('image')?.toString().trim() ?? '';
		const keep = { personaMessage: undefined, editId: id, personaName: name, personaDescription: description, personaImage: image };
		if (!UUID.test(id)) return fail(404, { personaMessage: 'Persona not found.' });
		const [link] = await db
			.select({ isSelf: userPersona.isSelf })
			.from(userPersona)
			.where(and(eq(userPersona.userId, locals.user.id), eq(userPersona.personaId, id)));
		if (!link) return fail(404, { ...keep, personaMessage: 'Persona not found.' });
		if (!link.isSelf) {
			if (!name) return fail(400, { ...keep, personaMessage: 'Enter a name for the persona.' });
			if (isReservedName(name)) return fail(400, { ...keep, personaMessage: '"self" is reserved for your default persona.' });
		}
		if (image && !/^https?:\/\/\S+$/i.test(image)) return fail(400, { ...keep, personaMessage: 'The image must be a web address starting with http:// or https://.' });
		await db
			.update(persona)
			.set({ ...(link.isSelf ? {} : { name }), description: description || null, image: image || null })
			.where(eq(persona.id, id));
		return { personaUpdated: true };
	},

	updateText: async ({ request, locals }) => {
		if (!locals.user) redirect(302, '/login');
		const formData = await request.formData();
		const id = formData.get('id')?.toString() ?? '';
		const title = formData.get('title')?.toString().trim().slice(0, 200) ?? '';
		const productionStatus = formData.get('productionStatus')?.toString() ?? '';
		const visibility = formData.get('visibility')?.toString() ?? '';
		const personaId = formData.get('personaId')?.toString() ?? '';
		const keep = { textEditId: id, textTitle: title, textProductionStatus: productionStatus, textVisibility: visibility, textPersonaId: personaId };
		if (!UUID.test(id)) return fail(404, { ...keep, textMessage: 'Text not found.' });
		if (!title) return fail(400, { ...keep, textMessage: 'Enter a title.' });
		if (!isProductionStatus(productionStatus) || !isVisibility(visibility)) return fail(400, { ...keep, textMessage: 'Choose a production status and visibility.' });
		const [current] = await db.select().from(text_).where(and(eq(text_.id, id), eq(text_.userId, locals.user.id)));
		if (!current) return fail(404, { ...keep, textMessage: 'Text not found.' });
		if (!UUID.test(personaId)) return fail(400, { ...keep, textMessage: 'Choose one of your personae as the author.' });
		const [link] = await db
			.select({ personaId: userPersona.personaId })
			.from(userPersona)
			.where(and(eq(userPersona.userId, locals.user.id), eq(userPersona.personaId, personaId)));
		if (!link) return fail(400, { ...keep, textMessage: 'Choose one of your personae as the author.' });
		if (isPublicized(current)) return fail(409, { ...keep, textMessage: LOCKED_MESSAGE });
		// this table edits the first author; any further authors stay (they are set in the viewer's text settings)
		const current_ = await authorIds(id);
		await db.transaction(async (tx) => {
			await tx.update(text_).set({ title, productionStatus, visibility }).where(eq(text_.id, id));
			await setAuthors(tx, id, [personaId, ...current_.slice(1).filter((x) => x !== personaId)]);
		});
		return { textUpdated: true };
	},

	deleteText: async ({ request, locals }) => {
		if (!locals.user) redirect(302, '/login');
		const id = (await request.formData()).get('id')?.toString() ?? '';
		const deleted = await deleteText(id, locals);
		if (deleted === 'locked') return fail(409, { textMessage: LOCKED_MESSAGE });
		if (deleted === 'commented') return fail(409, { textMessage: "This text has commentaries, so it can't be deleted." });
		if (!deleted) return fail(404, { textMessage: 'Text not found.' });
		return { textDeleted: true };
	}
};
