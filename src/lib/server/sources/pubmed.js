import { SourceError, fetchSource } from './http.js';
import { xmlToHtml } from './xml.js';
import { htmlToMarkdown, decodeEntities } from './html.js';

/**
 * PubMed Central (PMC): the full text of open-access biomedical and life-science articles, from NCBI's own
 * E-utilities (keyless, and fast: about half a second where Europe PMC's mirror took 10 to 60 seconds).
 * PubMed proper holds only citations and abstracts; its full-text articles are the ones in PMC.
 */
const API = 'https://eutils.ncbi.nlm.nih.gov/entrez/eutils';
const TOOL = 'tool=exegeezer';
const PMCID = /^PMC\d{1,10}$/;

/** @param {string} q the user's words, with search syntax taken out */
const words = (q) => q.replace(/["():[\]{}^~*?\\/!&|]/g, ' ').replace(/\s+/g, ' ').trim();
/** @param {string | null | undefined} html */
const plain = (html) => decodeEntities((html ?? '').replace(/<[^>]*>/g, '')).replace(/\s+/g, ' ').trim();

/** @param {string} q */
export async function search(q) {
	// the open-access subset only: those are the articles whose text may be copied
	const params = new URLSearchParams({ db: 'pmc', term: `(${words(q)}) AND open access[filter]`, retmax: '20', retmode: 'json', sort: 'relevance' });
	const found = await fetchSource(`${API}/esearch.fcgi?${params}&${TOOL}`, { label: 'PubMed' });
	/** @type {string[]} */
	const ids = found?.esearchresult?.idlist ?? [];
	if (!ids.length) return [];
	const summary = await fetchSource(`${API}/esummary.fcgi?db=pmc&id=${ids.join(',')}&retmode=json&${TOOL}`, { label: 'PubMed' });
	return ids
		.map((uid) => summary?.result?.[uid])
		.filter(Boolean)
		.map((/** @type {any} */ r) => {
			const names = /** @type {{ name: string }[]} */ (r.authors ?? []).map((a) => a.name);
			return {
				id: `PMC${r.uid}`,
				title: plain(r.title).replace(/\.$/, ''),
				author: names.length ? `${names.slice(0, 4).join(', ')}${names.length > 4 ? ', et al.' : ''}` : null,
				detail: [r.fulljournalname || r.source, String(r.pubdate ?? '').slice(0, 4)].filter(Boolean).join(' · '),
				url: `https://pmc.ncbi.nlm.nih.gov/articles/PMC${r.uid}/`
			};
		});
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
	const xml = await fetchSource(`${API}/efetch.fcgi?db=pmc&id=${id.slice(3)}&rettype=xml&${TOOL}`, { as: 'text', label: 'PubMed', maxBytes: 20_000_000, timeoutMs: 40000 });
	const title = plain(/<article-title[^>]*>([\s\S]*?)<\/article-title>/.exec(xml)?.[1]) || id;
	const abstract = /<abstract(?![^>]*abstract-type)[^>]*>[\s\S]*?<\/abstract>/.exec(xml)?.[0] ?? '';
	const bodyXml = /<body[^>]*>[\s\S]*<\/body>/.exec(xml)?.[0] ?? '';
	if (!bodyXml) throw new SourceError(404, 'PubMed has no open full text for that article.');
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
			source: 'PubMed Central',
			sourceUrl: `https://pmc.ncbi.nlm.nih.gov/articles/${id}/`,
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
