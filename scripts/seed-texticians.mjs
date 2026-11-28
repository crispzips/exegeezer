// Dev-only: creates nine accounts, the first five for different kinds of texticians (text workers).
//   node scripts/seed-texticians.mjs
// Needs the dev server running at ORIGIN. Refuses to touch any database that isn't on localhost.
// Each account signs up through the app's own sign-up route, gets its email marked verified in SQL,
// no profile picture, and the name "Geezer<n>" (n = the number in its email address; `label` below is only for
// this script's log). Those with a bio (the description of their "self" persona) have one written by Paul; the
// others are left as they are.
// Passwords are random and live in .env.texticians (gitignored); this script never prints them.
import { appendFileSync, existsSync, readFileSync } from 'node:fs';
import { randomBytes } from 'node:crypto';
import dotenv from 'dotenv';
import postgres from 'postgres';

dotenv.config();
const { DATABASE_URL, ORIGIN } = process.env;
const host = new URL(DATABASE_URL ?? 'x://').hostname;
if (!['localhost', '127.0.0.1', '::1'].includes(host)) throw new Error(`Refusing: database host "${host}" is not local`);

// Bios are Paul's own descriptions, not generated text.
const TEXTICIANS = [
	{ n: 2, label: 'Literature person', bio: "A literature person from the literary world who isn't judgy or classist about literature." },
	{ n: 3, label: 'Rare books & manuscripts person', bio: 'A rare books and manuscripts person, with an early modern and medieval air: not haughty, just in awe of the majesty of books.' },
	{ n: 4, label: 'Research lawyer', bio: 'A research lawyer who grinds away under green light, looking for injustices to correct and legal values to stand on.' },
	{ n: 5, label: 'Historian', bio: 'A historian who loves to tell stories.' },
	{ n: 6, label: 'Rhetorician & technical writer', bio: 'A rhetorician and technical writer who understands how content and form, argument and composition, coproduce one another.' },
	...[7, 8, 9, 10].map((n) => ({ n, label: `Geezer${n}`, bio: null }))
];
const emailOf = (n) => `execgeezer+user${n}@gmail.com`;

const file = '.env.texticians';
// credentials are made for any account that has none yet
const have = existsSync(file) ? dotenv.parse(readFileSync(file)) : {};
const missing = TEXTICIANS.filter((t) => !have[`USER${t.n}_PASSWORD`]);
if (missing.length) {
	appendFileSync(file, missing.map((t) => `USER${t.n}_EMAIL=${emailOf(t.n)}\nUSER${t.n}_PASSWORD=${randomBytes(18).toString('base64url')}\n`).join(''), { mode: 0o600 });
}
const creds = dotenv.parse(readFileSync(file));

const sql = postgres(DATABASE_URL);
try {
	for (const t of TEXTICIANS) {
		const email = emailOf(t.n);
		const [existing] = await sql`select id from "user" where email = ${email}`;
		if (!existing) {
			const res = await fetch(`${ORIGIN}/api/auth/sign-up/email`, {
				method: 'POST',
				headers: { 'content-type': 'application/json', origin: ORIGIN },
				body: JSON.stringify({ email, password: creds[`USER${t.n}_PASSWORD`], name: `Geezer${t.n}` })
			});
			if (!res.ok) throw new Error(`Sign-up failed for ${email}: ${res.status} ${await res.text()}`);
		}
		const [u] = await sql`update "user" set email_verified = true, image = null, name = ${`Geezer${t.n}`} where email = ${email} returning id`;
		// the bio is the description of the user's "self" persona (made by the sign-up hook)
		const self = sql`(select persona_id from user_persona where user_id = ${u.id} and is_self)`;
		await sql`update persona set image = null where id = ${self}`;
		if (t.bio) await sql`update persona set description = ${t.bio} where id = ${self}`;
		console.log(`${existing ? 'Updated' : 'Created'} ${t.label} (${email})`);
	}
	console.log(`Passwords are in ${file}`);
} finally {
	await sql.end();
}
