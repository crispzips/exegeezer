// Dev-only: a second round of the republic of letters (seed-texticians-letters.mjs), for Geezer2-10: more
// personae (some shared by two users), originals, commentaries on those (and on commentaries), and persona follows.
//   node scripts/seed-texticians-letters-more.mjs
// Run seed-texticians.mjs and seed-texticians-letters.mjs first. Everything is a plain test label (names, titles,
// bodies): no AI-written content. Safe to re-run: every row has a fixed id, and what is already there is left
// alone. It comments only on its own texts. Refuses to touch any database that isn't on localhost.
import { createHash } from 'node:crypto';
import dotenv from 'dotenv';
import postgres from 'postgres';
import { randomThemeColors } from '../src/lib/personaColors.js';
import { commentaryTitle } from '../src/lib/textStatus.js';

dotenv.config();
const { DATABASE_URL } = process.env;
const host = new URL(DATABASE_URL ?? 'x://').hostname;
if (!['localhost', '127.0.0.1', '::1'].includes(host))
	throw new Error(`Refusing: database host "${host}" is not local`);

/** the same id for the same key on every run */
const idFor = (key) => {
	const h = createHash('sha256').update(`exegeezer-seed-letters-more:${key}`).digest('hex');
	return `${h.slice(0, 8)}-${h.slice(8, 12)}-4${h.slice(13, 16)}-8${h.slice(17, 20)}-${h.slice(20, 32)}`;
};

const GEEZERS = [2, 3, 4, 5, 6, 7, 8, 9, 10];
const emailOf = (n) => `execgeezer+user${n}@gmail.com`;

// extra personae -> the accounts that have them. An account's "self" persona is written 'self<account>' below.
const PERSONAE = {
	'3B': [3],
	'3C': [3],
	'4B': [4],
	'4C': [4],
	'5C': [5],
	'6B': [6],
	'6C': [6],
	'7A': [7],
	'7B': [7],
	'7C': [7],
	'8A': [8],
	'8B': [8],
	'9A': [9],
	'9B': [9],
	'9C': [9],
	'10A': [10],
	'10B': [10],
	'3+7': [3, 7],
	'8+9': [8, 9],
	'4+10': [4, 10]
};

// how many originals and commentaries each account gets here. With the first round's, an account ends up with
// about 4 originals and 6 commentaries.
const ORIGINALS = { 2: 2, 3: 2, 4: 2, 5: 2, 6: 2, 7: 5, 8: 5, 9: 5, 10: 4 };
const COMMENTARIES = { 2: 2, 3: 3, 4: 3, 5: 3, 6: 4, 7: 6, 8: 6, 9: 6, 10: 6 };
// the first round numbered its originals from 1 for each of Geezer2-6; these carry on
const NUMBERED_FROM = { 2: 4, 3: 3, 4: 3, 5: 3, 6: 3 };

// follower -> personae followed by themselves (never one of their own)
const PERSONA_FOLLOWS = {
	2: ['7A'],
	3: ['10A'],
	4: ['8A'],
	5: ['7B'],
	7: ['3C', '5C', '8+9'],
	8: ['4B', '7C', '10B'],
	9: ['3+7', '6C', '10A'],
	10: ['8B', '9A', '3+7']
};

const STATUSES = ['draft', 'published', 'under review', 'draft'];

