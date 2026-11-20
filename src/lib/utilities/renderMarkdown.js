import MarkdownIt from 'markdown-it';
import footnote from 'markdown-it-footnote';

/** A reference definition line: "[image1]: <https://example.com/a.png>" or a footnote "[^1]: Note text" */
const DEFINITION = /^\s*\[([^\]]+)\]:\s*\S/;
/** Pandoc attributes after an image or link: "{width=2in}" */
const ATTRS = /(\)|\])\{[^}]*\}/g;
/** Every "[label]" in the text (covers "[a][label]", "![][label]", "![label]" and "[^note]") */
const LABEL = /\[([^\]]*)\]/g;
/** A footnote mark: "[^note]" */
const FOOTNOTE_MARK = /\[\^([^\]\s]+)\]/g;

/**
 * Markdown-it with footnotes. Raw HTML in the text is shown as text, never run, and
 * markdown-it itself refuses `javascript:`-style link targets.
 * Footnote numbers follow the whole document, not the single paragraph being rendered
 * (see definitionsOf),
 */
const md = new MarkdownIt({ html: false, linkify: false }).use(footnote);

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
