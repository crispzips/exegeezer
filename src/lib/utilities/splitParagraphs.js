/**
 * Split text into paragraph objects (one per line break), except that a fenced code block
 * (from a line starting with ``` or ~~~ to the matching closing fence) stays together as one
 * paragraph, its lines (and the blank ones between them) and their indentation kept.
 *
 * `level` is the header level of the paragraph: 1-6 for a Markdown header
 * ("# Title" = 1, "### Part" = 3), or 0 for ordinary text. Documents that have
 * any non-zero level are treated as hierarchical. (A line inside a code block is never a header.)
 *
 * @param {string} text
 * @returns {{ id: string, originalIndex: number, text: string, level: number, children: unknown[] }[]}
 */
export function splitParagraphs(text) {
	/** @type {string[]} */
	const chunks = [];
	/** @type {string[] | null} the lines of the code block being read */
	let code = null;
	/** the fence that opened it (a closing fence is the same character, at least as long) */
	let fence = '';
	for (const raw of text.split(/\r\n|\n|\r/)) {
		if (code) {
			code.push(raw.trimEnd());
			const close = /^\s*(`{3,}|~{3,})\s*$/.exec(raw);
			if (close && close[1][0] === fence[0] && close[1].length >= fence.length) {
				chunks.push(code.join('\n'));
				code = null;
			}
			continue;
		}
		const open = /^\s*(`{3,}|~{3,})/.exec(raw);
		if (open && !(open[1][0] === '`' && raw.slice(open[0].length).includes('`'))) {
			code = [raw.trim()];
			fence = open[1];
			continue;
		}
		const line = raw.trim();
		if (line) chunks.push(line); // drop empty chunks
	}
	if (code) chunks.push(code.join('\n')); // a fence left open runs to the end, as in Markdown
	return chunks.map((p, i) => ({
		id: crypto.randomUUID(), // stable key that survives reordering
		originalIndex: i,
		text: p,
		level: p.startsWith('```') || p.startsWith('~~~') ? 0 : headerLevel(p),
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
