/**
 * OCR and plain-text books wrap their lines at a fixed width and separate paragraphs
 * with blank lines. The app makes one paragraph per line, so join the wrapped lines
 * back into paragraphs (and mend words hyphenated at a line end).
 * @param {string} text
 * @returns {string} one paragraph per line
 */
export function reflow(text) {
	return text
		.replace(/\r\n?/g, '\n')
		.replace(/\f/g, '\n\n')
		.split(/\n[ \t]*\n+/)
		.map((block) =>
			block
				.split('\n')
				.map((l) => l.trim())
				.filter(Boolean)
				.join('\n')
				.replace(/([a-zà-ÿ])-\n([a-zà-ÿ])/g, '$1$2') // end-of-line hyphenation
				.replace(/\n/g, ' ')
				.replace(/[ \t]{2,}/g, ' ')
				.trim()
		)
		.filter((p) => p && !/^[\d\s.\-–—]+$/.test(p)) // bare page numbers and rules
		.map((p) => (/^(#{1,6}\s|>|[-+]\s|\d+[.)]\s)/.test(p) ? `\\${p}` : p))
		.join('\n');
}
