import { defineEnvVars } from '@sveltejs/kit/env';

export const variables = defineEnvVars({
	DATABASE_URL: { 
		description: 'The database connection string.' },
	ORIGIN: {
		description: 'The app origin (base URL), e.g. `http://localhost:5173`.'
	},
	BETTER_AUTH_SECRET: {
		description:
			'Secret used to sign tokens. For production use 32 characters generated with high entropy. See [Better Auth installation](https://www.better-auth.com/docs/installation).'
	},
	GOOGLE_CLIENT_ID: {
		description:
			'Google OAuth client ID. See [Better Auth Google provider](https://www.better-auth.com/docs/authentication/google).'
	},
	GOOGLE_CLIENT_SECRET: {
		description:
			'Google OAuth client secret. See [Better Auth Google provider](https://www.better-auth.com/docs/authentication/google).'
	},
	GMAIL_USER: {
		description: 'Gmail address that sends confirmation emails.'
	},
	GMAIL_APP_PASSWORD: {
		description: 'Google app password for GMAIL_USER (myaccount.google.com/apppasswords).'
	},
	SOURCES_CONTACT: {
		description:
			'Optional. An email address or web address added to the User-Agent of requests to open-access text sources (Wikimedia asks automated clients for a way to reach their operator).',
		schema: (/** @type {string | undefined} */ value) => value || undefined
	}
});
