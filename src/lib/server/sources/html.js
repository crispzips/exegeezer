/**
 * A small HTML to Markdown converter for the markup the open-access sources serve
 * (MediaWiki output, mostly): headings, paragraphs, line breaks, emphasis, lists.
 * Everything else is reduced to its text. No dependencies.
 */

const VOID = new Set(['br', 'hr', 'img', 'meta', 'link', 'input', 'wbr', 'col', 'source']);
const SKIP_TAGS = new Set(['script', 'style', 'noscript', 'template', 'head', 'svg', 'math']);
/** class names whose whole element is page furniture, not text */
const SKIP_CLASSES = new Set(['ws-noexport', 'noprint', 'mw-editsection', 'reference', 'references', 'mw-empty-elt', 'navbox', 'toc', 'pagenum', 'ws-pagenum', 'wst-header', 'mw-cite-backlink', 'hatnote', 'baseline-indicator', 'metadata', 'ambox', 'sistersitebox', 'thumb']);
const BLOCK = new Set(['p', 'div', 'section', 'article', 'header', 'footer', 'blockquote', 'pre', 'figure', 'center', 'ul', 'ol', 'dl', 'dt', 'dd', 'table', 'tr', 'caption']);
const NAMED = { nbsp: ' ', amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", mdash: '—', ndash: '–', hellip: '…', lsquo: '‘', rsquo: '’', ldquo: '“', rdquo: '”', emsp: '\u2003', ensp: '\u2002', thinsp: '\u2009' };

/** @param {string} s */
export function decodeEntities(s) {
	return s.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (m, e) => {
		if (e[0] === '#') {
			const code = e[1].toLowerCase() === 'x' ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10);
			return Number.isFinite(code) && code > 0 && code < 0x110000 ? String.fromCodePoint(code) : m;
		}
		return NAMED[/** @type {keyof typeof NAMED} */ (e.toLowerCase())] ?? m;
	});
}

const TOKEN = /<!--[\s\S]*?-->|<(\/?)([a-zA-Z][a-zA-Z0-9]*)((?:"[^"]*"|'[^']*'|[^>"'])*)>|([^<]+|<)/g;

/**
 * @param {string} html
 * @param {{ baseLevel?: number, code?: boolean, skipTags?: string[] }} [options]
 *   baseLevel: the Markdown level the shallowest heading in the HTML is given (default 2);
 *   code: keep code as code (`inline` marks, fenced blocks with their indentation), as documentation needs;
 *   skipTags: more elements to leave out whole (for example `aside` and `nav` on a documentation site)
 * @returns {string}
 */
export function htmlToMarkdown(html, { baseLevel = 2, code = false, skipTags = [] } = {}) {
	const extraSkip = new Set(skipTags);
	let out = '';
	/** @type {{ tag: string, skip: boolean }[]} */
	const stack = [];
	let skipping = 0; // how many open elements are being skipped
	let heading = 0; // the level of the heading being read, or 0
	let pre = 0;
	/** where each open emphasis mark starts in `out`, so an emphasis with nothing inside can be taken back out */
	/** @type {number[]} */
	const emphasis = [];
	/** @type {RegExpExecArray | null} */
	let m;
	TOKEN.lastIndex = 0;
	while ((m = TOKEN.exec(html))) {
		const [, closing, rawTag, attrs, text] = m;
		if (text !== undefined) {
			if (skipping) continue;
			const t = decodeEntities(text);
			out += pre ? t : t.replace(/[ \t\r\n\f]+/g, ' ');
			continue;
		}
		if (!rawTag) continue; // a comment
		const tag = rawTag.toLowerCase();
		if (closing) {
			// close the nearest matching open element (the markup is not always tidy)
			let i = stack.length - 1;
			while (i >= 0 && stack[i].tag !== tag) i--;
			if (i < 0) continue;
			while (stack.length > i) {
				const el = /** @type {{ tag: string, skip: boolean }} */ (stack.pop());
				if (el.skip) skipping--;
				else {
					const closed = closeTag(el.tag); // (it may take an empty emphasis back out of `out`, so read `out` after it)
					out += closed;
				}
			}
			continue;
		}
		const classes = /\bclass\s*=\s*(?:"([^"]*)"|'([^']*)')/i.exec(attrs);
		const classList = (classes?.[1] ?? classes?.[2] ?? '').split(/\s+/);
		const hidden = /\bdisplay\s*:\s*none/i.test(attrs) || /(?:^|\s)hidden(?=\s|$)/i.test(attrs);
		const skip = SKIP_TAGS.has(tag) || extraSkip.has(tag) || hidden || classList.some((c) => SKIP_CLASSES.has(c));
		if (VOID.has(tag) || /\/\s*$/.test(attrs)) {
			if (!skipping && tag === 'br') out += heading ? ' ' : '\n';
			continue;
		}
		stack.push({ tag, skip });
		if (skip) {
			skipping++;
			continue;
		}
		if (skipping) continue;
		out += openTag(tag, attrs);
	}
	while (stack.length) {
		const el = /** @type {{ tag: string, skip: boolean }} */ (stack.pop());
		if (!el.skip) {
			const closed = closeTag(el.tag);
			out += closed;
		}
	}
	return finish(out, baseLevel);

	/** @param {string} tag @param {string} attrs */
	function openTag(tag, attrs) {
		if (/^h[1-6]$/.test(tag)) {
			heading = Number(tag[1]);
			return `\n\n\u0001${heading} `;
		}
		if (tag === 'pre') {
			pre++;
			if (code && pre === 1) {
				const language = /\bdata-language\s*=\s*"([\w+#.-]{1,20})"/i.exec(attrs)?.[1] ?? '';
				return `\n\n\u0003${language}\n`;
			}
		}
		if (tag === 'li') return '\n\u0002';
		if (code && !pre && tag === 'code') return markOpen('`');
		if (code && pre) return BLOCK.has(tag) && tag !== 'pre' ? '\n' : '';
		if (tag === 'i' || tag === 'em' || tag === 'cite') return markOpen('*');
		if (tag === 'b' || tag === 'strong') return markOpen('**');
		if (BLOCK.has(tag)) return '\n\n';
		if (tag === 'td' || tag === 'th') return ' ';
		return '';
	}
	/** @param {string} mark */
	function markOpen(mark) {
		emphasis.push(out.length);
		return mark;
	}
	/** @param {string} mark the closing mark */
	function markClose(mark) {
		const start = emphasis.pop();
		if (start === undefined) return '';
		if (out.slice(start + mark.length).trim() === '') {
			out = out.slice(0, start) + out.slice(start + mark.length); // nothing was emphasised
			return '';
		}
		return mark;
	}
	/** @param {string} tag */
	function closeTag(tag) {
		if (/^h[1-6]$/.test(tag)) {
			heading = 0;
			return '\n\n';
		}
		if (tag === 'pre') {
			pre--;
			if (code && pre === 0) return '\n\u0003\n\n';
		}
		if (code && !pre && tag === 'code') return markClose('`');
		if (code && pre) return '';
		if (tag === 'i' || tag === 'em' || tag === 'cite') return markClose('*');
		if (tag === 'b' || tag === 'strong') return markClose('**');
		if (tag === 'li') return '\n';
		if (BLOCK.has(tag)) return '\n\n';
		return '';
	}
}

