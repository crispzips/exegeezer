// Dev-only: gives the five seeded texticians (scripts/seed-texticians.mjs) persistent texts of varying length.
//   node scripts/seed-texticians-texts.mjs
// Each account gets 3-10 texts. Everything is a plain test label (titles, section and paragraph titles and
// descriptions, bodies): no AI-written content. Statuses, visibility and comment policies are spread across
// the allowed values by a fixed pattern. Safe to re-run: it replaces the texts it made before (titles starting
// "Test text") and touches nothing else. Refuses to touch any database that isn't on localhost.
import { randomUUID } from 'node:crypto';
import dotenv from 'dotenv';
import postgres from 'postgres';

dotenv.config();
const { DATABASE_URL } = process.env;
const host = new URL(DATABASE_URL ?? 'x://').hostname;
if (!['localhost', '127.0.0.1', '::1'].includes(host)) throw new Error(`Refusing: database host "${host}" is not local`);

const STATUSES = ['idea', 'draft', 'under review', 'published'];
const POLICIES = ['authors', 'invitation', 'request', 'anyone'];
// how many texts each account gets (3-10)
const COUNTS = { 2: 4, 3: 7, 4: 3, 5: 10, 6: 6 };
// paragraph counts cycle through these, so lengths vary from a single paragraph to a few dozen
const LENGTHS = [1, 3, 6, 12, 2, 24, 5, 40, 9, 4];
const FILLER = 'Test sentence. ';

const sql = postgres(DATABASE_URL);
try {
	for (const [n, count] of Object.entries(COUNTS)) {
		const email = `execgeezer+user${n}@gmail.com`;
		const [u] = await sql`select id from "user" where email = ${email}`;
		if (!u) { console.log(`Skipping user${n}: not found (run seed-texticians.mjs first)`); continue; }
		const [self] = await sql`select persona_id from user_persona where user_id = ${u.id} and is_self`;

		// remove what an earlier run made, including content nothing else uses
		const old = await sql`select id from text where user_id = ${u.id} and title like 'Test text %'`;
		if (old.length) {
			const ids = old.map((r) => r.id);
			const ps = await sql`select paragraph_id as id from text_item where text_id in ${sql(ids)} and paragraph_id is not null`;
			const ss = await sql`select section_id as id from text_item where text_id in ${sql(ids)} and section_id is not null`;
			await sql`delete from text where id in ${sql(ids)}`;
			if (ps.length) await sql`delete from paragraph where id in ${sql(ps.map((r) => r.id))} and not exists (select 1 from text_item where paragraph_id = paragraph.id)`;
			if (ss.length) await sql`delete from section where id in ${sql(ss.map((r) => r.id))} and not exists (select 1 from text_item where section_id = section.id)`;
		}

		for (let k = 1; k <= count; k++) {
			const label = `U${n}-${k}`;
			const nParas = LENGTHS[(k - 1 + Number(n)) % LENGTHS.length];
			const status = STATUSES[(k + Number(n)) % STATUSES.length];
			const visibility = status === 'published' || k % 3 === 0 ? 'public' : 'private';
			const policy = POLICIES[(k * 3 + Number(n)) % POLICIES.length];
			const [t] = await sql`
				insert into text (user_id, persona_id, title, production_status, visibility, comment_policy)
				values (${u.id}, ${self.persona_id}, ${`Test text ${label} (${nParas} paragraph${nParas === 1 ? '' : 's'})`}, ${status}, ${visibility}, ${policy})
				returning id`;
			await sql`insert into text_author (text_id, persona_id, position) values (${t.id}, ${self.persona_id}, 0)`;

			// longer texts get sections of up to 6 paragraphs; the odd paragraph gets a title and description label
			const items = [];
			if (nParas > 6) items.push({ section: `Test section ${label}-0`, level: 1 });
			for (let p = 1; p <= nParas; p++) {
				if (nParas > 6 && (p - 1) % 6 === 0 && p > 1) items.push({ section: `Test section ${label}-${(p - 1) / 6}`, level: 2 });
				const labelled = p % 5 === 0;
				items.push({
					body: `Test paragraph ${label}-${p}. ${FILLER.repeat(1 + ((p + k) % 4) * 3)}`.trim(),
					title: labelled ? `Test paragraph title ${label}-${p}` : null,
					description: labelled ? `Test paragraph description ${label}-${p}` : null
				});
			}
			for (const [position, it] of items.entries()) {
				const id = randomUUID();
				if (it.section) {
					await sql`insert into section (id, title) values (${id}, ${it.section})`;
					await sql`insert into text_item (text_id, position, section_id, level) values (${t.id}, ${position}, ${id}, ${it.level})`;
				} else {
					await sql`insert into paragraph (id, body, title, description) values (${id}, ${it.body}, ${it.title}, ${it.description})`;
					await sql`insert into text_item (text_id, position, paragraph_id) values (${t.id}, ${position}, ${id})`;
				}
			}
		}
		console.log(`user${n}: ${count} texts`);
	}
} finally {
	await sql.end();
}
