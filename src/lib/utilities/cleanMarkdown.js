/** A line that is only an internal link, like a table-of-contents entry:
 *  "[Title 12](#title)", optionally a list item ("- [Title](#title)"). */
const TOC_LINE = /^\s*(?:[-*+]\s+|\d+[.)]\s+)?\[[^\]]*\]\(#(?:\\.|[^)\\])*\)\s*$/;
/** A heading (or bold line) that just says "Contents" / "Table of Contents" */
const TOC_TITLE = /^\s*(?:#{1,6}\s+)?(?:\*\*|__)?\s*(?:table of )?contents\s*(?:\*\*|__)?\s*$/i;
/** Pandoc-style heading attributes at the end of a header: "## Title {#title}" */
const HEADER_ATTRS = /^(#{1,6}\s+.*?)\s*\{[^}]*\}\s*$/;

/**
 * Tidy Markdown before it is loaded:
 *  - remove the table of contents (a run of lines that are nothing but links to
 *    in-document anchors, plus a "Contents" title right above it)
 *  - remove the curly-brace attributes on section headers (`# Title {#title}`),
 *    which only exist to link the sections to the table of contents
 *
 * @param {string} text
 * @returns {string}
 */
export function cleanMarkdown(text) {
	const lines = text.split(/\r\n|\n|\r/);
	/** @type {string[]} */
	const out = [];

	for (let i = 0; i < lines.length; i++) {
		if (TOC_LINE.test(lines[i])) {
			// skip the whole run of link lines (blank lines between them included)
			let end = i;
			for (let j = i; j < lines.length; j++) {
				if (TOC_LINE.test(lines[j])) end = j;
				else if (lines[j].trim() !== '') break;
			}
			i = end;
			// drop a "Contents" title just above the run
			while (out.length && out[out.length - 1].trim() === '') out.pop();
			if (out.length && TOC_TITLE.test(out[out.length - 1])) out.pop();
			continue;
		}
		out.push(lines[i]);
	}

	return out.map((l) => l.replace(HEADER_ATTRS, '$1')).join('\n');
}
