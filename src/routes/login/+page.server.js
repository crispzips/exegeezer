import { fail, redirect } from '@sveltejs/kit';

import { and, eq } from 'drizzle-orm';
import { auth } from '#lib/server/auth.ts';
import { db } from '#lib/server/db/index.js';
import { account, user } from '#lib/server/db/schema.js';
import { APIError } from 'better-auth/api';

/** where signing in or up lands */
const HOME = '/exejeeze';

export const load = (event) => {
	if (event.locals.user) redirect(302, HOME);
	return { signup: event.url.searchParams.get('mode') === 'signup' };
};

/** @param {unknown} error @param {string} fallback */
const message = (error, fallback) => (error instanceof APIError ? error.message || fallback : 'Something went wrong. Please try again.');

export const actions = {
	/** step one of the Sign In dialog: is this email already an account, and does it have a password? */
	checkEmail: async (event) => {
		const email = (await event.request.formData()).get('email')?.toString().trim().toLowerCase() ?? '';
		if (!/^\S+@\S+\.\S+$/.test(email)) return fail(400, { message: 'Enter a valid email address.', email });
		const [found] = await db.select({ id: user.id }).from(user).where(eq(user.email, email));
		if (!found) return { step: 'signup', email };
		const pw = await db.select({ id: account.id }).from(account).where(and(eq(account.userId, found.id), eq(account.providerId, 'credential')));
		if (!pw.length) return fail(400, { message: 'That email signs in with Google. Use “Continue with Google”.', email });
		return { step: 'signin', email };
	},
	signInEmail: async (event) => {
		const formData = await event.request.formData();
		const email = formData.get('email')?.toString().trim() ?? '';
		const password = formData.get('password')?.toString() ?? '';
		if (!email || !password) return fail(400, { message: 'Enter your email and password.', email });
		try {
			await auth.api.signInEmail({ body: { email, password } });
		} catch (error) {
			return fail(error instanceof APIError ? 400 : 500, { message: message(error, 'Sign in failed.'), email });
		}
		redirect(302, HOME);
	},
	signUpEmail: async (event) => {
		const formData = await event.request.formData();
		const name = formData.get('name')?.toString().trim() ?? '';
		const email = formData.get('email')?.toString().trim() ?? '';
		const password = formData.get('password')?.toString() ?? '';
		if (!name || !email || !password) return fail(400, { message: 'Enter your name, email and a password.', email, name, signup: true });
		if (password.length < 8) return fail(400, { message: 'Use a password of at least 8 characters.', email, name, signup: true });
		try {
			await auth.api.signUpEmail({ body: { name, email, password, callbackURL: HOME } });
		} catch (error) {
			return fail(error instanceof APIError ? 400 : 500, { message: message(error, 'Sign up failed.'), email, name, signup: true });
		}
		// email must be confirmed before the account can sign in
		return { step: 'verify', email };
	},
	signInGoogle: async () => {
		const result = await auth.api.signInSocial({ body: { provider: 'google', callbackURL: HOME, newUserCallbackURL: HOME } });
		if (result.url) redirect(302, result.url);
		return fail(400, { message: 'Google sign-in is not available right now.' });
	}
};
