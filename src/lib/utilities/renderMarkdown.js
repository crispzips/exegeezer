import MarkdownIt from 'markdown-it';
import footnote from 'markdown-it-footnote';
import hljs from 'highlight.js/lib/core';
import javascript from 'highlight.js/lib/languages/javascript';
import typescript from 'highlight.js/lib/languages/typescript';
import xml from 'highlight.js/lib/languages/xml';
import css from 'highlight.js/lib/languages/css';
import bash from 'highlight.js/lib/languages/bash';
import json from 'highlight.js/lib/languages/json';
import python from 'highlight.js/lib/languages/python';
import yaml from 'highlight.js/lib/languages/yaml';
import diff from 'highlight.js/lib/languages/diff';
import markdown from 'highlight.js/lib/languages/markdown';
import sql from 'highlight.js/lib/languages/sql';
import ini from 'highlight.js/lib/languages/ini';
import { emphasis } from '#lib/emphasis.svelte.js';

/** A reference definition line: "[image1]: <https://example.com/a.png>" or a footnote "[^1]: Note text" */
const DEFINITION = /^\s*\[([^\]]+)\]:\s*\S/;
/** Pandoc attributes after an image or link: "{width=2in}" */
const ATTRS = /(\)|\])\{[^}]*\}/g;
/** Every "[label]" in the text (covers "[a][label]", "![][label]", "![label]" and "[^note]") */
const LABEL = /\[([^\]]*)\]/g;
/** A footnote mark: "[^note]" */
const FOOTNOTE_MARK = /\[\^([^\]\s]+)\]/g;

// Code blocks are coloured by highlight.js (the colours are the theme's: see `.hljs-*` in app.css). Svelte, Vue and HTML
// are read as XML-with-scripts, which colours their tags, script and style parts.
for (const [name, lang, aliases] of /** @type {[string, any, string[]][]} */ ([
	['javascript', javascript, ['js', 'jsx', 'mjs', 'cjs']],
	['typescript', typescript, ['ts', 'tsx']],
	['xml', xml, ['html', 'svelte', 'vue', 'svg', 'xhtml']],
	['css', css, ['scss', 'less']],
	['bash', bash, ['sh', 'shell', 'zsh', 'console']],
	['json', json, ['jsonc', 'json5']],
	['python', python, ['py']],
	['yaml', yaml, ['yml']],
	['diff', diff, ['patch']],
	['markdown', markdown, ['md']],
	['sql', sql, []],
	['ini', ini, ['toml']]
])) {
	hljs.registerLanguage(name, lang);
	if (aliases.length) hljs.registerAliases(aliases, { languageName: name });
}
/** a block this long is shown as plain code: colouring it would hold the page up */
const HIGHLIGHT_LIMIT = 20000;

/** @param {string} code @param {string} lang */
function highlight(code, lang) {
	const name = lang.trim().split(/\s+/)[0].toLowerCase();
	let body = md.utils.escapeHtml(code);
	let cls = '';
	if (code.length <= HIGHLIGHT_LIMIT) {
		try {
			if (name && hljs.getLanguage(name)) body = hljs.highlight(code, { language: name, ignoreIllegals: true }).value;
			else if (!name && code.length > 40) body = hljs.highlightAuto(code, ['javascript', 'typescript', 'xml', 'css', 'bash', 'json', 'python']).value;
		} catch {
			// the block stays plain
		}
	}
	if (name) cls = ` language-${md.utils.escapeHtml(name)}`;
	return `<pre class="hljs"><code class="hljs${cls}">${body}</code></pre>`;
}

/**
 * Markdown-it with footnotes. Raw HTML in the text is shown as text, never run, and
 * markdown-it itself refuses `javascript:`-style link targets.
 * Footnote numbers follow the whole document, not the single paragraph being rendered
 * (see definitionsOf),
 */
const md = new MarkdownIt({ html: false, linkify: false, highlight }).use(footnote);

// Footnote caption and list number: the document-wide number for the note's label
// (inline notes, which have no label, fall back to the paragraph's own numbering)
/** @param {any} env @param {any} token */
function numberOf(env, token) {
	const label = env.footnotes?.list?.[token.meta.id]?.label;
	return (label !== undefined && env.numbers?.get(`^${label.toLowerCase()}`)) || token.meta.id + 1;
}
md.renderer.rules.footnote_caption = (tokens, idx, _o, env) => {
	const sub = tokens[idx].meta.subId > 0 ? `:${tokens[idx].meta.subId}` : '';
	return `[${numberOf(env, tokens[idx])}${sub}]`;
};
// Footnote text is not shown below the paragraph. A core rule pulls the footnote block
// out of the text and renders each note to HTML (env.noteHtml); the in-text mark then
// carries its note in a data attribute, which the viewer shows in a tooltip on hover.
md.core.ruler.after('footnote_tail', 'footnote_tooltips', (state) => {
	/** @type {any[]} */
	const text = [];
	/** @type {any[] | null} */
	let group = null;
	let id = 0;
	state.env.noteHtml = [];
	for (const tok of state.tokens) {
		if (tok.type === 'footnote_block_open' || tok.type === 'footnote_block_close') continue;
		if (tok.type === 'footnote_open') {
			group = [];
			id = tok.meta.id;
		} else if (tok.type === 'footnote_close') {
			state.env.noteHtml[id] = md.renderer.render(group ?? [], md.options, state.env);
			group = null;
		} else if (group) {
			if (tok.type !== 'footnote_anchor') group.push(tok);
		} else {
			text.push(tok);
		}
	}
	state.tokens = text;
});
md.renderer.rules.footnote_ref = (tokens, idx, options, env, self) => {
	const note = md.utils.escapeHtml((env.noteHtml?.[tokens[idx].meta.id] ?? '').trim());
	const caption = self.rules.footnote_caption?.(tokens, idx, options, env, self);
	return `<sup class="footnote-ref" tabindex="0" data-note="${note}">${caption}</sup>`;
};

