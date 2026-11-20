import { fail, redirect } from '@sveltejs/kit';
import { count, eq } from 'drizzle-orm';
import { auth } from '#lib/server/auth.ts';
import { db } from '#lib/server/db/index.js';
import { text_, user } from '#lib/server/db/schema.js';
import { listTexts } from '#lib/server/texts.js';
import { APIError } from 'better-auth/api';

export const load = async ({ locals }) => {
	if (!locals.user) redirect(302, '/login');
	const [{ n }] = await db.select({ n: count() }).from(text_).where(eq(text_.userId, locals.user.id));
	const [row] = await db.select().from(user).where(eq(user.id, locals.user.id));
	const texts = (await listTexts(locals)).map((t) => ({ id: t.id, title: t.title, type: t.type, createdAt: t.createdAt.toISOString(), updatedAt: t.updatedAt.toISOString() }));
	return {
		textCount: n,
		texts,
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
	}
};
