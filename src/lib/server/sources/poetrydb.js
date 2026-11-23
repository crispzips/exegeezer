import { SourceError, fetchSource } from './http.js';

const BASE = 'https://poetrydb.org';
const SEPARATOR = '::';

/** @param {string} s */
const enc = (s) => encodeURIComponent(s.replace(/[;/?#\\]/g, ' '));

/** @param {string} path */
async function ask(path) {
	const data = await fetchSource(`${BASE}/${path}`, { label: 'PoetryDB' }).catch((err) => {
		if (err instanceof SourceError && err.status === 404) return [];
		throw err;
	});
	return Array.isArray(data) ? data : []; // a miss comes back as { status: 404 }
}

/** @param {string} q */
export async function search(q) {
	const w = q.trim();
	if (!w) return [];
	const [byTitle, byAuthor] = await Promise.all([ask(`title/${enc(w)}/title,author,linecount`), ask(`author/${enc(w)}/title,author,linecount`)]);
	const seen = new Set();
	/** @type {any[]} */
	const results = [];
	for (const p of [...byTitle, ...byAuthor]) {
		const id = `${p.author}${SEPARATOR}${p.title}`;
		if (seen.has(id)) continue;
		seen.add(id);
		results.push({ id, title: p.title, author: p.author, detail: `${p.linecount} lines`, url: 'https://poetrydb.org/' });
	}
	return results.slice(0, 50);
}

/** @param {string} id "Author::Title" */
export async function text(id) {
	const at = id.lastIndexOf(SEPARATOR);
	if (at < 1 || id.length > 400) throw new SourceError(400, 'That is not a PoetryDB poem.');
	const author = id.slice(0, at);
	const title = id.slice(at + SEPARATOR.length);
	const found = await ask(`title,author/${enc(title)}:abs;${enc(author)}:abs`);
	const poem = found[0];
	if (!poem?.lines?.length) throw new SourceError(404, 'PoetryDB has no such poem.');
	return {
		title: poem.title,
		notes: [],
		details: { source: 'PoetryDB', sourceUrl: 'https://poetrydb.org/', title: poem.title, author: poem.author, license: 'Public domain (the poems PoetryDB lists)', language: 'English' },
		body: /** @type {string[]} */ (poem.lines).map((l) => l.trim()).filter(Boolean).map((l) => (/^(#{1,6}\s|>|[-+]\s|\d+[.)]\s)/.test(l) ? `\\${l}` : l)).join('\n')
	};
}
