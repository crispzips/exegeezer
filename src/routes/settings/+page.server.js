import { fail, redirect } from '@sveltejs/kit';
import { and, eq } from 'drizzle-orm';
import { auth } from '#lib/server/auth.ts';
import { db } from '#lib/server/db/index.js';
import { account } from '#lib/server/db/schema.js';
import { APIError } from 'better-auth/api';

export const load = async ({ locals }) => {
	if (!locals.user) redirect(302, '/login');
	// only email+password accounts have a password to change (Google-only accounts do not)
	const rows = await db.select({ id: account.id }).from(account)
		.where(and(eq(account.userId, locals.user.id), eq(account.providerId, 'credential')));
	return { hasPassword: rows.length > 0 };
};

export const actions = {
	changePassword: async ({ request, locals }) => {
		if (!locals.user) redirect(302, '/login');
		const data = await request.formData();
		const currentPassword = data.get('current')?.toString() ?? '';
		const newPassword = data.get('next')?.toString() ?? '';
		if (!currentPassword || !newPassword) return fail(400, { message: 'Enter your current and new password.' });
		if (newPassword.length < 8) return fail(400, { message: 'Use a new password of at least 8 characters.' });
		try {
			await auth.api.changePassword({ body: { currentPassword, newPassword, revokeOtherSessions: true }, headers: request.headers });
		} catch (error) {
			return fail(400, { message: error instanceof APIError ? error.message : 'Could not change the password.' });
		}
		return { saved: true };
	}
};
