import { SourceError, fetchSource } from './http.js';
import { htmlToMarkdown, decodeEntities } from './html.js';

/**
 * DevDocs (devdocs.io): the documentation of a few hundred languages, libraries and tools, gathered in one place and
 * kept up to date. Its docsets are public JSON files: a manifest of them all, and for each an index of its pages
 * (grouped by type) and a database of the pages as HTML. There is no search API, so this searches the manifest
 * and the indexes here.
 */

const MANIFEST = 'https://devdocs.io/docs.json';
const FILES = 'https://documents.devdocs.io';
const LABEL = 'DevDocs';
/** a docset's slug, e.g. svelte, python~3.14, angular~5 */
const SLUG = /^[a-z0-9][a-z0-9._~+-]{0,59}$/;
/** the database of a docset is one file; past this size it is too much to import whole */
const WHOLE_DOCSET_BYTES = 8_000_000;
const DATABASE_BYTES = 70_000_000;
const SECTION_PAGE_LIMIT = 300;
const MANIFEST_MAX_AGE_MS = 60 * 60 * 1000;

/** @typedef {{ name: string, slug: string, version?: string, release?: string, links?: { home?: string, code?: string }, db_size?: number, mtime?: number, attribution?: string }} Docset */
/** @typedef {{ name: string, path: string, type: string }} Entry */

/** @type {{ at: number, docsets: Docset[] } | undefined} */
let manifest;

async function docsets() {
	if (manifest && Date.now() - manifest.at < MANIFEST_MAX_AGE_MS) return manifest.docsets;
	/** @type {Docset[]} */
	const list = await fetchSource(MANIFEST, { label: LABEL });
	if (!Array.isArray(list)) throw new SourceError(502, `${LABEL} sent something that was not understood.`);
	manifest = { at: Date.now(), docsets: list };
	return list;
}

/** @param {Docset} d */
const titleOf = (d) => `${d.name}${d.version ? ` ${d.version}` : ''}`.trim();

/** The pages of a docset, in DevDocs's order, one entry per page (an entry may point inside a page: `page#part`). */
/** @param {string} slug @returns {Promise<{ entries: Entry[], types: { name: string, count: number }[] }>} */
async function indexOf(slug) {
	const data = await fetchSource(`${FILES}/${slug}/index.json`, { label: LABEL });
	/** @type {Set<string>} */
	const seen = new Set();
	/** @type {Entry[]} */
	const entries = [];
	for (const e of /** @type {Entry[]} */ (data?.entries ?? [])) {
		const path = e.path.split('#')[0];
		if (seen.has(path)) continue;
		seen.add(path);
		entries.push({ name: e.name, path, type: e.type ?? '' });
	}
	return { entries, types: data?.types ?? [] };
}

