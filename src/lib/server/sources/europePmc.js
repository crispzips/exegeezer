import { SourceError, fetchSource, sleep } from './http.js';
import { xmlToHtml } from './xml.js';
import { htmlToMarkdown, decodeEntities } from './html.js';

const API = 'https://www.ebi.ac.uk/europepmc/webservices/rest';
const PMCID = /^PMC\d{1,10}$/;

/** @param {string} q the user's words, with search syntax taken out */
const words = (q) => q.replace(/["():[\]{}^~*?\\/!&|]/g, ' ').replace(/\s+/g, ' ').trim();
/** @param {string | null | undefined} html */
const plain = (html) => decodeEntities((html ?? '').replace(/<[^>]*>/g, '')).replace(/\s+/g, ' ').trim();

/** @param {string} q */
export async function search(q) {
	// open-access articles with full text in PubMed Central only: those are the ones whose text may be copied
	const params = new URLSearchParams({ query: `(${words(q)}) AND OPEN_ACCESS:y AND HAS_FT:y AND SRC:PMC`, format: 'json', pageSize: '20', resultType: 'core' });
	const data = await fetchSource(`${API}/search?${params}`, { label: 'Europe PMC' });
	return (data?.resultList?.result ?? [])
		.filter((/** @type {any} */ r) => r.pmcid)
		.map((/** @type {any} */ r) => ({
			id: r.pmcid,
			title: plain(r.title).replace(/\.$/, ''),
			author: plain(r.authorString).replace(/\.$/, '') || null,
			detail: [r.journalInfo?.journal?.title ?? r.journalTitle, r.journalInfo?.yearOfPublication ?? r.pubYear, r.license].filter(Boolean).join(' · '),
			url: `https://europepmc.org/article/PMC/${r.pmcid}`
		}));
}

/**
 * JATS article XML: sections nest, each with a title.
 * @param {string} name @param {Record<string, string>} attrs @param {string[]} ancestors
 */
function rule(name, attrs, ancestors) {
	switch (name) {
		case 'sec':
		case 'abstract':
		case 'body':
		case 'list':
			return name === 'list' ? 'ul' : 'div';
		case 'title': {
			const depth = ancestors.filter((a) => a === 'sec').length;
			return `h${Math.max(2, depth + 1)}`;
		}
		case 'p':
			return 'p';
		case 'list-item':
			return 'li';
		case 'italic':
			return 'i';
		case 'bold':
			return 'b';
		// not part of the reading text
		case 'xref':
		case 'fig':
		case 'table-wrap':
		case 'disp-formula':
		case 'inline-formula':
		case 'supplementary-material':
		case 'label':
		case 'fn-group':
		case 'ref-list':
		case 'sup':
			return null;
		default:
			return '';
	}
}

/** @param {string} id a PMC id */
export async function text(id) {
	if (!PMCID.test(id)) throw new SourceError(400, 'That is not a PubMed Central id.');
	// Europe PMC makes an article's XML the first time it is asked for: it answers 500 for a few seconds, then 200
	let xml = '';
	for (let attempt = 0; attempt < 4 && !xml; attempt++) {
		try {
			xml = await fetchSource(`${API}/${id}/fullTextXML`, { as: 'text', label: 'Europe PMC', maxBytes: 20_000_000, timeoutMs: 40000 });
		} catch (err) {
			if (!(err instanceof SourceError) || err.status < 500) throw err;
			if (attempt === 3) throw new SourceError(503, 'Europe PMC could not prepare that article just now. Try again in a minute.');
			await sleep(3000);
		}
	}
	const title = plain(/<article-title[^>]*>([\s\S]*?)<\/article-title>/.exec(xml)?.[1]) || id;
	const abstract = /<abstract(?![^>]*abstract-type)[^>]*>[\s\S]*?<\/abstract>/.exec(xml)?.[0] ?? '';
	const bodyXml = /<body[^>]*>[\s\S]*<\/body>/.exec(xml)?.[0] ?? '';
	if (!bodyXml) throw new SourceError(404, 'Europe PMC has no open full text for that article.');
	const authors = [...xml.matchAll(/<contrib [^>]*contrib-type="author"[^>]*>[\s\S]*?<\/contrib>/g)].map((m) => {
		const surname = plain(/<surname[^>]*>([\s\S]*?)<\/surname>/.exec(m[0])?.[1]);
		const given = plain(/<given-names[^>]*>([\s\S]*?)<\/given-names>/.exec(m[0])?.[1]);
		return [given, surname].filter(Boolean).join(' ');
	});
	const license = (/<ali:license_ref[^>]*>\s*([^<\s]+)\s*</.exec(xml) ?? /<license[^>]*xlink:href="([^"]*)"/.exec(xml))?.[1] ?? 'See the article page for its license';
	const markdown = htmlToMarkdown(xmlToHtml(`${abstract}${bodyXml}`, rule), { baseLevel: 1 });
	/** @param {RegExp} re */
	const grab = (re) => plain(re.exec(xml)?.[1]);
	const year = grab(/<pub-date[^>]*>[\s\S]*?<year>(\d{4})<\/year>/);
	const journal = grab(/<journal-title[^>]*>([\s\S]*?)<\/journal-title>/);
	const volume = grab(/<volume[^>]*>([^<]*)</);
	const issue = grab(/<issue[^>]*>([^<]*)</);
	const pages = grab(/<fpage[^>]*>([^<]*)</);
	const doi = grab(/<article-id[^>]*pub-id-type="doi"[^>]*>([^<]*)</);
	const statement = grab(/<copyright-statement[^>]*>([\s\S]*?)<\/copyright-statement>/) || grab(/<license-p[^>]*>([\s\S]*?)<\/license-p>/);
	return {
		title,
		notes: ['Figures, tables and the reference list are left out. Check the license before reusing the text.'],
		body: markdown,
		details: {
			source: 'Europe PMC',
			sourceUrl: `https://europepmc.org/article/PMC/${id}`,
			title,
			author: authors.join(', '),
			published: year,
			publisher: [journal, grab(/<publisher-name[^>]*>([\s\S]*?)<\/publisher-name>/)].filter(Boolean).join(', '),
			citation: [journal, [year, volume ? `;${volume}` : '', issue ? `(${issue})` : '', pages ? `:${pages}` : ''].join('')].filter(Boolean).join('. '),
			identifier: [id, doi && `doi:${doi}`].filter(Boolean).join('; '),
			license,
			rights: statement
		}
	};
}
