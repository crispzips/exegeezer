// Dev-only: a republic of letters among the test accounts (Claude Test and Geezer2-6): extra personae (one shared
// by two users), texts (some by several personae, some by personae of different users), commentaries on one
// another's texts (and on commentaries), and follows of users and personae.
//   node scripts/seed-texticians-letters.mjs
// Run seed-test-user.mjs and seed-texticians.mjs first. Everything is a plain test label (names, titles, bodies):
// no AI-written content. Safe to re-run: every row it makes has a fixed id, so it replaces its own texts and
// touches nothing else. It stops, changing nothing, if someone has since commented on one of its texts by hand.
// Refuses to touch any database that isn't on localhost.
//
// The app doesn't yet let anyone comment on another user's text, or co-author across accounts: those rows can
// only be made here.
import { createHash } from 'node:crypto';
import dotenv from 'dotenv';
import postgres from 'postgres';
import { randomThemeColors } from '../src/lib/personaColors.js';
import { commentaryTitle } from '../src/lib/textStatus.js';

dotenv.config();
const { DATABASE_URL } = process.env;
const host = new URL(DATABASE_URL ?? 'x://').hostname;
if (!['localhost', '127.0.0.1', '::1'].includes(host)) throw new Error(`Refusing: database host "${host}" is not local`);

/** the same id for the same key on every run */
const idFor = (key) => {
	const h = createHash('sha256').update(`exegeezer-seed-letters:${key}`).digest('hex');
	return `${h.slice(0, 8)}-${h.slice(8, 12)}-4${h.slice(13, 16)}-8${h.slice(17, 20)}-${h.slice(20, 32)}`;
};

// accounts: 'C' is Claude Test, the numbers are the Geezers
const EMAILS = { C: 'claude-test@exegeezer.test', ...Object.fromEntries([2, 3, 4, 5, 6].map((n) => [n, `execgeezer+user${n}@gmail.com`])) };

// extra personae -> the accounts that have them. An account's "self" persona is written 'self<account>' below.
const PERSONAE = { '2A': [2], '2B': [2], '3A': [3], '4A': [4], '5A': [5], '5B': [5], '6A': [6], CA: ['C'], '2+6': [2, 6] };

// originals, all public so that others can plausibly have read them
const TEXTS = [
	{ key: 'L2-1', owner: 2, by: ['self2'], status: 'published', paras: 5 },
	{ key: 'L2-2', owner: 2, by: ['2A'], status: 'draft', paras: 4 },
	{ key: 'L2-3', owner: 2, by: ['2B', '3A'], status: 'draft', paras: 6 },
	{ key: 'L3-1', owner: 3, by: ['self3'], status: 'published', paras: 6 },
	{ key: 'L3-2', owner: 3, by: ['3A', 'self3'], status: 'under review', paras: 4 },
	{ key: 'L4-1', owner: 4, by: ['4A'], status: 'published', paras: 5 },
	{ key: 'L4-2', owner: 4, by: ['self4', '5A', 'self6'], status: 'draft', paras: 4 },
	{ key: 'L5-1', owner: 5, by: ['5A'], status: 'draft', paras: 8 },
	{ key: 'L5-2', owner: 5, by: ['5B', 'self5'], status: 'published', paras: 3 },
	{ key: 'L6-1', owner: 6, by: ['2+6'], status: 'under review', paras: 5 },
	{ key: 'L6-2', owner: 6, by: ['6A', 'CA'], status: 'draft', paras: 4 },
	{ key: 'LC-1', owner: 'C', by: ['selfC'], status: 'published', paras: 5 },
	{ key: 'LC-2', owner: 'C', by: ['CA', 'self2'], status: 'draft', paras: 4 }
];

