import { SourceError } from './http.js';
import { fetchPublic } from './publicFetch.js';
import { htmlToMarkdown } from './html.js';

/**
 * Documentation sites that publish a plain Markdown copy of their docs, for readers that are not web browsers:
 * a guide at `/llms.txt` (a title, a summary and sections of links to Markdown pages) and sometimes the whole
 * documentation in one file at `/llms-full.txt`. Sites that publish them are inviting this use.
 * Search takes a site's name or address (known sites are listed below; any other address is tried).
 */

const NAME = 'Markdown docs';
const PAGE_LIMIT = 80;
const TIME_BUDGET_MS = 50_000;
const CONCURRENCY = 4;
/** the whole-documentation file is only offered when it is a size the app can take in */
const FULL_MAX_BYTES = 12_000_000;
const PAGE_MAX_BYTES = 3_000_000;

/** Known sites that publish one (checked 2026-11-23); the search tests each one before listing it. */
const KNOWN = [
	{ name: 'Svelte', base: 'https://svelte.dev/' },
	{ name: 'Vite', base: 'https://vite.dev/' },
	{ name: 'Bun', base: 'https://bun.sh/docs/' },
	{ name: 'Drizzle ORM', base: 'https://orm.drizzle.team/' },
	{ name: 'Supabase', base: 'https://supabase.com/' },
	{ name: 'Stripe', base: 'https://docs.stripe.com/' },
	{ name: 'Cloudflare', base: 'https://developers.cloudflare.com/' },
	{ name: 'Vercel', base: 'https://vercel.com/docs/' },
	{ name: 'Next.js', base: 'https://nextjs.org/' },
	{ name: 'React', base: 'https://react.dev/' },
	{ name: 'Anthropic', base: 'https://docs.anthropic.com/' }
];

/** @typedef {{ title: string, url: string }} Link */
/** @typedef {{ name: string, summary: string, sections: { name: string, links: Link[] }[] }} Guide */

/**
 * @param {string} text a guide
 * @param {string} guideUrl
 * @returns {Guide | null} null when it is not one (many sites answer any address with a web page)
 */
