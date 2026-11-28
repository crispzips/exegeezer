// Dev-only: gives the nine seeded texticians (scripts/seed-texticians.mjs) a web of follow relationships.
//   node scripts/seed-texticians-follows.mjs
// A fixed, hand-picked pattern: some mutual, some one-way, some followed by many, one followed by none.
// Safe to re-run: it replaces the follows among these nine accounts and touches nothing else.
// Refuses to touch any database that isn't on localhost.
import dotenv from 'dotenv';
import postgres from 'postgres';

dotenv.config();
const { DATABASE_URL } = process.env;
const host = new URL(DATABASE_URL ?? 'x://').hostname;
if (!['localhost', '127.0.0.1', '::1'].includes(host)) throw new Error(`Refusing: database host "${host}" is not local`);

// follower -> the users they follow (by the number in the email address)
const FOLLOWS = {
	2: [3, 4, 6, 7, 8, 9],
	3: [2, 5, 4, 7, 8],
	4: [2, 3, 7, 9],
	5: [2, 3, 6, 7, 8],
	6: [5, 2, 3],
	7: [2, 3, 5, 8],
	8: [7, 9, 3, 6],
	9: [2, 7, 8, 4],
	10: [2, 3, 7, 9]
};
const emailOf = (n) => `execgeezer+user${n}@gmail.com`;

const sql = postgres(DATABASE_URL);
try {
	const rows = await sql`select id, email from "user" where email in ${sql(Object.keys(FOLLOWS).map(emailOf))}`;
	const idOf = (n) => rows.find((r) => r.email === emailOf(n))?.id;
	const ids = Object.keys(FOLLOWS).map((n) => idOf(n));
	if (ids.includes(undefined)) throw new Error('Some accounts are missing (run seed-texticians.mjs first)');
	await sql`delete from follow where follower_id in ${sql(ids)} and owner_id in ${sql(ids)}`;
	let n = 0;
	for (const [from, tos] of Object.entries(FOLLOWS)) {
		for (const to of tos) {
			await sql`insert into follow (follower_id, kind, target_id, owner_id) values (${idOf(from)}, 'user', ${idOf(to)}, ${idOf(to)})`;
			n++;
		}
	}
	console.log(`${n} follows among Geezer2-10`);
} finally {
	await sql.end();
}