/**
 * Tidy the converted text: real heading levels, Markdown lists, no stray emphasis marks or blank runs,
 * and any line that would be mistaken for Markdown made literal.
 * @param {string} raw
 * @param {number} baseLevel
 */
function finish(raw, baseLevel) {
	// eslint-disable-next-line no-control-regex
	const levels = [...raw.matchAll(/\u0001(\d)/g)].map((m) => Number(m[1]));
	const shallowest = levels.length ? Math.min(...levels) : 0;
	let fenced = false; // inside a code block, whose lines keep their indentation and blank lines
	const lines = raw
		.replace(/(\*+)[ \t]+(?=\n)/g, '$1')
		.split('\n')
		.map((l) => {
			if (l.startsWith('\u0003')) {
				fenced = !fenced;
				return l;
			}
			return fenced ? l.replace(/\s+$/, '') : l.replace(/[ \t\u00a0]+$/g, '').replace(/^[ \t\u00a0]+/, '');
		});
	/** @type {string[]} */
	const out = [];
	fenced = false;
	for (let line of lines) {
		if (line.startsWith('\u0003')) {
			fenced = !fenced;
			out.push(fenced ? `\`\`\`${line.slice(1)}` : '```');
			continue;
		}
		if (fenced) {
			out.push(line);
			continue;
		}
		if (line.startsWith('\u0001')) {
			const n = Number(line[1]);
			const title = line.slice(2).replace(/\*+/g, '').trim();
			if (!title) continue;
			line = `${'#'.repeat(Math.min(6, Math.max(1, n - shallowest + baseLevel)))} ${title}`;
		} else if (line.startsWith('\u0002')) {
			line = `- ${line.slice(1).trim()}`;
			if (line === '-') continue;
		} else if (/^(#{1,6}\s|>|[-+]\s|\d+[.)]\s)/.test(line)) {
			line = `\\${line}`; // literal text that looks like Markdown
		}
		if (line === '' && out[out.length - 1] === '') continue;
		out.push(line);
	}
	while (out[0] === '') out.shift();
	while (out[out.length - 1] === '') out.pop();
	return out.join('\n');
}