const sql = postgres(DATABASE_URL, { onnotice: () => {} });
try {
	const found =
		await sql`select id, email, name from "user" where email in ${sql(GEEZERS.map(emailOf))}`;
	const users = {};
	for (const n of GEEZERS) {
		users[n] = found.find((u) => u.email === emailOf(n));
		if (!users[n]) throw new Error(`Geezer${n} is missing (run seed-texticians.mjs first)`);
	}

	await sql.begin(async (sql) => {
		// personae: [id, name as shown to others] by key
		const personae = {};
		for (const n of GEEZERS) {
			const [self] =
				await sql`select persona_id from user_persona where user_id = ${users[n].id} and is_self`;
			personae[`self${n}`] = { id: self.persona_id, name: users[n].name, holders: [n] };
		}
		for (const [key, holders] of Object.entries(PERSONAE)) {
			const id = idFor(`persona:${key}`);
			const label = `${holders.length > 1 ? 'shared ' : ''}U${key}`;
			const name = `Test persona ${label}`;
			await sql`
				insert into persona (id, name, description, theme_colors) values (${id}, ${name}, ${`Test persona description ${label}`}, ${sql.json(randomThemeColors())})
				on conflict (id) do nothing`;
			for (const h of holders)
				await sql`insert into user_persona (user_id, persona_id) values (${users[h].id}, ${id}) on conflict do nothing`;
			personae[key] = { id, name, holders };
		}
		/** an account's personae, "self" first */
		const personaeOf = (n) => [
			`self${n}`,
			...Object.keys(PERSONAE).filter((k) => PERSONAE[k].includes(n))
		];

		let newTexts = 0;
		/** Makes a text unless it is there already; says which, with its paragraphs' ids. */
		const addText = async (key, { owner, by, title, status, vis, of = null, bodies }) => {
			const id = idFor(`text:${key}`);
			const paragraphs = bodies.map((_, i) => idFor(`paragraph:${key}-${i + 1}`));
			const authors = by.map((p) => personae[p].name);
			const made = { key, id, owner, title, authors, vis, paragraphs };
			const [existing] = await sql`select title from text where id = ${id}`;
			if (existing) return { ...made, title: existing.title, isNew: false };
			await sql`
				insert into text (id, user_id, persona_id, title, type, commentary_on, production_status, visibility, comment_policy)
				values (${id}, ${users[owner].id}, ${personae[by[0]].id}, ${title}, ${of ? 'commentary' : 'original'}, ${of}, ${status}, ${vis}, 'anyone')`;
			for (const [position, p] of by.entries())
				await sql`insert into text_author (text_id, persona_id, position) values (${id}, ${personae[p].id}, ${position})`;
			newTexts++;
			return { ...made, isNew: true };
		};
		const addParagraph = async (text, position, itemPosition, body) => {
			await sql`insert into paragraph (id, body) values (${text.paragraphs[position]}, ${body})`;
			await sql`insert into text_item (text_id, position, paragraph_id) values (${text.id}, ${itemPosition}, ${text.paragraphs[position]})`;
		};

		// originals, all public so that others can plausibly have read them
		const originals = [];
		let i = 0;
		for (const n of GEEZERS) {
			for (let k = 0; k < ORIGINALS[n]; k++, i++) {
				const key = `L${n}-${(NUMBERED_FROM[n] ?? 1) + k}`;
				const mine = personaeOf(n);
				const by = [mine[(k + 1) % mine.length]];
				// every third has a second author: another account's "self"
				if (i % 3 === 2)
					by.push(`self${GEEZERS[(GEEZERS.indexOf(n) + 1 + (i % 4)) % GEEZERS.length]}`);
				const bodies = Array.from({ length: 3 + (i % 6) }, (_, p) =>
					`Test paragraph ${key}-${p + 1}. ${'Test sentence. '.repeat(1 + ((p + 1) % 3) * 2)}`.trim()
				);
				const multi = by.length > 1 ? `, ${by.length} authors` : '';
				const text = await addText(key, {
					owner: n,
					by,
					title: `Letters test ${key} (${bodies.length} paragraphs${multi})`,
					status: STATUSES[i % STATUSES.length],
					vis: 'public',
					bodies
				});
				originals.push(text);
				if (!text.isNew) continue;
				// every paragraph sits in a section; longer texts get a subsection every 4 paragraphs
				let position = 0;
				for (const [p, body] of bodies.entries()) {
					if (p % 4 === 0) {
						const s = idFor(`section:${key}-${p + 1}`);
						await sql`insert into section (id, title) values (${s}, ${`Letters test section ${key}-${p / 4 + 1}`})`;
						await sql`insert into text_item (text_id, position, section_id, level) values (${text.id}, ${position++}, ${s}, ${p === 0 ? 1 : 2})`;
					}
					await addParagraph(text, p, position++, body);
				}
			}
		}

		// commentaries: the accounts take turns; each is on another account's text, never the same text twice, and
		// every sixth is on an earlier public commentary
		const written = [];
		const seen = new Set();
		let comments = 0;
		const turns = Array.from({ length: Math.max(...Object.values(COMMENTARIES)) }, (_, round) =>
			GEEZERS.filter((n) => round < COMMENTARIES[n])
		).flat();
		for (const [j, owner] of turns.entries()) {
			const open = (list) => list.filter((t) => t.owner !== owner && !seen.has(`${owner}:${t.id}`));
			const onCommentary = j % 6 === 5 ? open(written.filter((t) => t.vis === 'public')) : [];
			const choices = onCommentary.length ? onCommentary : open(originals);
			const on = choices[(j * 7) % choices.length];
			seen.add(`${owner}:${on.id}`);

			const key = `K${19 + j}`;
			const mine = personaeOf(owner);
			// two comments on most, one on the rest
			// (two comments may be on the same paragraph, when the text is short)
			const targets = Array.from(
				{ length: j % 13 < 7 ? 2 : 1 },
				(_, c) => (j + c * 2) % on.paragraphs.length
			);
			const bodies = targets.map(
				(p, c) => `Test comment ${key}-${c + 1} on ${on.key}, paragraph ${p + 1}.`
			);
			const text = await addText(key, {
				owner,
				by: [mine[j % mine.length]],
				of: on.id,
				title: commentaryTitle(on.authors, on.title),
				status: STATUSES[(j + 1) % STATUSES.length],
				vis: j % 11 === 10 ? 'private' : 'public',
				bodies
			});
			written.push(text);
			comments += bodies.length;
			if (!text.isNew) continue;
			for (const [c, body] of bodies.entries()) {
				await addParagraph(text, c, c, body);
				const commentId = idFor(`comment:${key}-${c + 1}`);
				await sql`insert into comment (id, commentary_id, body_paragraph_id) values (${commentId}, ${text.id}, ${text.paragraphs[c]})`;
				await sql`insert into comment_paragraph (comment_id, paragraph_id) values (${commentId}, ${on.paragraphs[targets[c]]})`;
			}
		}

		for (const [follower, keys] of Object.entries(PERSONA_FOLLOWS)) {
			for (const k of keys) {
				if (personae[k].holders.includes(Number(follower)))
					throw new Error(`Geezer${follower} can't follow their own persona ${k}`);
				await sql`insert into persona_follow (follower_id, persona_id) values (${users[follower].id}, ${personae[k].id}) on conflict do nothing`;
			}
		}

		console.log(
			`${Object.keys(PERSONAE).length} personae, ${originals.length} originals, ${written.length} commentaries with ${comments} comments (${newTexts} texts new), ${Object.values(PERSONA_FOLLOWS).flat().length} persona follows`
		);
	});
} finally {
	await sql.end();
}