function parseGuide(text, guideUrl) {
	const lines = text.replace(/^\uFEFF/, '').split(/\r?\n/);
	if (/^\s*</.test(text) || !lines.some((l) => /^#\s+\S/.test(l))) return null;
	/** @type {Guide} */
	const guide = { name: '', summary: '', sections: [] };
	/** @type {{ name: string, links: Link[] } | null} */
	let section = null;
	for (const line of lines) {
		const h1 = /^#\s+(.+?)\s*$/.exec(line);
		const h2 = /^##\s+(.+?)\s*$/.exec(line);
		const link = /^\s*[-*+]\s*\[([^\]]+)\]\(([^)\s]+)(?:\s+"[^"]*")?\)/.exec(line);
		if (h2) {
			section = { name: h2[1], links: [] };
			guide.sections.push(section);
		} else if (h1 && !guide.name) guide.name = h1[1];
		else if (link && section) {
			try {
				const url = new URL(link[2], guideUrl);
				if (url.protocol === 'https:') section.links.push({ title: link[1].trim(), url: url.href });
			} catch {
				// not an address
			}
		} else if (/^>\s?/.test(line) && !section && !guide.summary) guide.summary = line.replace(/^>\s?/, '').trim();
	}
	guide.sections = guide.sections.filter((s) => s.links.length);
	return guide.sections.length ? guide : null;
}

/** @param {string} base a site's address, from the user or the known list @returns {{ guide: string, full: string } | null} */
function guideUrls(base) {
	try {
		const url = new URL(/^https?:\/\//i.test(base) ? base : `https://${base}`);
		url.hash = '';
		url.search = '';
		const dir = url.pathname.replace(/[^/]*llms(-full)?\.txt$/i, '').replace(/\/?$/, '/');
		return { guide: `${url.origin}${dir}llms.txt`, full: `${url.origin}${dir}llms-full.txt` };
	} catch {
		return null;
	}
}

/**
 * Does this site have a guide, and a whole-documentation file?
 * @param {string} base @param {string} [knownName]
 */
async function probe(base, knownName) {
	const urls = guideUrls(base);
	if (!urls) return null;
	try {
		const res = await fetchPublic(urls.guide, { maxBytes: 3_000_000, timeoutMs: 12000 });
		if (res.status !== 200 || res.type === 'text/html') return null;
		const guide = parseGuide(res.text, res.url);
		if (!guide) return null;
		let fullBytes = 0;
		try {
			const head = await fetchPublic(urls.full, { method: 'HEAD', timeoutMs: 8000 });
			if (head.status === 200 && head.type !== 'text/html' && (head.length === null || head.length <= FULL_MAX_BYTES)) fullBytes = head.length ?? 1;
		} catch {
			// no whole-documentation file
		}
		return { guide, guideUrl: res.url, fullUrl: fullBytes ? new URL(urls.full, res.url).href : null, fullBytes, name: knownName ?? (guide.name || new URL(res.url).hostname) };
	} catch {
		return null;
	}
}

/** @param {string} q @param {{ wholeOnly?: boolean }} [options] */
export async function search(q, { wholeOnly = false } = {}) {
	const lower = q.toLowerCase();
	/** @type {{ base: string, name?: string }[]} */
	const candidates = [];
	for (const token of q.split(/\s+/)) {
		if (/^(https?:\/\/)?[a-z0-9-]+(\.[a-z0-9-]+)+(:\d+)?(\/\S*)?$/i.test(token)) candidates.push({ base: token });
	}
	for (const k of KNOWN) if (lower.split(/\s+/).some((w) => w && (k.name.toLowerCase().includes(w) || k.base.includes(w)))) candidates.push({ base: k.base, name: k.name });
	/** @type {import('./index.js').SourceResult[]} */
	const results = [];
	// the same site may be named twice (known, and typed as an address)
	const distinct = candidates.filter((c, i) => candidates.findIndex((o) => guideUrls(o.base)?.guide === guideUrls(c.base)?.guide) === i);
	const found = await Promise.all(distinct.slice(0, 5).map((c) => probe(c.base, c.name)));
	for (const site of found) {
		if (!site) continue;
		const links = site.guide.sections.reduce((n, s) => n + s.links.length, 0);
		if (site.fullUrl) results.push({ id: site.fullUrl, title: `${site.name}: all the documentation in one file`, author: null, detail: site.fullBytes > 1 ? `${(site.fullBytes / 1_000_000).toFixed(1)} MB` : 'one file', url: site.fullUrl });
		results.push({ id: site.guideUrl, title: `${site.name}: the guide and the pages it lists`, author: null, detail: `${links} pages in ${site.guide.sections.length} sections${links > PAGE_LIMIT ? `, the first ${PAGE_LIMIT} imported` : ''}`, url: site.guideUrl });
		if (!wholeOnly) {
			for (const s of site.guide.sections.slice(0, 12)) results.push({ id: `${site.guideUrl}|s|${s.name}`, title: `${site.name}: ${s.name}`, author: null, detail: `${s.links.length} pages`, url: site.guideUrl });
		}
	}
	if (!results.length && candidates.length) throw new SourceError(404, 'No Markdown guide was found at that address. Only sites that publish one can be imported.');
	if (!results.length) throw new SourceError(404, 'Type a documentation site’s name (like Svelte or Stripe) or its address (like svelte.dev). Only sites that publish a Markdown guide can be imported.');
	return results;
}

/**
 * Markdown with its headings moved so the shallowest is `level`, any front matter removed, and code left alone.
 * @param {string} md @param {number} level
 */
function normalize(md, level) {
	const body = md
		.replace(/^\uFEFF/, '')
		.replace(/\r\n?/g, '\n')
		.replace(/^---\n[\s\S]*?\n---\n/, '')
		.replace(/^<SYSTEM>[^\n]*<\/SYSTEM>[ \t]*$/gm, ''); // a note some files open with, addressed to a model
	const lines = body.split('\n');
	let fenced = false;
	/** @type {number[]} */
	const depth = [];
	for (const l of lines) {
		if (/^\s*(```|~~~)/.test(l)) fenced = !fenced;
		else if (!fenced) {
			const h = /^(#{1,6})\s+\S/.exec(l);
			if (h) depth.push(h[1].length);
		}
	}
	const shift = depth.length ? level - Math.min(...depth) : 0;
	fenced = false;
	return lines
		.map((l) => {
			if (/^\s*(```|~~~)/.test(l)) fenced = !fenced;
			else if (!fenced) {
				const h = /^(#{1,6})(\s+\S.*)$/.exec(l);
				if (h) return `${'#'.repeat(Math.min(6, Math.max(1, h[1].length + shift)))}${h[2]}`;
			}
			return l;
		})
		.join('\n')
		.replace(/\n{3,}/g, '\n\n')
		.trim();
}

/** @param {string} id a guide's address, `|s|<section>` after it for one section; or a whole-documentation file's address */
export async function text(id) {
	const [address, kind, ...sectionName] = id.split('|');
	const wanted = sectionName.join('|');
	if (kind && (kind !== 's' || !wanted)) throw new SourceError(400, 'That is not a documentation guide.');
	let url;
	try {
		url = new URL(address);
	} catch {
		throw new SourceError(400, 'That is not a documentation guide.');
	}
	const isFull = /llms-full\.txt$/i.test(url.pathname);
	if (!isFull && !/llms\.txt$/i.test(url.pathname)) throw new SourceError(400, 'That is not a documentation guide.');
	const res = await fetchPublic(url.href, { maxBytes: isFull ? FULL_MAX_BYTES : 3_000_000, timeoutMs: isFull ? 60000 : 20000 });
	if (res.status !== 200) throw new SourceError(404, `${url.hostname} has no such file.`);
	if (res.type === 'text/html') throw new SourceError(422, `${url.hostname} answered with a web page, not a Markdown file.`);
	const host = new URL(res.url).hostname;
	const sourceUrl = res.url;
	/** @param {string} title @param {string} [publisher] */
	const details = (title, publisher) => ({
		source: NAME,
		sourceUrl,
		title,
		publisher: publisher ?? host,
		rights: `Published by ${host} as Markdown for automated readers. Reuse is under the site’s own terms and licenses: check ${new URL(res.url).origin} before sharing it on.`,
		language: 'English'
	});

	if (isFull) {
		const body = normalize(res.text, 1);
		const name = KNOWN.find((k) => new URL(k.base).hostname === host)?.name ?? host;
		return { title: `${name}: all the documentation`, notes: [], body, details: details(name) };
	}

	const guide = parseGuide(res.text, res.url);
	if (!guide) throw new SourceError(422, `${host} has no readable guide there.`);
	const sections = wanted ? guide.sections.filter((s) => s.name === wanted) : guide.sections;
	if (!sections.length) throw new SourceError(404, 'That section is not in the guide.');
	/** @type {Link[]} */
	const links = [];
	const seen = new Set();
	for (const link of sections.flatMap((s) => s.links)) {
		// only pages on the guide's own site, each once
		if (new URL(link.url).hostname !== host || seen.has(link.url)) continue;
		seen.add(link.url);
		links.push(link);
	}
	/** @type {string[]} */
	const notes = [];
	let chosen = links;
	if (links.length > PAGE_LIMIT) {
		chosen = links.slice(0, PAGE_LIMIT);
		notes.push(`Imported the first ${PAGE_LIMIT} of the ${links.length} pages the guide lists; pick one of its sections to read the rest.`);
	}

	const started = Date.now();
	/** @type {(string | null)[]} */
	const pages = new Array(chosen.length).fill(null);
	let next = 0;
	await Promise.all(
		Array.from({ length: CONCURRENCY }, async () => {
			while (next < chosen.length && Date.now() - started < TIME_BUDGET_MS) {
				const i = next++;
				try {
					const page = await fetchPublic(chosen[i].url, { maxBytes: PAGE_MAX_BYTES, timeoutMs: 15000 });
					if (page.status !== 200) throw new SourceError(502, 'no page');
					// a page that is a web page, not Markdown, is read as one, without the site's furniture
					const md = page.type === 'text/html' || /^\s*</.test(page.text) ? htmlToMarkdown(page.text, { baseLevel: 1, code: true, skipTags: ['nav', 'aside', 'header', 'footer', 'form'] }) : normalize(page.text, 1);
					pages[i] = /^#\s/m.test(md) ? md : `# ${chosen[i].title}\n${md}`;
				} catch {
					// left out, and counted below
				}
			}
		})
	);
	const body = pages.filter(Boolean).join('\n');
	if (!body) throw new SourceError(502, `None of the pages the guide lists could be read.`);
	const left = chosen.length - pages.filter(Boolean).length;
	if (left) notes.push(`${left} of the listed pages could not be read in time or were missing and were left out.`);
	return {
		title: wanted ? `${guide.name || host}: ${wanted}` : `${guide.name || host}: the guide`,
		notes,
		body,
		details: details(guide.name || host)
	};
}
