/**
 * Where each comment goes in a view.
 *
 * A comment is about one or more paragraphs. When those are exactly the paragraphs of a section (its own and its
 * subsections'), the comment belongs to the section and sits by its header or bubble; otherwise it sits by the first
 * paragraph it is about.
 *
 * @typedef {{ id: string, commentaryId: string, authors: string[], body: string, createdAt: string, paragraphIds: string[], editable?: boolean, public?: boolean, markable?: boolean }} Comment
 * @typedef {Comment & { anchorId: string, targetIds: string[], scope: string }} AnchoredComment
 */

/**
 * Whether a click on a paragraph is one to comment with: not on a link, button or footnote mark inside it, and not the
 * end of a drag that selected some of its words.
 * @param {Event} e
 */
export const isCommentClick = (e) =>
	!(e.target instanceof Element && e.target.closest('a, button, .footnote-ref')) && window.getSelection()?.type !== 'Range';

/**
 * Every section of a text with the ids of the paragraphs in it, in document order (so a section comes before the ones inside it).
 * @param {{ id: string, level?: number }[]} items
 * @returns {{ id: string, paragraphIds: string[] }[]}
 */
export function sectionParagraphs(items) {
	/** @type {{ id: string, paragraphIds: string[] }[]} */
	const out = [];
	/** @type {{ level: number, section: { id: string, paragraphIds: string[] } }[]} */
	const open = [];
	for (const item of items) {
		const level = item.level ?? 0;
		if (level > 0) {
			while (open.length && open[open.length - 1].level >= level) open.pop();
			const section = { id: item.id, paragraphIds: /** @type {string[]} */ ([]) };
			out.push(section);
			open.push({ level, section });
		} else for (const o of open) o.section.paragraphIds.push(item.id);
	}
	return out;
}

/**
 * The comments that have somewhere to go in `items`, in the order of the places they go (oldest first at each).
 * @param {Comment[]} comments
 * @param {{ id: string, level?: number }[]} items the text as the view shows it
 * @returns {AnchoredComment[]}
 */
export function anchorComments(comments, items) {
	const order = new Map(items.map((item, i) => [item.id, i]));
	const at = (/** @type {string} */ id) => order.get(id) ?? 0;
	const sections = sectionParagraphs(items);
	return comments
		.flatMap((c) => {
			const targetIds = c.paragraphIds.filter((id) => order.has(id)).sort((a, b) => at(a) - at(b));
			if (!targetIds.length) return [];
			const wanted = new Set(targetIds);
			const section =
				targetIds.length > 1
					? sections.find((s) => s.paragraphIds.length === wanted.size && s.paragraphIds.every((id) => wanted.has(id)))
					: undefined;
			const scope = section ? 'whole section' : targetIds.length > 1 ? `${targetIds.length} paragraphs` : '';
			return [{ ...c, targetIds, anchorId: section?.id ?? targetIds[0], scope }];
		})
		.sort((a, b) => at(a.anchorId) - at(b.anchorId) || a.createdAt.localeCompare(b.createdAt));
}
