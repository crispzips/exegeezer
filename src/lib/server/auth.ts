import {
	ORIGIN,
	BETTER_AUTH_SECRET,
	GOOGLE_CLIENT_ID,
	GOOGLE_CLIENT_SECRET,
} from '$app/env/private';

import { betterAuth } from 'better-auth/minimal';
import { drizzleAdapter } from 'better-auth/adapters/drizzle';
import { admin } from 'better-auth/plugins';
import { sveltekitCookies } from 'better-auth/svelte-kit';
import { getRequestEvent } from '$app/server';
import { count, isNull } from 'drizzle-orm';
import { sendEmail } from '#lib/server/email.ts';
import { db } from '#lib/server/db/index.js';
import { text_, user } from '#lib/server/db/schema.js';
import { ensureSelfPersona } from '#lib/server/personae.js';
import { beforeAccountDelete } from '#lib/server/repression.js';

export const auth = betterAuth({
	baseURL: ORIGIN,
	secret: BETTER_AUTH_SECRET,
	database: drizzleAdapter(db, { provider: 'pg' }),
	emailAndPassword: { enabled: true, requireEmailVerification: true },
	emailVerification: {
		sendOnSignUp: true,
		sendOnSignIn: true,
		autoSignInAfterVerification: true,
		// better-auth builds the link; after clicking it the user lands in the app signed in
		sendVerificationEmail: async ({ user, url }) => {
			const link = url.replace(/callbackURL=[^&]*/, 'callbackURL=' + encodeURIComponent('/exejeeze'));
			sendEmail({
				to: user.email,
				subject: 'Confirm your Exegeezer account',
				text: `Hi ${user.name},\n\nConfirm your email to finish setting up Exegeezer:\n${link}\n\nIf you didn't sign up, ignore this message.`,
				html: `<p>Hi ${user.name},</p><p><a href="${link}">Confirm your email</a> to finish setting up Exegeezer.</p><p>If you didn't sign up, ignore this message.</p>`
			}).catch((e) => console.error('[email] failed to send verification email:', e.message));
		}
	},
	socialProviders: {
		google: { 
            clientId: GOOGLE_CLIENT_ID as string, 
            clientSecret: GOOGLE_CLIENT_SECRET as string, 
        }, 
	},
	databaseHooks: {
		user: {
			delete: {
				// deleting an account would delete the texts saved under it: shared ones move to another owner, unpublished
				// ones are destroyed with their commentaries, and publications stay in the database
				before: async (gone) => {
					await beforeAccountDelete(gone.id);
				}
			},
			create: {
				// every account (email or Google sign-up) starts with the persona "self";
				// the very first account also adopts every text saved before accounts existed
				after: async (created) => {
					await ensureSelfPersona(created.id);
					const [{ n }] = await db.select({ n: count() }).from(user);
					if (n === 1) await db.update(text_).set({ userId: created.id }).where(isNull(text_.userId));
				}
			}
		}
	},
	plugins: [
		// admins (role 'admin') can switch into any other account, to test as them
		admin({ impersonationSessionDuration: 60 * 60 * 8 }),
		sveltekitCookies(getRequestEvent) // make sure this is the last plugin in the array
	]
});
