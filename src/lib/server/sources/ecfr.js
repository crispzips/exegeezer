import { SourceError, fetchSource } from './http.js';
import { xmlToHtml } from './xml.js';
import { htmlToMarkdown, decodeEntities } from './html.js';

const API = 'https://www.ecfr.gov/api';
/** "title|part|section|appendix": the last two may be empty */
const ID = /^\d{1,2}\|[A-Za-z0-9.-]{1,12}\|[A-Za-z0-9.-]{0,24}\|[A-Za-z0-9.-]{0,24}$/;

/** @param {string} q the user's words, with search syntax taken out */
const words = (q) => q.replace(/["():[\]{}^~*?\\/!&|]/g, ' ').replace(/\s+/g, ' ').trim();
/** @param {string | null | undefined} html */
const plain = (html) => decodeEntities((html ?? '').replace(/<[^>]*>/g, '')).replace(/\s+/g, ' ').trim();

/** the date each title was last brought up to date, from the eCFR (asked once an hour) */
/** @type {{ at: number, dates: Map<number, string>, latest: string } | undefined} */
let cache;
async function currentDates() {
	if (cache && Date.now() - cache.at < 3_600_000) return cache;
	const data = await fetchSource(`${API}/versioner/v1/titles.json`, { label: 'The eCFR' });
	/** @type {Map<number, string>} */
	const dates = new Map();
	let latest = '';
	for (const t of data?.titles ?? []) {
		if (!t.up_to_date_as_of) continue;
		dates.set(t.number, t.up_to_date_as_of);
		if (t.up_to_date_as_of > latest) latest = t.up_to_date_as_of;
	}
	cache = { at: Date.now(), dates, latest };
	return cache;
}

/** @param {string} q */
export async function search(q) {
	const { latest } = await currentDates();
	const params = new URLSearchParams({ query: words(q), per_page: '20', date: latest });
	const data = await fetchSource(`${API}/search/v1/results?${params}`, { label: 'The eCFR' });
	return (data?.results ?? [])
		.filter((/** @type {any} */ r) => r.hierarchy?.title && r.hierarchy?.part && !r.ends_on)
		.map((/** @type {any} */ r) => {
			const h = r.hierarchy;
			const hh = r.hierarchy_headings;
			const hd = r.headings;
			const where = `${h.title} CFR ${h.section ?? h.part}`;
			return {
				id: `${h.title}|${h.part}|${h.section ?? ''}|${h.appendix ?? ''}`,
				title: plain(h.section ? `${hh.section} ${hd.section}` : h.appendix ? `${hh.appendix} ${hd.appendix}` : `${hh.part} ${hd.part}`),
				author: null,
				detail: `${where} · ${plain(hd.title)}`,
				url: `https://www.ecfr.gov/current/title-${h.title}/part-${h.part}${h.section ? `/section-${h.section}` : ''}`
			};
		});
}

/**
 * eCFR XML: DIV1..DIV9 are the levels (title, chapter, part, subpart, section...), each led by a HEAD.
 * @param {string} name @param {Record<string, string>} attrs @param {string[]} ancestors
 */
function rule(name, attrs, ancestors) {
	if (name === 'HEAD') {
		const level = /^DIV(\d)$/.exec(ancestors[ancestors.length - 1] ?? '')?.[1];
		return `h${Math.min(6, Number(level ?? 6))}`;
	}
	switch (name) {
		case 'P':
		case 'FP':
		case 'CITA':
			return 'p';
		case 'I':
			return 'i';
		case 'E':
			return attrs.T === '03' ? 'i' : attrs.T === '02' ? 'b' : '';
		case 'SU':
		case 'PSPACE':
		case 'THEAD':
		case 'TBODY':
			return '';
		case 'TABLE':
			return 'table';
		case 'TR':
			return 'tr';
		case 'TD':
		case 'TH':
			return 'td';
		case 'GPH':
		case 'MATH':
		case 'FTREF':
			return null;
		default:
			return 'div';
	}
}

/** @param {string} id "title|part|section|appendix" */
export async function text(id) {
	if (!ID.test(id)) throw new SourceError(400, 'That is not an eCFR location.');
	const [title, part, section, appendix] = id.split('|');
	const { dates, latest } = await currentDates();
	const date = dates.get(Number(title)) ?? latest;
	const params = new URLSearchParams({ part });
	if (section) params.set('section', section);
	else if (appendix) params.set('appendix', appendix);
	const xml = await fetchSource(`${API}/versioner/v1/full/${date}/title-${title}.xml?${params}`, { as: 'text', label: 'The eCFR', maxBytes: 20_000_000, timeoutMs: 40000 });
	const citation = section ? `${title} CFR ${section}` : appendix ? `${title} CFR Part ${part}, Appendix ${appendix}` : `${title} CFR Part ${part}`;
	const heading = plain(/<HEAD>([\s\S]*?)<\/HEAD>/.exec(xml)?.[1]) || citation;
	let body = htmlToMarkdown(xmlToHtml(xml, rule), { baseLevel: 1 });
	body = body.replace(/^#{1,2} .*\n?/, '').trimStart(); // the first heading is the title, which names the text instead
	if (!body.trim()) throw new SourceError(404, 'The eCFR has no text there.');
	const name = `${heading} (${citation})`;
	return {
		title: name,
		notes: [`The eCFR is an unofficial, continuously updated edition, current as of ${date}. The official text is the Code of Federal Regulations itself.`],
		body,
		details: {
			source: 'eCFR',
			sourceUrl: `https://www.ecfr.gov/current/title-${title}/part-${part}${section ? `/section-${section}` : ''}`,
			title: name,
			published: `Current as of ${date}`,
			publisher: 'Office of the Federal Register (eCFR, an unofficial edition)',
			citation,
			license: 'US government work: public domain',
			rights: 'The eCFR is not the official legal edition; the official text is the Code of Federal Regulations.'
		}
	};
}
