// Gives every persona that lacks them its random colour in each appearance theme (see src/lib/personaColors.js).
// New personae get theirs as they are made; this is for the ones from before.
//   node scripts/assign-persona-colors.mjs
// Adds the column if `npm run db:push` hasn't yet. Safe to re-run: colours already stored stay, so after a new
// theme is added it fills in just that one.
import dotenv from 'dotenv';
import postgres from 'postgres';
import { randomThemeColors } from '../src/lib/personaColors.js';

dotenv.config();
const sql = postgres(process.env.DATABASE_URL, { onnotice: () => {} });
try {
	await sql`alter table persona add column if not exists theme_colors jsonb`;
	let n = 0;
	for (const p of await sql`select id, theme_colors as colors from persona`) {
		const colors = randomThemeColors(p.colors ?? {});
		if (Object.entries(colors).every(([theme, hue]) => p.colors?.[theme] === hue)) continue;
		await sql`update persona set theme_colors = ${sql.json(colors)} where id = ${p.id}`;
		n++;
	}
	console.log(`Gave colours to ${n} ${n === 1 ? 'persona' : 'personae'}`);
} finally {
	await sql.end();
}
