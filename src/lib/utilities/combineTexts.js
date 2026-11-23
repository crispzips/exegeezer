/** The deepest Markdown header level */
const DEEPEST = 6;

/** @param {string} title */
const withoutParenthetical = (title) => title.replace(/\s*\([^)]*\)\s*$/, '').trim();

/**
 * Push every Markdown header in `markdown` one level deeper (capped at 6), so a whole text can sit as a section inside another.
 * @param {string} markdown
 */
function demote(markdown) {
	return markdown.replace(/^(#{1,6})(\s)/gm, (_, marks, space) => `${'#'.repeat(Math.min(DEEPEST, marks.length + 1))}${space}`);
}

/**
 * String several imported texts together, in the order given, as the top-level sections of one text.
 *
 * Each text becomes a "# Section" (named after it) with its own headers one level down. The title is not a header
 * but names the whole text: when every title is a part of one work ("Work/Chapter 1", "Work/Chapter 2", as Wikisource
 * names chapters) it is the work's name and each section is named after its part; otherwise it is "Selected texts"
 * (the user renames it after loading). One text comes back as it is. The imported details of every text are kept,
 * in the same order.
 *
 * @template {Record<string, string>} D
 * @param {{ title: string, markdown: string, details: D }[]} texts
 * @returns {{ title: string, markdown: string, details: D[] }}
 */
export function combineTexts(texts) {
	if (texts.length === 0) return { title: '', markdown: '', details: [] };
	if (texts.length === 1) return { title: texts[0].title, markdown: texts[0].markdown, details: [texts[0].details] };

	const prefixes = texts.map((t) => (t.title.includes('/') ? t.title.slice(0, t.title.indexOf('/')) : null));
	const shared = prefixes[0] !== null && prefixes.every((p) => p === prefixes[0]) ? /** @type {string} */ (prefixes[0]) : null;
	const title = shared ? withoutParenthetical(shared) || shared : 'Selected texts';

	const sections = texts.map((t) => {
		const name = shared ? t.title.slice(shared.length + 1).trim() || t.title : t.title;
		return `# ${name.replace(/\s+/g, ' ')}\n${demote(t.markdown)}`;
	});
	return { title, markdown: sections.join('\n'), details: texts.map((t) => t.details) };
}
