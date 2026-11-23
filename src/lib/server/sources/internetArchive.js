import { SourceError, fetchSource } from './http.js';
import { reflow } from './reflow.js';

const MAX_TEXT_BYTES = 8_000_000;

/** An Internet Archive item identifier. */
const IDENTIFIER = /^[A-Za-z0-9][A-Za-z0-9._-]{0,120}$/;

/** @param {string} q the user's words, with the search syntax taken out */
const words = (q) => q.replace(/["():[\]{}^~*?\\/!&|+-]/g, ' ').replace(/\s+/g, ' ').trim();

/** @param {string} q */
export async function search(q) {
	const w = words(q);
	if (!w) return [];
	// openly readable texts only: lending-library scans can not be downloaded
	const query = `(title:(${w}) OR creator:(${w})) AND mediatype:texts AND NOT collection:inlibrary AND NOT collection:printdisabled AND NOT access-restricted-item:true AND (format:DjVuTXT OR format:Text)`;
	const params = new URLSearchParams({ q: query, rows: '20', output: 'json', sort: 'downloads desc' });
	for (const f of ['identifier', 'title', 'creator', 'year', 'language']) params.append('fl[]', f);
	const data = await fetchSource(`https://archive.org/advancedsearch.php?${params}`, { label: 'The Internet Archive' });
	return (data?.response?.docs ?? []).map((/** @type {any} */ d) => ({
		id: d.identifier,
		title: String(d.title ?? d.identifier),
		author: [].concat(d.creator ?? []).join('; ') || null,
		detail: [d.year, [].concat(d.language ?? []).join(', ')].filter(Boolean).join(' · '),
		url: `https://archive.org/details/${d.identifier}`
	}));
}

/** @param {string} id */
export async function text(id) {
	if (!IDENTIFIER.test(id)) throw new SourceError(400, 'That is not an Internet Archive identifier.');
	const meta = await fetchSource(`https://archive.org/metadata/${id}`, { label: 'The Internet Archive' });
	if (!meta?.metadata) throw new SourceError(404, 'The Internet Archive has no such item.');
	if (meta.is_dark || String(meta.metadata['access-restricted-item']).toLowerCase() === 'true') {
		throw new SourceError(403, 'That item is lending-only, so its text is not open to download.');
	}
	/** @type {{ name: string, format: string, size?: string }[]} */
	const files = meta.files ?? [];
	const file = files.find((f) => f.format === 'DjVuTXT') ?? files.find((f) => /_djvu\.txt$/.test(f.name)) ?? files.find((f) => f.format === 'Text');
	if (!file) throw new SourceError(404, 'That item has no text version.');
	if (Number(file.size) > MAX_TEXT_BYTES) throw new SourceError(413, 'That text is too large to import.');
	const raw = await fetchSource(`https://archive.org/download/${id}/${encodeURIComponent(file.name)}`, { as: 'text', maxBytes: MAX_TEXT_BYTES, timeoutMs: 40000, label: 'The Internet Archive' });
	const first = (/** @type {any} */ v) => (Array.isArray(v) ? v[0] : v);
	const m = meta.metadata;
	/** @param {unknown} v */
	const joined = (v) => [].concat(/** @type {any} */ (v) ?? []).filter(Boolean).join('; ');
	const title = String(first(m.title) ?? id).replace(/\s*[/:]\s*$/, '');
	return {
		title,
		notes: ['This text was made by machine scanning (OCR), so it may contain misread words and running page headers.'],
		body: reflow(raw),
		details: {
			source: 'Internet Archive',
			sourceUrl: `https://archive.org/details/${id}`,
			title,
			author: joined(m.creator),
			published: joined(m.date ?? m.year),
			publisher: joined(m.publisher),
			language: joined(m.language),
			license: joined(m.licenseurl),
			rights: [joined(m['possible-copyright-status']), joined(m.rights), joined(m['copyright-region'])].filter(Boolean).join('; '),
			identifier: id
		}
	};
}