// commentaries, each after the text it is on; `on` lists, per comment, the paragraphs (from 1) it is about.
// A commentary on a commentary is about that one's comments. One per account per text, as in the app.
const COMMENTARIES = [
	{ key: 'K1', owner: 3, of: 'L2-1', by: ['self3'], status: 'published', vis: 'public', on: [[1], [2, 3], [5]] },
	{ key: 'K2', owner: 2, of: 'K1', by: ['self2'], status: 'draft', vis: 'public', on: [[1], [2]] },
	{ key: 'K3', owner: 4, of: 'L2-1', by: ['4A'], status: 'draft', vis: 'public', on: [[2], [4]] },
	{ key: 'K4', owner: 5, of: 'L3-1', by: ['5A', 'self5'], status: 'published', vis: 'public', on: [[1], [3, 4, 5]] },
	{ key: 'K5', owner: 2, of: 'L3-1', by: ['2A'], status: 'draft', vis: 'private', on: [[6]] },
	{ key: 'K6', owner: 6, of: 'L4-1', by: ['2+6'], status: 'published', vis: 'public', on: [[1], [2]] },
	{ key: 'K7', owner: 3, of: 'L4-1', by: ['3A'], status: 'draft', vis: 'public', on: [[5]] },
	{ key: 'K8', owner: 4, of: 'K6', by: ['4A'], status: 'draft', vis: 'public', on: [[1]] },
	{ key: 'K9', owner: 6, of: 'L5-1', by: ['6A'], status: 'draft', vis: 'public', on: [[2], [6, 7]] },
	{ key: 'K10', owner: 'C', of: 'L5-1', by: ['CA'], status: 'draft', vis: 'private', on: [[8]] },
	{ key: 'K11', owner: 5, of: 'LC-1', by: ['5B'], status: 'draft', vis: 'public', on: [[1], [4]] },
	{ key: 'K12', owner: 2, of: 'L6-2', by: ['2B'], status: 'draft', vis: 'public', on: [[1]] },
	{ key: 'K13', owner: 3, of: 'L6-1', by: ['self3'], status: 'draft', vis: 'public', on: [[3]] },
	{ key: 'K14', owner: 'C', of: 'L2-3', by: ['selfC'], status: 'draft', vis: 'public', on: [[2]] },
	{ key: 'K15', owner: 4, of: 'L3-2', by: ['self4'], status: 'draft', vis: 'public', on: [[1]] },
	{ key: 'K16', owner: 5, of: 'L2-2', by: ['self5', '6A'], status: 'draft', vis: 'public', on: [[3]] },
	{ key: 'K17', owner: 'C', of: 'K11', by: ['selfC'], status: 'draft', vis: 'public', on: [[1]] },
	{ key: 'K18', owner: 2, of: 'L2-2', by: ['2B'], status: 'draft', vis: 'private', on: [[1]] }
];

// follower -> personae followed by themselves, and (to bring Claude Test into the web) users followed
const PERSONA_FOLLOWS = { C: ['5A', '3A'], 2: ['4A', '5B'], 3: ['2A'], 4: ['2+6'], 5: ['6A'], 6: ['2B'] };
const USER_FOLLOWS = [['C', 3], [5, 'C']];

