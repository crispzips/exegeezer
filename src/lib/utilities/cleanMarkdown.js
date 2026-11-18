/** A line that is only an internal link, like a table-of-contents entry:
 *  "[Title 12](#title)", optionally a list item ("- [Title](#title)"). */
const TOC_LINE = /^\s*(?:[-*+]\s+|\d+[.)]\s+)?\[[^\]]*\]\(#(?:\\.|[^)\\])*\)\s*$/;
/** A heading (or bold line) that just says "Contents" / "Table of Contents" */
const TOC_TITLE = /^\s*(?:#{1,6}\s+)?(?:\*\*|__)?\s*(?:table of )?contents\s*(?:\*\*|__)?\s*$/i;
/** Pandoc-style heading attributes at the end of a header: "## Title {#title}" */
const HEADER_ATTRS = /^(#{1,6}\s+.*?)\s*\{[^}]*\}\s*$/;

/** A Markdown image: inline "![alt](url)", reference "![alt][ref]" / "![][ref]" or
 *  shortcut "![ref]", optionally followed by Pandoc attributes "{width=2in}". */
const IMAGE = /(?<!\\)!\[([^\]]*)\](?:\(([^)]*)\)|\[([^\]]*)\])?(?:\{[^}]*\})?/g;
/** A header mark with nothing after it: "##" */
const EMPTY_HEADER = /^\s*#{1,6}\s*$/;
/** A header line: marks, whitespace, then the title text */
const HEADER_LINE = /^\s*#{1,6}\s+(\S.*)$/;
/** A reference definition: "[image1]: <https://example.com/a.png>" */
const DEFINITION = /^\s*\[([^\]]+)\]:\s*<?([^>\s]+)>?/;
/** An embedded base64 image target */
const DATA_URL = /^data:/i;

/**
 * Every reference label that points at a real (non-embedded) URL, lower-cased.
 * @param {string[]} lines
 */
function referenceLabels(lines) {
	const labels = new Set();
	for (const line of lines) {
		const m = DEFINITION.exec(line);
		if (m && !m[1].startsWith("^") && !DATA_URL.test(m[2])) labels.add(m[1].trim().toLowerCase());
	}
	return labels;
}

/**
 * Remove every image in `line` that has no usable URL: an inline image with an
 * empty or embedded (base64) target, or a reference image whose reference is
 * not defined with a real URL. Images that do have a URL are left alone.
 * @param {string} line
 * @param {Set<string>} labels from referenceLabels
 */
function withoutDeadImages(line, labels) {
	return line.replace(IMAGE, (whole, alt, url, ref) => {
		const target = url !== undefined ? url.trim().replace(/^<|>$/g, '') : (ref || alt).trim().toLowerCase();
		const alive = url !== undefined ? target !== '' && !DATA_URL.test(target) : labels.has(target);
		return alive ? whole : '';
	});
}

/** A reference definition whose target is an embedded base64 image
 *  @param {string} line */
function isDataDefinition(line) {
	const m = DEFINITION.exec(line);
	return !!m && DATA_URL.test(m[2]);
}

/** A header line whose only content is image(s): "# ![][image2]" */
/** @param {string} line */
function isImageOnlyHeader(line) {
	const m = HEADER_LINE.exec(line);
	return !!m && m[1].replace(IMAGE, '').trim() === '';
}

/**
 * Tidy Markdown before it is loaded:
 *  - remove the table of contents (a run of lines that are nothing but links to
 *    in-document anchors, plus a "Contents" title right above it)
 *  - remove the curly-brace attributes on section headers (`# Title {#title}`),
 *    which only exist to link the sections to the table of contents
 *  - remove headers that contain only an image and no text ("# ![][image2]"),
 *    and stray headers with no title at all ("## ")
 *  - remove every image that has no URL (empty target, or a reference with no
 *    real URL behind it) and every base64-embedded image, including the
 *    "[image1]: <data:image/png;base64,...>" definitions at the end of Word and
 *    Google Docs exports. A line left empty by this disappears with them.
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

	const labels = referenceLabels(out);
	return out
		.filter((l) => !isImageOnlyHeader(l) && !isDataDefinition(l))
		.flatMap((l) => {
			const cleaned = withoutDeadImages(l, labels);
			// a line that held nothing but dead images leaves no trace
			return cleaned !== l && cleaned.trim() === '' ? [] : [cleaned];
		})
		.filter((l) => !EMPTY_HEADER.test(l)) // also catches a "#" left behind by a removed image
		.map((l) => l.replace(HEADER_ATTRS, '$1'))
		.join('\n');
}
