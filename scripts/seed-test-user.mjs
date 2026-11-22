// Dev-only: creates (once) a throwaway test account for Claude's browser testing.
//   node scripts/seed-test-user.mjs
// Needs the dev server running at ORIGIN. Refuses to touch any database that isn't on localhost.
// The credentials live in .env.test-user (gitignored); this script never prints the password.
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { randomBytes } from 'node:crypto';
import dotenv from 'dotenv';
import postgres from 'postgres';

dotenv.config();
const { DATABASE_URL, ORIGIN } = process.env;
const host = new URL(DATABASE_URL ?? 'x://').hostname;
if (!['localhost', '127.0.0.1', '::1'].includes(host)) throw new Error(`Refusing: database host "${host}" is not local`);

const file = '.env.test-user';
const EMAIL = 'claude-test@exegeezer.test';
if (!existsSync(file)) writeFileSync(file, `TEST_USER_EMAIL=${EMAIL}\nTEST_USER_PASSWORD=${randomBytes(18).toString('base64url')}\n`, { mode: 0o600 });
const creds = dotenv.parse(readFileSync(file));

const sql = postgres(DATABASE_URL);
try {
	const [existing] = await sql`select id from "user" where email = ${creds.TEST_USER_EMAIL}`;
	if (!existing) {
		const res = await fetch(`${ORIGIN}/api/auth/sign-up/email`, {
			method: 'POST',
			headers: { 'content-type': 'application/json', origin: ORIGIN },
			body: JSON.stringify({ email: creds.TEST_USER_EMAIL, password: creds.TEST_USER_PASSWORD, name: 'Claude Test' })
		});
		if (!res.ok) throw new Error(`Sign-up failed: ${res.status} ${await res.text()}`);
	}
	// no real inbox: mark the email confirmed directly
	await sql`update "user" set email_verified = true where email = ${creds.TEST_USER_EMAIL}`;
	console.log(`Test account ready (${creds.TEST_USER_EMAIL}); password is in ${file}`);
} finally {
	await sql.end();
}
