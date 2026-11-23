import { SourceError, fetchSource, sleep } from './http.js';
import { htmlToMarkdown } from './html.js';

/** A page title: free text, but never markup or API syntax. */
// eslint-disable-next-line no-control-regex
const TITLE = /^[^<>[\]{}|#\u0000-\u001f]{1,250}$/;

const SUBPAGE_LIMIT = 100;
const TIME_BUDGET_MS = 45_000;
/** how many works get their parts added up per search (each costs a request or two) */
const TOTALLED_PER_SEARCH = 5;

/**
 * An adapter for a MediaWiki site that holds whole works as a page of contents plus a page for each chapter or part
 * ("Work/Chapter 1"): Wikisource (public-domain texts) and Wikibooks (open textbooks).
 *
 * @param {{
 *   host: string,
 *   name: string,
 *   license: string,
 *   rights: string,
 *   contentsPageWords: number,
 *   gatherAlways?: boolean,
 *   skipParts?: RegExp
 * }} config
 *   contentsPageWords: a work whose own page is shorter than this is taken to be a page of contents;
 *   gatherAlways: bring in the parts even when the work's own page is long (a book's page has an introduction and its contents);
 *   skipParts: parts that repeat the others ("Print version") or are not the text ("Authors")
 */
export function createMediaWikiSource({ host, name, license, rights, contentsPageWords, gatherAlways = false, skipParts }) {
	const api = `https://${host}/w/api.php`;
	const label = name;
	/** @param {Record<string, string>} params */
	const url = (params) => `${api}?${new URLSearchParams({ format: 'json', formatversion: '2', ...params })}`;
	/** @param {string} title */
	const pageUrl = (title) => `https://${host}/wiki/${encodeURI(title.replace(/ /g, '_'))}`;

	/**
	 * The words in all the parts of a work, which the work's own page does not count.
	 * @param {string} title
	 * @returns {Promise<{ words: number, parts: number } | null>} null when it has no parts
	 */
	async function totalOfParts(title) {
		let words = 0;
		let parts = 0;
		let offset = 0;
		for (let page = 0; page < 4; page++) {
			const data = await fetchSource(url({ action: 'query', list: 'search', srsearch: `prefix:${title.replace(/"/g, '')}/`, srnamespace: '0', srlimit: '50', srprop: 'wordcount', sroffset: String(offset) }), { label });
			for (const r of /** @type {any[]} */ (data?.query?.search ?? [])) {
				if (skipParts?.test(r.title)) continue;
				words += r.wordcount;
				parts++;
			}
			if (!data?.continue?.sroffset) break;
			offset = data.continue.sroffset;
			await sleep(150);
		}
		return parts ? { words, parts } : null;
	}

	/**
	 * @param {string} q
	 * @param {{ wholeOnly?: boolean }} [options] wholeOnly leaves out single chapters and parts (pages "Work/Chapter 1")
	 */
	async function search(q, { wholeOnly = false } = {}) {
		const data = await fetchSource(url({ action: 'query', list: 'search', srsearch: q, srnamespace: '0', srlimit: wholeOnly ? '50' : '20', srprop: 'snippet|wordcount' }), { label });
		/** @type {any[]} */
		const found = (data?.query?.search ?? []).filter((/** @type {any} */ r) => !wholeOnly || !r.title.includes('/')).slice(0, 20);
		// a contents page says how short it is, not how long the work is: add up its parts
		let totalled = 0;
		for (const r of found) {
			if (r.title.includes('/') || r.wordcount >= contentsPageWords || totalled >= TOTALLED_PER_SEARCH) continue;
			totalled++;
			try {
				const all = await totalOfParts(r.title);
				if (all) r.detail = `${all.words.toLocaleString('en-US')} words in ${all.parts} parts`;
			} catch {
				// the page's own count will do
			}
		}
		return found.map((/** @type {any} */ r) => ({
			id: r.title,
			title: r.title,
			author: null,
			detail: r.detail ?? `${r.wordcount.toLocaleString('en-US')} words`,
			url: pageUrl(r.title)
		}));
	}

	/**
	 * @param {string} title
	 * @param {number} baseLevel
	 * @returns {Promise<{ markdown: string, subpages: string[] }>}
	 */
	async function readPage(title, baseLevel) {
		const data = await fetchSource(url({ action: 'parse', page: title, prop: 'text|links', redirects: '1', disableeditsection: '1', disablelimitreport: '1', disabletoc: '1' }), { label });
		if (data?.error) throw new SourceError(404, `${name} has no such page.`);
		const prefix = `${data.parse.title}/`;
		const subpages = [...new Set(/** @type {any[]} */ (data.parse.links ?? []).filter((l) => l.ns === 0 && l.exists !== false && l.title.startsWith(prefix) && !skipParts?.test(l.title)).map((l) => /** @type {string} */ (l.title)))];
		return { markdown: htmlToMarkdown(data.parse.text, { baseLevel }), subpages };
	}

	/** @param {string} id the page title */
	async function text(id) {
		if (!TITLE.test(id)) throw new SourceError(400, `That is not a ${name} page title.`);
		const main = await readPage(id, 1);
		/** @type {string[]} */
		const notes = [];
		let body = main.markdown;
		// a long work is a contents page linking to a page for each chapter: bring them all, in order
		if (main.subpages.length && (gatherAlways || main.markdown.length < 3000)) {
			const started = Date.now();
			/** @type {string[]} */
			const parts = [];
			for (const sub of main.subpages.slice(0, SUBPAGE_LIMIT)) {
				if (Date.now() - started > TIME_BUDGET_MS) break;
				try {
					const page = await readPage(sub, 2);
					if (page.markdown) parts.push(`# ${sub.slice(id.length + 1)}\n${page.markdown}`);
				} catch (err) {
					if (!(err instanceof SourceError) || err.status !== 404) throw err;
				}
				await sleep(150);
			}
			if (parts.length < main.subpages.length) notes.push(`Imported ${parts.length} of the ${main.subpages.length} chapters or parts; the rest were left out to keep the import quick.`);
			if (parts.length) body = gatherAlways ? [main.markdown, ...parts].join('\n') : parts.join('\n');
		}
		const lines = body.split('\n').filter((l) => l && !l.startsWith('#'));
		const listed = lines.filter((l) => l.startsWith('- ')).length;
		if (body.length < 120 || (lines.length >= 3 && listed / lines.length > 0.6 && !main.subpages.length)) throw new SourceError(422, 'That page is a list of versions or an index, not a text. Pick one of its entries instead.');
		const title = id.replace(/\s*\([^)]*\)\s*$/, '');
		return {
			title,
			notes,
			body,
			details: { source: name, sourceUrl: pageUrl(id), title: id, license, rights: `${rights} Page history: ${pageUrl(id)}?action=history`, language: 'English' }
		};
	}

	return { search, text };
}
