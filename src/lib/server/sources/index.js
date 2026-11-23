import { SourceError, getContact } from './http.js';
import { OPEN_SOURCES, HUMAN_SOURCES } from './catalog.js';
import * as internetArchive from './internetArchive.js';
import * as wikisource from './wikisource.js';
import * as poetrydb from './poetrydb.js';
import * as wikibooks from './wikibooks.js';
import * as federalRegister from './federalRegister.js';
import * as ecfr from './ecfr.js';
import * as pubmed from './pubmed.js';
import * as devdocs from './devdocs.js';
import * as markdownDocs from './markdownDocs.js';

export { OPEN_SOURCES, HUMAN_SOURCES, SourceError };

/** @typedef {{ id: string, title: string, author: string | null, detail: string, url: string, tooBig?: boolean }} SourceResult */
/* `tooBig`: the text cannot be imported (the detail says why), so the dialog shows it with its Import button and tick box switched off */
/**
 * What an adapter gives back for one text. `details` is the rights and publication information that came with it
 * (stored with the text as imported details); all its values are plain strings and any may be empty.
 * @typedef {{ title: string, notes: string[], body: string, details: { source: string, sourceUrl: string, title: string, author?: string, published?: string, publisher?: string, citation?: string, identifier?: string, license?: string, rights?: string, language?: string } }} SourceText
 */

/** @typedef {{ wholeOnly?: boolean }} SearchOptions */

/** @type {Record<string, { search: (q: string, options?: SearchOptions) => Promise<SourceResult[]>, text: (id: string) => Promise<SourceText> }>} */
const ADAPTERS = { 'internet-archive': internetArchive, wikisource, poetrydb, wikibooks, 'federal-register': federalRegister, ecfr, pubmed, devdocs, 'markdown-docs': markdownDocs };

/**
 * The sources, each with whether it can be used on this server right now.
 * @returns {Promise<(import('./catalog.js').OpenSource & { available: boolean, unavailableReason?: string })[]>}
 */
export async function listOpenSources() {
	const hasContact = !!(await getContact()).trim();
	return OPEN_SOURCES.map((s) => (s.needsContact && !hasContact ? { ...s, available: false, unavailableReason: `${s.name} asks automated clients to identify their operator. Set SOURCES_CONTACT (an email or web address) on the server to turn it on.` } : { ...s, available: true }));
}

/** @param {string} source */
async function adapter(source) {
	const a = Object.hasOwn(ADAPTERS, source) ? ADAPTERS[source] : null;
	if (!a) throw new SourceError(404, 'There is no such source.');
	if (OPEN_SOURCES.find((s) => s.id === source)?.needsContact && !(await getContact()).trim()) {
		throw new SourceError(503, 'This source is switched off until the server has a SOURCES_CONTACT set.');
	}
	return a;
}

/**
 * @param {string} source @param {string} query
 * @param {SearchOptions} [options] wholeOnly: complete works only, not single chapters or parts (only sources that list parts act on it)
 */
export async function searchSource(source, query, options = {}) {
	const q = query.trim().slice(0, 200);
	if (!q) throw new SourceError(400, 'Type something to search for.');
	return (await adapter(source)).search(q, options);
}

/**
 * A whole text as Markdown for the Load Text preview. Its own sections are the top-level headers: the title is
 * not one (it is returned apart, to name the text), and neither is a line crediting the source (that is in `details`).
 * @param {string} source @param {string} id
 */
export async function fetchSourceText(source, id) {
	if (!id || id.length > 400) throw new SourceError(400, 'Choose a text to import.');
	const t = await (await adapter(source)).text(id);
	if (!t.body.trim()) throw new SourceError(422, 'That text came back empty.');
	/** @type {Record<string, string>} */
	const details = { importedAt: new Date().toISOString().slice(0, 10) };
	for (const [k, v] of Object.entries(t.details)) if (v) details[k] = v;
	return {
		title: t.title.replace(/\s+/g, ' ').trim(),
		sourceName: t.details.source,
		notes: t.notes,
		details,
		markdown: t.body
	};
}