// External links open in a new tab; images load lazily
const linkOpen = md.renderer.rules.link_open ?? ((t, i, o, _e, self) => self.renderToken(t, i, o));
md.renderer.rules.link_open = (tokens, idx, o, env, self) => {
	const href = tokens[idx].attrGet('href') ?? '';
	if (/^https?:/i.test(href)) {
		tokens[idx].attrSet('target', '_blank');
		tokens[idx].attrSet('rel', 'noopener noreferrer');
	}
	return linkOpen(tokens, idx, o, env, self);
};
const image = md.renderer.rules.image ?? ((t, i, o, _e, self) => self.renderToken(t, i, o));
md.renderer.rules.image = (tokens, idx, o, env, self) => {
	tokens[idx].attrSet('loading', 'lazy');
	return image(tokens, idx, o, env, self);
};

/**
 * What the whole text defines, so each paragraph can be rendered on its own.
 * `defs` maps each lower-cased label ("image1", "^1") to its definition line. `numbers`
 * numbers the footnotes across the document, in order of first use.
 * @typedef {{ defs: Map<string, string>, numbers: Map<string, number> }} Definitions
 * @param {{ text: string }[]} paragraphs
 * @returns {Definitions}
 */
export function definitionsOf(paragraphs) {
	/** @type {Definitions['defs']} */
	const defs = new Map();
	for (const { text } of paragraphs) {
		const m = DEFINITION.exec(text);
		if (m) defs.set(m[1].trim().toLowerCase(), text);
	}
	/** @type {Definitions['numbers']} */
	const numbers = new Map();
	for (const { text } of paragraphs) {
		if (DEFINITION.test(text)) continue;
		for (const [, label] of text.matchAll(FOOTNOTE_MARK)) {
			const key = label.toLowerCase();
			if (defs.has(`^${key}`) && !numbers.has(`^${key}`)) numbers.set(`^${key}`, numbers.size + 1);
		}
	}
	return { defs, numbers };
}

/**
 * Whether a paragraph is a reference or footnote definition line (shown as plain text).
 * @param {string} text
 */
export function isDefinition(text) {
	return DEFINITION.test(text);
}

/**
 * Render one paragraph's Markdown to HTML (headings, emphasis, links, images, footnotes...).
 * The definitions the paragraph uses are appended to it, so "![][image1]" and "[^1]"
 * resolve even though the definition sits in another paragraph.
 * @param {string} text
 * @param {Definitions} [definitions] from definitionsOf
 * @param {string} [scope] makes this render's ids unique (the paragraph's id)
 */
export function renderMarkdown(text, definitions, scope) {
	const source = text.replace(ATTRS, '$1');
	let extra = '';
	if (definitions?.defs.size && !DEFINITION.test(text)) {
		const used = new Set();
		for (const [, label] of source.matchAll(LABEL)) used.add(label.trim().toLowerCase());
		for (const label of used)
			if (definitions.defs.has(label)) extra += `\n${definitions.defs.get(label)}`;
	}
	return md.render(extra ? `${source}\n${extra}` : source, {
		docId: scope,
		numbers: definitions?.numbers
	});
}

/**
 * A paragraph's text for the views that show plain text: everything is shown as written
 * (escaped, line breaks kept) except the footnote marks, which become hoverable `.footnote-ref`
 * marks carrying their note. Returns null when the text has no footnote mark to show.
 * @param {string} text
 * @param {Definitions} definitions from definitionsOf
 * @param {string} [scope] makes this render's ids unique (the paragraph's id)
 * @returns {string | null}
 */
export function renderFootnoteMarks(text, definitions, scope) {
	if (DEFINITION.test(text)) return null;
	let html = '';
	let last = 0;
	let found = false;
	for (const m of text.matchAll(FOOTNOTE_MARK)) {
		if (!definitions.defs.has(`^${m[1].toLowerCase()}`)) continue;
		const mark = /<sup class="footnote-ref".*?<\/sup>/s.exec(renderMarkdown(m[0], definitions, scope));
		if (!mark) continue;
		html += md.utils.escapeHtml(text.slice(last, m.index)) + mark[0];
		last = m.index + m[0].length;
		found = true;
	}
	return found ? html + md.utils.escapeHtml(text.slice(last)) : null;
}

