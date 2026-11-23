import { SourceError, fetchSource } from './http.js';
import { xmlToHtml } from './xml.js';
import { htmlToMarkdown, decodeEntities } from './html.js';
import { reflow } from './reflow.js';

const API = 'https://www.federalregister.gov/api/v1';
const HOST = 'www.federalregister.gov';
/** a document number, e.g. 2026-23762 or E8-12345 */
const DOC_NUMBER = /^[A-Za-z0-9][A-Za-z0-9-]{3,24}$/;

/** @param {string} q the user's words, with search syntax taken out */
const words = (q) => q.replace(/["():[\]{}^~*?\\/!&|]/g, ' ').replace(/\s+/g, ' ').trim();

/** @param {string} q */
export async function search(q) {
	const params = new URLSearchParams({ 'conditions[term]': words(q), per_page: '20', order: 'relevance' });
	for (const f of ['title', 'document_number', 'type', 'publication_date', 'agency_names', 'html_url']) params.append('fields[]', f);
	const data = await fetchSource(`${API}/documents.json?${params}`, { label: 'The Federal Register' });
	return (data?.results ?? []).map((/** @type {any} */ d) => ({
		id: d.document_number,
		title: d.title,
		author: [].concat(d.agency_names ?? []).join('; ') || null,
		detail: [d.type, d.publication_date].filter(Boolean).join(' · '),
		url: d.html_url
	}));
}

/**
 * Federal Register XML: the headings are HD elements, graded by their SOURCE attribute.
 * @param {string} name @param {Record<string, string>} attrs @param {string[]} ancestors
 */
function rule(name, attrs, ancestors) {
	switch (name) {
		case 'HD': {
			if (ancestors.includes('PREAMB') && !ancestors.includes('SUPLINF')) return 'b'; // "AGENCY:" "ACTION:" labels
			const level = { HED: 2, HD1: 3, HD2: 4, HD3: 5 }[/** @type {'HED'} */ (attrs.SOURCE)] ?? 6;
			return `h${level}`;
		}
		case 'P':
		case 'FP':
		case 'CITA':
		case 'PSIG':
		case 'DATED':
		case 'NAME':
		case 'TITLE':
		case 'SUBJECT':
			return 'p';
		case 'E':
			return attrs.T === '03' ? 'i' : attrs.T === '02' ? 'b' : '';
		case 'I':
			return 'i';
		case 'B':
			return 'b';
		case 'SU':
		case 'FR':
		case 'AU':
		case 'STARS':
			return '';
		case 'GPOTABLE':
			return 'table';
		case 'ROW':
			return 'tr';
		case 'ENT':
		case 'CHED':
			return 'td';
		case 'GPH':
		case 'MATH':
		case 'PRTPAGE':
		case 'BILCOD':
		case 'FTREF':
		case 'DEPDOC':
			return null;
		default:
			return 'div';
	}
}

/** @param {string} id a document number */
export async function text(id) {
	if (!DOC_NUMBER.test(id)) throw new SourceError(400, 'That is not a Federal Register document number.');
	const fields = ['title', 'type', 'publication_date', 'agency_names', 'html_url', 'raw_text_url', 'full_text_xml_url', 'volume', 'start_page', 'document_number'].map((f) => `fields[]=${f}`).join('&');
	const doc = await fetchSource(`${API}/documents/${id}.json?${fields}`, { label: 'The Federal Register' });
	/** @param {unknown} u */
	const ours = (u) => {
		try {
			return typeof u === 'string' && new URL(u).hostname === HOST ? u : null;
		} catch {
			return null;
		}
	};
	const xmlUrl = ours(doc.full_text_xml_url);
	const rawUrl = ours(doc.raw_text_url);
	let body = '';
	if (xmlUrl) {
		const xml = await fetchSource(xmlUrl, { as: 'text', label: 'The Federal Register' });
		body = htmlToMarkdown(xmlToHtml(xml, rule), { baseLevel: 1 });
	} else if (rawUrl) {
		// older documents have only the plain-text edition, inside a <pre>
		const html = await fetchSource(rawUrl, { as: 'text', label: 'The Federal Register' });
		body = reflow(decodeEntities(html.replace(/<[^>]*>/g, '')));
	}
	if (!body.trim()) throw new SourceError(404, 'The Federal Register has no text for that document.');
	const title = String(doc.title ?? id);
	return {
		title,
		notes: [],
		body,
		details: {
			source: 'Federal Register',
			sourceUrl: doc.html_url ?? `https://www.federalregister.gov/d/${id}`,
			title,
			author: [].concat(doc.agency_names ?? []).join('; '),
			published: doc.publication_date ?? '',
			publisher: 'Office of the Federal Register, National Archives and Records Administration',
			citation: doc.volume && doc.start_page ? `${doc.volume} FR ${doc.start_page}` : '',
			identifier: `${doc.type ?? 'Document'} ${doc.document_number ?? id}`,
			license: 'US government work: public domain'
		}
	};
}
