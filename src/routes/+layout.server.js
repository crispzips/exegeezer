import { asc, eq } from 'drizzle-orm';
import { db } from '#lib/server/db/index.js';
import { user } from '#lib/server/db/schema.js';

/** The signed-in user (or null) for every page: the app is for signed-in users; everyone else sees the example text. */
export const load = async ({ locals }) => {
	if (!locals.user) return { user: null, switcher: null };
	// Admins (and an admin while switched into another account) get the account switcher: every account, to switch into.
	const adminId = locals.session?.impersonatedBy ?? locals.user.id;
	const [admin] = await db.select({ role: user.role }).from(user).where(eq(user.id, adminId));
	const accounts =
		admin?.role === 'admin'
			? await db.select({ id: user.id, name: user.name, email: user.email }).from(user).orderBy(asc(user.createdAt))
			: null;
	return {
		user: { id: locals.user.id, name: locals.user.name, email: locals.user.email, image: locals.user.image ?? null },
		switcher: accounts ? { accounts, impersonating: Boolean(locals.session?.impersonatedBy), adminId } : null
	};
};
