/**
 * Turn a flat list of paragraphs into a tree of sections.
 *
 * A section is a data entity of its own: a header plus a one-dimensional array of
 * `children`, each of which is either a paragraph or another section. A section
 * ends at the next header of the same or a higher level (smaller number), so a
 * "##" section holds the "###" sections beneath it. Paragraphs before the first
 * header stay at the top level.
 *
 * @typedef {{ id: string, originalIndex: number, text: string, level?: number }} Paragraph
 * @typedef {{ kind: 'paragraph', paragraph: Paragraph }} ParagraphNode
 * @typedef {{ kind: 'section', id: string, level: number, title: string, header: Paragraph, children: SectionChild[] }} Section
 * @typedef {ParagraphNode | Section} SectionChild
 *
 * @param {Paragraph[]} paragraphs
 * @returns {SectionChild[]} the top-level nodes
 */
export function buildSections(paragraphs) {
	/** @type {SectionChild[]} */
	const root = [];
	/** @type {Section[]} open sections, outermost first */
	const stack = [];

	for (const paragraph of paragraphs) {
		const level = paragraph.level ?? 0;

		if (level > 0) {
			// close every open section that this header ends
			while (stack.length && stack[stack.length - 1].level >= level) stack.pop();
			/** @type {Section} */
			const section = {
				kind: 'section',
				id: paragraph.id,
				level,
				title: paragraph.text.replace(/^#{1,6}\s+/, ''),
				header: paragraph,
				children: []
			};
			(stack.length ? stack[stack.length - 1].children : root).push(section);
			stack.push(section);
		} else {
			(stack.length ? stack[stack.length - 1].children : root).push({ kind: 'paragraph', paragraph });
		}
	}
	return root;
}