const sql = postgres(DATABASE_URL, { onnotice: () => {} });
try {
	const found = await sql`select id, email, name from "user" where email in ${sql(Object.values(EMAILS))}`;
	const users = {};
	for (const [k, email] of Object.entries(EMAILS)) {
		users[k] = found.find((u) => u.email === email);
		if (!users[k]) throw new Error(`Account ${k} is missing (run seed-test-user.mjs and seed-texticians.mjs first)`);
	}

	await sql.begin(async (sql) => {
		// personae: [id, name as shown to others] by key
		const personae = {};
		for (const [k, u] of Object.entries(users)) {
			const [self] = await sql`select persona_id from user_persona where user_id = ${u.id} and is_self`;
			personae[`self${k}`] = { id: self.persona_id, name: u.name };
		}
		for (const [key, holders] of Object.entries(PERSONAE)) {
			const id = idFor(`persona:${key}`);
			const label = `${holders.length > 1 ? 'shared ' : ''}U${key}`;
			const name = `Test persona ${label}`;
			await sql`
				insert into persona (id, name, description, theme_colors) values (${id}, ${name}, ${`Test persona description ${label}`}, ${sql.json(randomThemeColors())})
				on conflict (id) do update set name = excluded.name, description = excluded.description`;
			for (const h of holders) await sql`insert into user_persona (user_id, persona_id) values (${users[h].id}, ${id}) on conflict do nothing`;
			personae[key] = { id, name };
		}

		// remove an earlier run's texts and their content, all at once (a commented text can't go by itself)
		const textIds = [...TEXTS, ...COMMENTARIES].map((t) => idFor(`text:${t.key}`));
		const old = await sql`select paragraph_id, section_id from text_item where text_id in ${sql(textIds)}`;
		await sql`delete from text where id in ${sql(textIds)}`;
		const oldParagraphs = old.map((r) => r.paragraph_id).filter(Boolean);
		const oldSections = old.map((r) => r.section_id).filter(Boolean);
		if (oldParagraphs.length) await sql`delete from paragraph where id in ${sql(oldParagraphs)} and not exists (select 1 from text_item where paragraph_id = paragraph.id)`;
		if (oldSections.length) await sql`delete from section where id in ${sql(oldSections)} and not exists (select 1 from text_item where section_id = section.id)`;

		/** what was made, by key: a text's id, title, author names and paragraph ids */
		const made = {};

		const addText = async (key, { owner, by, title, status, vis, policy, of = null }) => {
			const id = idFor(`text:${key}`);
			await sql`
				insert into text (id, user_id, persona_id, title, type, commentary_on, production_status, visibility, comment_policy)
				values (${id}, ${users[owner].id}, ${personae[by[0]].id}, ${title}, ${of ? 'commentary' : 'original'}, ${of}, ${status}, ${vis}, ${policy})`;
			for (const [position, p] of by.entries()) await sql`insert into text_author (text_id, persona_id, position) values (${id}, ${personae[p].id}, ${position})`;
			return (made[key] = { id, title, authors: by.map((p) => personae[p].name), paragraphs: [] });
		};
		const addParagraph = async (text, key, position, body) => {
			const id = idFor(`paragraph:${key}`);
			await sql`insert into paragraph (id, body) values (${id}, ${body})`;
			await sql`insert into text_item (text_id, position, paragraph_id) values (${text.id}, ${position}, ${id})`;
			text.paragraphs.push(id);
			return id;
		};

		for (const t of TEXTS) {
			const multi = t.by.length > 1 ? `, ${t.by.length} authors` : '';
			const text = await addText(t.key, { ...t, title: `Letters test ${t.key} (${t.paras} paragraphs${multi})`, vis: 'public', policy: 'anyone' });
			// every paragraph sits in a section; longer texts get a subsection every 4 paragraphs
			let position = 0;
			for (let p = 1; p <= t.paras; p++) {
				if ((p - 1) % 4 === 0) {
					const s = idFor(`section:${t.key}-${p}`);
					await sql`insert into section (id, title) values (${s}, ${`Letters test section ${t.key}-${(p - 1) / 4 + 1}`})`;
					await sql`insert into text_item (text_id, position, section_id, level) values (${text.id}, ${position++}, ${s}, ${p === 1 ? 1 : 2})`;
				}
				await addParagraph(text, `${t.key}-${p}`, position++, `Test paragraph ${t.key}-${p}. ${'Test sentence. '.repeat(1 + (p % 3) * 2)}`.trim());
			}
		}

		for (const c of COMMENTARIES) {
			const on = made[c.of];
			const text = await addText(c.key, { ...c, of: on.id, title: commentaryTitle(on.authors, on.title), policy: 'anyone' });
			for (const [i, targets] of c.on.entries()) {
				const body = `Test comment ${c.key}-${i + 1} on ${c.of}, paragraph${targets.length > 1 ? 's' : ''} ${targets.join(', ')}.`;
				const bodyId = await addParagraph(text, `${c.key}-${i + 1}`, i, body);
				const commentId = idFor(`comment:${c.key}-${i + 1}`);
				await sql`insert into comment (id, commentary_id, body_paragraph_id) values (${commentId}, ${text.id}, ${bodyId})`;
				for (const n of targets) {
					if (!on.paragraphs[n - 1]) throw new Error(`${c.key}: ${c.of} has no paragraph ${n}`);
					await sql`insert into comment_paragraph (comment_id, paragraph_id) values (${commentId}, ${on.paragraphs[n - 1]})`;
				}
			}
		}

		for (const [follower, keys] of Object.entries(PERSONA_FOLLOWS)) {
			for (const k of keys) await sql`insert into persona_follow (follower_id, persona_id) values (${users[follower].id}, ${personae[k].id}) on conflict do nothing`;
		}
		for (const [from, to] of USER_FOLLOWS) {
			await sql`insert into follow (follower_id, kind, target_id, owner_id) values (${users[from].id}, 'user', ${users[to].id}, ${users[to].id}) on conflict do nothing`;
		}
	});

	console.log(`${Object.keys(PERSONAE).length} personae, ${TEXTS.length} texts (${TEXTS.filter((t) => t.by.length > 1).length} by several personae), ${COMMENTARIES.length} commentaries with ${COMMENTARIES.flatMap((c) => c.on).length} comments, ${Object.values(PERSONA_FOLLOWS).flat().length} persona follows, ${USER_FOLLOWS.length} user follows`);
} finally {
	await sql.end();
}
