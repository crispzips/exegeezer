// Loads Thema, EDItEUR's subject categories and qualifiers, as a global tag set.
//   node scripts/import-thema.mjs path/to/Thema_en.json
// Takes the JSON file from https://www.editeur.org/151/Thema/ (run `npm run db:push` first). Safe to re-run, and
// that is how to move to a new release. There is one tag of each name, so a heading uses the tag users may already
// have typed in those words (taking Thema's spelling). If a code's heading changes, the code moves to the tag of the
// new words; work already tagged with the old words stays tagged with them.
// A code the file no longer has is listed and left alone.
// Thema is used under EDItEUR's licence (https://doi.org/10.4400/nwgj): headings and notes are stored as published
// and must not be altered; EDItEUR is to be credited wherever they are shown; and the copy is to be kept up to date.
import { readFile } from 'node:fs/promises';
import dotenv from 'dotenv';
import postgres from 'postgres';
import { APOSTROPHES } from '../src/lib/tagNames.js';

dotenv.config();

const path = process.argv[2];
if (!path) {
	console.error('Usage: node scripts/import-thema.mjs path/to/Thema_en.json');
	process.exit(1);
}

const list = JSON.parse((await readFile(path, 'utf8')).replace(/^\uFEFF/, '')).CodeList;
// (the file writes some codes as numbers: the top place qualifier '1' is the parent 1)
const entries = list.ThemaCodes.Code.map((c) => ({
	code: String(c.CodeValue),
	name: String(c.CodeDescription),
	notes: c.CodeNotes ? String(c.CodeNotes) : null,
	parent: c.CodeParent === '' || c.CodeParent == null ? null : String(c.CodeParent)
}));
const codes = new Set(entries.map((e) => e.code));
const orphan = entries.find((e) => e.parent && !codes.has(e.parent));
if (codes.size !== entries.length || orphan || !entries.length) {
	console.error('This does not look like a whole Thema code list: nothing was changed.');
	process.exit(1);
}

const set = {
	kind: 'global',
	key: 'thema',
	name: 'Thema',
	description: 'The international subject categories and qualifiers of the book trade.',
	version: String(list.IssueNumber),
	source_url: 'https://www.editeur.org/151/Thema/',
	license_url: 'https://doi.org/10.4400/nwgj',
	attribution: 'Thema subject categories © EDItEUR'
};

const sql = postgres(process.env.DATABASE_URL, { onnotice: () => {} });
const chunks = (rows, size = 1000) =>
	Array.from({ length: Math.ceil(rows.length / size) }, (_, i) =>
		rows.slice(i * size, (i + 1) * size)
	);
try {
	// (the app's search for tags like the one being typed uses it)
	await sql`create extension if not exists pg_trgm`;
	await sql.begin(async (tx) => {
		// what a name is compared as, as in `tag.match_name`
		const form = (name) =>
			tx`lower(translate(${name}, ${APOSTROPHES}, ${"'".repeat(APOSTROPHES.length)}))`;
		const [{ id: setId }] = await tx`
			insert into tag_set ${tx(set)}
			on conflict (key) do update set ${tx(set)}, updated_at = now()
			returning id`;

		// a tag for every heading, using those that exist
		for (const rows of chunks(entries)) {
			await tx`insert into tag ${tx(rows.map((e) => ({ name: e.name })))} on conflict do nothing`;
		}
		const headings = tx.json(entries.map(({ code, name }) => ({ code, name })));
		const tagOf = new Map(
			(
				await tx`
					select i.code, tag.id from jsonb_to_recordset(${headings}) as i(code text, name text)
					join tag on tag.match_name = ${form(tx`i.name`)}`
			).map((r) => [r.code, r.id])
		);
		if (new Set(tagOf.values()).size !== entries.length) {
			throw new Error('Two codes have the same heading, which a tag set cannot hold');
		}
		const respelled = await tx`
			update tag set name = i.name
			from jsonb_to_recordset(${headings}) as i(code text, name text)
			where tag.match_name = ${form(tx`i.name`)} and tag.name <> i.name`;

		const loaded = await tx`
			select m.code, m.tag_id, m.notes, p.code as parent from tag_set_tag m
			left join tag_set_tag p on p.tag_set_id = m.tag_set_id and p.tag_id = m.parent_tag_id
			where m.tag_set_id = ${setId}`;
		const before = new Map(loaded.map((r) => [r.code, r]));

		const moved = loaded.filter((r) => tagOf.has(r.code) && tagOf.get(r.code) !== r.tag_id);

		// the set's places are written afresh, codes Thema has dropped included (where their tag is still free)
		const used = new Set(tagOf.values());
		const gone = loaded.filter((r) => !tagOf.has(r.code));
		const kept = gone.filter((r) => !used.has(r.tag_id));
		for (const r of kept) tagOf.set(r.code, r.tag_id);
		const places = [...entries, ...kept].map((e) => ({
			code: e.code,
			tag_id: tagOf.get(e.code),
			notes: e.notes,
			parent_tag_id: (e.parent && tagOf.get(e.parent)) || null
		}));
		await tx`delete from tag_set_tag where tag_set_id = ${setId}`;
		// (one statement, so that every parent is there by the time the tie to it is checked)
		await tx`
			insert into tag_set_tag (tag_set_id, tag_id, code, notes, parent_tag_id)
			select ${setId}, i.tag_id, i.code, i.notes, i.parent_tag_id
			from jsonb_to_recordset(${tx.json(places)}) as i(code text, tag_id uuid, notes text, parent_tag_id uuid)`;

		const added = entries.filter((e) => !before.has(e.code)).length;
		const rearranged = entries.filter((e) => {
			const was = before.get(e.code);
			return was && (was.notes !== e.notes || was.parent !== e.parent);
		}).length;
		console.log(
			`Thema ${set.version}: ${entries.length} codes; ${added} added, ${moved.length} headings changed, ` +
				`${respelled.count} tags respelled, ${rearranged} given new notes or places`
		);
		if (gone.length) {
			console.log(`No longer in Thema: ${gone.map((r) => r.code).join(', ')}`);
		}
	});
} finally {
	await sql.end();
}