/** @param {string} q */
export async function search(q) {
	const all = await docsets();
	const tokens = q.toLowerCase().split(/[^a-z0-9.+#~_-]+/).filter(Boolean);
	/** @param {Docset} d */
	const haystack = (d) => `${d.name} ${d.version ?? ''} ${d.slug}`.toLowerCase();
	const matching = all
		.map((d) => ({ d, hits: tokens.filter((t) => haystack(d).includes(t)).length, exact: tokens.some((t) => d.name.toLowerCase() === t || d.slug === t) }))
		.filter((x) => x.hits)
		.sort((a, b) => b.hits - a.hits || Number(b.exact) - Number(a.exact) || (b.d.mtime ?? 0) - (a.d.mtime ?? 0) || a.d.slug.length - b.d.slug.length);
	if (!matching.length) return [];
	const best = matching[0];
	const rest = tokens.filter((t) => !haystack(best.d).includes(t));

	// "react hooks": the pages of the docset whose name contains every other word
	if (rest.length) {
		/** @type {import('./index.js').SourceResult[]} */
		const pages = [];
		for (const { d } of matching.filter((x) => x.hits === best.hits).slice(0, 3)) {
			const { entries } = await indexOf(d.slug);
			for (const e of entries) {
				if (rest.every((t) => e.name.toLowerCase().includes(t) || e.path.toLowerCase().includes(t))) {
					pages.push({ id: `${d.slug}|p|${e.path}`, title: `${e.name} (${titleOf(d)})`, author: null, detail: [e.type, `DevDocs ${d.slug}`].filter(Boolean).join(' · '), url: `https://devdocs.io/${d.slug}/${e.path}` });
				}
			}
		}
		return pages.slice(0, 25);
	}

	// a docset's name: the docsets, and (for the best match) its sections
	/** @type {import('./index.js').SourceResult[]} */
	const results = [];
	for (const [i, { d }] of matching.slice(0, 8).entries()) {
		const size = d.db_size ?? 0;
		results.push({
			id: d.slug,
			title: `${titleOf(d)}: the whole documentation`,
			author: null,
			detail: `${size ? `${(size / 1_000_000).toFixed(1)} MB` : ''}${d.release ? ` · release ${d.release}` : ''}${size > WHOLE_DOCSET_BYTES ? ' · too large to import whole, use its sections' : ''}`.replace(/^ · /, ''),
			url: `https://devdocs.io/${d.slug}/`,
			tooBig: size > WHOLE_DOCSET_BYTES
		});
		if (i === 0) {
			const { types } = await indexOf(d.slug);
			for (const t of types.filter((t) => t.name)) {
				results.push({ id: `${d.slug}|t|${t.name}`, title: `${titleOf(d)}: ${t.name}`, author: null, detail: `${t.count} pages`, url: `https://devdocs.io/${d.slug}/` });
			}
		}
	}
	return results;
}

/** @param {string | undefined} html */
const plain = (html) => decodeEntities((html ?? '').replace(/<[^>]*>/g, ' ')).replace(/\s+/g, ' ').trim();

/** @param {string} id a docset's slug, optionally `|t|<type>` (a section) or `|p|<path>` (one page) */
export async function text(id) {
	const [slug, kind, ...restOfId] = id.split('|');
	const target = restOfId.join('|');
	if (!SLUG.test(slug) || (kind && (kind !== 't' && kind !== 'p' || !target))) throw new SourceError(400, 'That is not a DevDocs documentation set.');
	const docset = (await docsets()).find((d) => d.slug === slug);
	if (!docset) throw new SourceError(404, 'DevDocs has no such documentation.');
	if (!kind && (docset.db_size ?? 0) > WHOLE_DOCSET_BYTES) {
		throw new SourceError(413, `${titleOf(docset)} is too large to import whole (${((docset.db_size ?? 0) / 1_000_000).toFixed(0)} MB). Search its name with a topic, or pick one of its sections.`);
	}
	if ((docset.db_size ?? 0) > DATABASE_BYTES) throw new SourceError(413, `${titleOf(docset)} is too large to import from.`);

	const { entries } = await indexOf(slug);
	/** @type {Entry[]} */
	let chosen;
	if (kind === 'p') chosen = entries.filter((e) => e.path === target);
	else if (kind === 't') chosen = entries.filter((e) => e.type === target);
	else chosen = entries;
	if (!chosen.length) throw new SourceError(404, 'DevDocs has no such page.');

	/** @type {string[]} */
	const notes = [];
	if (chosen.length > SECTION_PAGE_LIMIT) {
		notes.push(`Imported the first ${SECTION_PAGE_LIMIT} of the ${chosen.length} pages.`);
		chosen = chosen.slice(0, SECTION_PAGE_LIMIT);
	}
	/** @type {Record<string, string>} */
	const db = await fetchSource(`${FILES}/${slug}/db.json`, { label: LABEL, maxBytes: DATABASE_BYTES, timeoutMs: 60000 });

	// a whole docset: its types are the top-level sections and its pages are inside them; otherwise the pages are
	const pageLevel = kind ? 1 : 2;
	/** @type {string[]} */
	const out = [];
	let missing = 0;
	let currentType = null;
	for (const e of chosen) {
		const html = db[e.path];
		if (!html) {
			missing++;
			continue;
		}
		const md = htmlToMarkdown(html, { baseLevel: pageLevel, code: true, skipTags: ['aside', 'nav', 'footer'] });
		if (!md.trim()) continue;
		if (!kind && e.type && e.type !== currentType) {
			out.push(`# ${e.type.replace(/\s+/g, ' ').trim()}`);
			currentType = e.type;
		}
		out.push(md.startsWith('#') ? md : `${'#'.repeat(pageLevel)} ${e.name}\n${md}`);
	}
	if (missing) notes.push(`${missing} listed page${missing === 1 ? ' was' : 's were'} missing from the download and left out.`);

	const name = titleOf(docset);
	const part = kind === 't' ? target : kind === 'p' ? (chosen[0]?.name ?? target) : '';
	const home = docset.links?.home ?? '';
	const attribution = plain(docset.attribution);
	return {
		title: part ? `${name}: ${part}` : name,
		notes,
		body: out.join('\n'),
		details: {
			source: 'DevDocs',
			sourceUrl: `https://devdocs.io/${slug}/${kind === 'p' ? target : ''}`,
			title: name,
			publisher: 'DevDocs (freeCodeCamp)',
			citation: [attribution, home && `Original documentation: ${home}`].filter(Boolean).join(' '),
			identifier: `${slug}${docset.release ? ` ${docset.release}` : ''}`,
			license: attribution ? 'As the documentation’s own license (see rights)' : '',
			rights: `DevDocs gathers documentation written by its own projects, each under that project’s license, and republishes it with attribution. ${attribution}`.trim(),
			language: 'English'
		}
	};
}
