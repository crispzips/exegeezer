import { fail, redirect } from '@sveltejs/kit';
import { and, asc, count, desc, eq, or } from 'drizzle-orm';
import { auth } from '#lib/server/auth.ts';
import { db } from '#lib/server/db/index.js';
import { account, persona, text_, user, userPersona } from '#lib/server/db/schema.js';
import { authorIds, commentaryOverview, loadText, namedAuthors } from '#lib/server/texts.js';
import { changeProperties } from '#lib/server/properties.js';
import { propose, proposalsFor } from '#lib/server/consent.js';
import { editedBy, standing } from '#lib/server/access.js';
import { circulatedTo, groupsOf, renunciationsOf } from '#lib/server/circulation.js';
import { ownedBy } from '#lib/server/ownership.js';
import { LOCKED_MESSAGE, isPermanent, isPublication } from '#lib/textStatus.js';
import { isReservedName } from '#lib/server/personae.js';
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
import { APIError } from 'better-auth/api';

export const load = async ({ locals }) => {
	if (!locals.user) redirect(302, '/login');
	const [{ n }] = await db.select({ n: count() }).from(text_).where(ownedBy(locals.user.id));
	const [row] = await db.select().from(user).where(eq(user.id, locals.user.id));
	const texts = (
		await db
			.select({ id: text_.id, title: text_.title, type: text_.type, personaId: text_.personaId, productionStatus: text_.productionStatus, visibility: text_.visibility, createdAt: text_.createdAt, updatedAt: text_.updatedAt })
			.from(text_)
			.where(or(ownedBy(locals.user.id), editedBy(locals.user.id)))
			.orderBy(desc(text_.updatedAt))
	).map((t) => ({ ...t, createdAt: t.createdAt.toISOString(), updatedAt: t.updatedAt.toISOString() }));
	const personae = (
		await db
			.select({ id: persona.id, name: persona.name, description: persona.description, image: persona.image, pseudonymous: persona.pseudonymous, createdAt: persona.createdAt, isSelf: userPersona.isSelf })
			.from(userPersona)
			.innerJoin(persona, eq(userPersona.personaId, persona.id))
			.where(eq(userPersona.userId, locals.user.id))
			.orderBy(desc(userPersona.isSelf), asc(persona.createdAt))
	).map((r) => ({ ...r, pseudonymous: r.pseudonymous && !r.isSelf, createdAt: r.createdAt.toISOString() }));
	// the texts the user only edits are listed too, marked so
	const owned = new Set((await db.select({ id: text_.id }).from(text_).where(ownedBy(locals.user.id))).map((t) => t.id));
	// personae listed as the author of a published, public text can't be deleted
	const used = await db.select({ id: text_.id, title: text_.title, type: text_.type, personaId: text_.personaId, productionStatus: text_.productionStatus, visibility: text_.visibility }).from(text_).where(ownedBy(locals.user.id));
	// every author of every one of the user's texts, in order (a text can have several, some of them other users')
	const named = await namedAuthors(texts.map((t) => t.id));
	/** @type {Map<string, string[]>} */
	const authorsOf = new Map([...named].map(([id, list]) => [id, list.map((a) => a.id)]));
	const overview = await commentaryOverview(locals.user.id);
	const publicizedIds = new Set(used.filter(isPermanent).map((t) => t.id));
	const locked = new Set([...publicizedIds].flatMap((id) => authorsOf.get(id) ?? []));
	// a persona's name as an author: a user's "self" is shown as the user's profile name
	const authorName = (/** @type {{ isSelf: boolean, name: string }} */ pa) => (pa.isSelf ? row.name || pa.name : pa.name);
	const mine = new Set(personae.map((pa) => pa.id));
	// "about me": Markdown, or one of the user's own published, public texts (shown in its place)
	const aboutChoices = used.filter(isPublication).map((t) => ({ id: t.id, title: t.title }));
	const aboutText = row.aboutTextId && aboutChoices.some((t) => t.id === row.aboutTextId) ? await loadText(row.aboutTextId, locals) : null;
	// only email+password accounts have a password to change (Google-only accounts do not)
	const credentials = await db.select({ id: account.id }).from(account).where(and(eq(account.userId, locals.user.id), eq(account.providerId, 'credential')));
	return {
		hasPassword: credentials.length > 0,
		requests: await proposalsFor(locals.user.id),
		circulated: await circulatedTo(locals.user.id),
		groups: await groupsOf(locals.user.id),
		renunciations: await renunciationsOf(locals.user.id),
		about: {
			markdown: row.about ?? '',
			textId: aboutText ? row.aboutTextId : null,
			text: aboutText ? { id: aboutText.id, title: aboutText.title, items: aboutText.items.map((i) => ({ id: i.id, text: i.text })) } : null,
			choices: aboutChoices
		},
		textCount: n,
		texts: texts.map((t) => ({ ...t, author: named.get(t.id)?.map((a) => a.name).join(', ') || null, coAuthors: named.get(t.id)?.filter((a) => !mine.has(a.id)) ?? [], publicized: isPermanent(t), editorOnly: !owned.has(t.id), commented: overview.commented.has(t.id), ...overview.commentaries.get(t.id) })),
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

	changePassword: async ({ request, locals }) => {
		if (!locals.user) redirect(302, '/login');
		const formData = await request.formData();
		const currentPassword = formData.get('current')?.toString() ?? '';
		const newPassword = formData.get('next')?.toString() ?? '';
		if (!currentPassword || !newPassword) return fail(400, { passwordMessage: 'Enter your current and new password.' });
		if (newPassword.length < 8) return fail(400, { passwordMessage: 'Use a new password of at least 8 characters.' });
		try {
			await auth.api.changePassword({ body: { currentPassword, newPassword, revokeOtherSessions: true }, headers: request.headers });
		} catch (error) {
			return fail(400, { passwordMessage: error instanceof APIError ? error.message : 'Could not change the password.' });
		}
		return { passwordSaved: true };
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
				.where(and(eq(text_.id, textId), ownedBy(locals.user.id)));
			if (!t || !isPublication(t)) return fail(400, { aboutMessage: 'Only one of your own published, public texts can be your about.', aboutMarkdown: markdown });
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
		const pseudonymous = formData.get('pseudonymous') === '1';
		if (!name) return fail(400, { personaMessage: 'Enter a name for the persona.', personaName: name, personaDescription: description });
		if (isReservedName(name)) return fail(400, { personaMessage: '"self" is reserved for your default persona.', personaName: name, personaDescription: description });
		await db.transaction(async (tx) => {
			const [created] = await tx.insert(persona).values({ name, description: description || null, pseudonymous }).returning({ id: persona.id });
			await tx.insert(userPersona).values({ userId: locals.user.id, personaId: created.id });
		});
		return { personaCreated: true };
	},

	deletePersona: async ({ request, locals }) => {
		if (!locals.user) redirect(302, '/login');
		const id = (await request.formData()).get('id')?.toString() ?? '';
		const asked = await propose(locals.user.id, { action: 'persona_delete', personaId: id });
		if ('status' in asked) return fail(asked.status, { personaMessage: asked.message });
		return asked.done ? { personaDeleted: true } : { notice: asked.message };
	},

	updatePersona: async ({ request, locals }) => {
		if (!locals.user) redirect(302, '/login');
		const formData = await request.formData();
		const id = formData.get('id')?.toString() ?? '';
		const name = formData.get('name')?.toString().trim() ?? '';
		const description = formData.get('description')?.toString().trim() ?? '';
		const image = formData.get('image')?.toString().trim() ?? '';
		// '1' or '0'; left as it is when not sent
		const pseudonymous = formData.get('pseudonymous')?.toString();
		const keep = { personaMessage: undefined, editId: id, personaName: name, personaDescription: description, personaImage: image };
		if (!UUID.test(id)) return fail(404, { personaMessage: 'Persona not found.' });
		const [link] = await db
			.select({ isSelf: userPersona.isSelf, name: persona.name, description: persona.description, image: persona.image, pseudonymous: persona.pseudonymous })
			.from(userPersona)
			.innerJoin(persona, eq(persona.id, userPersona.personaId))
			.where(and(eq(userPersona.userId, locals.user.id), eq(userPersona.personaId, id)));
		if (!link) return fail(404, { ...keep, personaMessage: 'Persona not found.' });
		if (!link.isSelf) {
			if (!name) return fail(400, { ...keep, personaMessage: 'Enter a name for the persona.' });
			if (isReservedName(name)) return fail(400, { ...keep, personaMessage: '"self" is reserved for your default persona.' });
		}
		if (image && !/^https?:\/\/\S+$/i.test(image)) return fail(400, { ...keep, personaMessage: 'The image must be a web address starting with http:// or https://.' });
		// a "self" keeps its name and is never pseudonymous
		const next = { ...(link.isSelf ? {} : { name, ...(pseudonymous === '1' || pseudonymous === '0' ? { pseudonymous: pseudonymous === '1' } : {}) }), description: description || null, image: image || null };
		const changed = Object.fromEntries(Object.entries(next).filter(([k, v]) => v !== link[/** @type {keyof typeof next} */ (k)]));
		if (!Object.keys(changed).length) return { personaUpdated: true };
		const asked = await propose(locals.user.id, { action: 'persona_update', personaId: id, payload: changed });
		if ('status' in asked) return fail(asked.status, { ...keep, personaMessage: asked.message });
		return asked.done ? { personaUpdated: true } : { notice: asked.message };
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
		// this table edits the first author; any further authors stay (they are set in the viewer's text settings)
		const had = await authorIds(id);
		const next = !personaId || personaId === had[0] ? had : [personaId, ...had.slice(1).filter((x) => x !== personaId)];
		// (a status or visibility left as it was is not a change, so a commentary or publication can still be saved)
		const asked = await changeProperties(id, locals, { title, ...(productionStatus ? { productionStatus } : {}), ...(visibility ? { visibility } : {}), ...(next.length ? { personaIds: next } : {}) });
		if ('status' in asked) return fail(asked.status, { ...keep, textMessage: asked.message });
		return asked.done ? { textUpdated: true } : { notice: asked.message };
	},

	deleteText: async ({ request, locals }) => {
		if (!locals.user) redirect(302, '/login');
		const id = (await request.formData()).get('id')?.toString() ?? '';
		const s_ = await standing(locals.user.id, id);
		if (!s_?.read) return fail(404, { textMessage: 'Text not found.' });
		if (isPermanent(s_.row)) return fail(409, { textMessage: LOCKED_MESSAGE });
		const asked = await propose(locals.user.id, { action: 'burn', textId: id });
		if ('status' in asked) return fail(asked.status, { textMessage: asked.message });
		return asked.done ? { textDeleted: true } : { notice: asked.message };
	}
};
