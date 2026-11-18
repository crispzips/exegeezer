/**
 * Split text into paragraph objects (one per line break).
 *
 * `level` is the header level of the paragraph: 1-6 for a Markdown header
 * ("# Title" = 1, "### Part" = 3), or 0 for ordinary text. Documents that have
 * any non-zero level are treated as hierarchical.
 *
 * @param {string} text
 * @returns {{ id: string, originalIndex: number, text: string, level: number, children: unknown[] }[]}
 */
export function splitParagraphs(text) {
	return text
		.split(/\r\n|\n|\r/)           // any line break = paragraph break
		.map((p) => p.trim())
		.filter(Boolean)               // drop empty chunks
		.map((p, i) => ({
			id: crypto.randomUUID(),    // stable key that survives reordering
			originalIndex: i,
			text: p,
			level: headerLevel(p),
			children: []
		}));
}

/**
 * Markdown ATX header level of a line ("## Title" -> 2), or 0 if it isn't one.
 * @param {string} line
 */
function headerLevel(line) {
	const match = /^(#{1,6})\s+\S/.exec(line);
	return match ? match[1].length : 0;
}
