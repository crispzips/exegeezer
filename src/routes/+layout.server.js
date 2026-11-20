/** The signed-in user (or null) for every page: the app is for signed-in users; everyone else sees the example text. */
export const load = ({ locals }) => ({
	user: locals.user ? { id: locals.user.id, name: locals.user.name, email: locals.user.email, image: locals.user.image ?? null } : null
});
