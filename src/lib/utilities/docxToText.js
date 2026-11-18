/**
 * Read a Word (.docx) file and return plain text, one paragraph per line, with
 * headings written as Markdown ("# Title", "## Part", "### Section") so the rest
 * of the app can treat them like any other hierarchical document.
 *
 * Runs in the browser only (mammoth is loaded on demand).
 *
 * @param {File} file
 * @returns {Promise<string>}
 */
export async function docxToText(file) {
	const mammoth = await import('mammoth/mammoth.browser');
	const { value: html } = await mammoth.convertToHtml({ arrayBuffer: await file.arrayBuffer() });
	const doc = new DOMParser().parseFromString(html, 'text/html');

	/** @type {string[]} */
	const lines = [];

	/** @param {Element} el */
	function visit(el) {
		const tag = el.tagName.toLowerCase();
		const text = (el.textContent ?? '').replace(/\s+/g, ' ').trim();

		const heading = /^h([1-6])$/.exec(tag);
		if (heading) {
			if (text) lines.push(`${'#'.repeat(Number(heading[1]))} ${text}`);
		} else if (tag === 'ul' || tag === 'ol') {
			for (const li of el.querySelectorAll(':scope > li')) visit(li);
		} else if (tag === 'table') {
			for (const row of el.querySelectorAll('tr')) {
				const rowText = Array.from(row.querySelectorAll('th, td'))
					.map((c) => (c.textContent ?? '').replace(/\s+/g, ' ').trim())
					.filter(Boolean)
					.join(' | ');
				if (rowText) lines.push(rowText);
			}
		} else if (text) {
			lines.push(text);
		}
	}

	for (const child of Array.from(doc.body.children)) visit(child);
	return lines.join('\n');
}