/** Words that end in a full stop without ending a sentence ("Dr. Smith", "e.g. this") */
const ABBREVIATION = /(?:^|[\s("'“‘])(?:mr|mrs|ms|dr|prof|sr|jr|st|vs|etc|fig|no|vol|cf|ch|pp|p|e\.g|i\.e|al)\.$/i;
/** The end of a sentence: . ! or ? (with any closing quote or bracket), then space, then what begins another sentence */
const SENTENCE_BREAK = /([.!?]+["'”’)\]]*)\s+(?=["“‘(\[]*[A-Z0-9])/g;

/**
 * Reading mode can set a paragraph's first sentence apart (see `emphasis`): wraps it in `<span class="sent-first">`
 * (larger, on a line of its own, by the stylesheet) and the sentences after it in `<span class="sent-body">`.
 * Works on rendered HTML (tags are left alone, and a footnote mark is not counted as text); a heading is left as
 * it is, and so is a paragraph of a single sentence unless `short`.
 * @param {string} html
 * @param {boolean} [short] also set off the sentence of a paragraph of just one (the linear view does)
 */
export function emphasizeFirst(html, short = false) {
	if (!html || !emphasis.first || /^\s*<(?:h[1-6]|pre)\b/i.test(html)) return html; // headings and code blocks stay as they are
	const tokens = html.split(/(<[^>]*>)/);
	// the text a reader sees (footnote marks left out), with where each piece of it begins
	let plain = '';
	let skip = 0;
	/** @type {(number | null)[]} */
	const starts = [];
	tokens.forEach((tok, i) => {
		if (i % 2) {
			if (/^<sup\b/i.test(tok)) skip++;
			else if (/^<\/sup>/i.test(tok)) skip = Math.max(0, skip - 1);
			starts.push(null);
		} else if (skip) starts.push(null);
		else {
			starts.push(plain.length);
			plain += tok;
		}
	});
	/** where each sentence after the first begins, and where the sentence before it ends */
	/** @type {{ start: number, prevEnd: number }[]} */
	const breaks = [];
	for (const m of plain.matchAll(SENTENCE_BREAK)) {
		const end = m.index + m[1].length;
		if (m[1].startsWith('.') && ABBREVIATION.test(plain.slice(0, end))) continue;
		breaks.push({ start: m.index + m[0].length, prevEnd: end });
	}
	if (!plain.trim()) return html;
	const sentences = breaks.length + 1;
	if (sentences < 2 && !short) return html; // a lone sentence has nothing to be set off from
	// the first sentence takes the space after it with it, so the body does not begin with a blank
	// (a lone sentence is the first and there is no body)
	const firstEnd = sentences > 1 ? breaks[0].start : plain.length + 1;
	const OPEN = { first: '<span class="sent-first">', body: '<span class="sent-body">' };
	const VOID = /^<(?:img|br|hr|input|wbr)\b/i;
	let out = '';
	/** the elements open at this point, and how many were open where the span began (-1: no span is open) */
	/** @type {{ open: string, close: string }[]} */
	const stack = [];
	let spanDepth = -1;
	/** which kind of span is open: the large first sentence, or the body after it */
	let kind = '';
	/** shut the span: first the elements opened inside it, which are opened again after it */
	const closeSpan = () => {
		const inner = stack.slice(spanDepth);
		out += inner.map((e) => e.close).reverse().join('') + '</span>' + inner.map((e) => e.open).join('');
		spanDepth = -1;
	};
	tokens.forEach((tok, i) => {
		const a = starts[i];
		if (i % 2) {
			const name = /^<\/?([a-zA-Z0-9]+)/.exec(tok)?.[1] ?? '';
			if (tok.startsWith('</')) {
				if (spanDepth >= 0 && stack.length <= spanDepth) closeSpan();
				stack.pop();
			} else if (!VOID.test(tok) && !tok.endsWith('/>') && !tok.startsWith('<!')) stack.push({ open: tok, close: `</${name}>` });
			out += tok;
			return;
		}
		if (a === null || a === undefined) {
			out += tok;
			return;
		}
		// cut this piece of text where the first sentence ends
		const cuts = [a, a + tok.length];
		if (firstEnd > a && firstEnd < a + tok.length) cuts.push(firstEnd);
		cuts.sort((x, y) => x - y);
		for (let k = 0; k < cuts.length - 1; k++) {
			const x = cuts[k];
			const piece = tok.slice(x - a, cuts[k + 1] - a);
			if (piece.trim() !== '') {
				const want = x < firstEnd ? 'first' : 'body';
				if (spanDepth >= 0 && want !== kind) closeSpan();
				if (want && spanDepth < 0) {
					out += OPEN[/** @type {'first' | 'body'} */ (want)];
					spanDepth = stack.length;
					kind = want;
				}
			}
			out += piece;
		}
	});
	if (spanDepth >= 0) closeSpan();
	return out;
}

/**
 * Plain paragraph text (shown as written, line breaks kept) as HTML with its first sentence marked.
 * @param {string} text
 * @param {boolean} [short] see {@link emphasizeFirst}
 */
export function plainFirst(text, short = false) {
	return emphasizeFirst(md.utils.escapeHtml(text), short);
}
