/**
 * Front and back matter: top-level sections flagged `frontmatter` / `backmatter` on import
 * (a title page, a bibliography, appendices...). They stay in the text, but the views, their
 * minimaps and the map leave them out, so they take no part in anything that compares
 * sections with one another (colours, sizes, percentages, numbering).
 *
 * A flagged header hides everything up to the next header of the same or a higher level.
 *
 * @template {{ level?: number, frontmatter?: boolean, backmatter?: boolean }} P
 * @param {P[]} paragraphs
 * @returns {P[]}
 */
export function withoutMatter(paragraphs) {
	if (!paragraphs.some((p) => (p.level ?? 0) > 0 && (p.frontmatter || p.backmatter))) return paragraphs;
	/** @type {P[]} */
	const out = [];
	/** level of the flagged section being skipped, or 0 */
	let hiding = 0;
	for (const p of paragraphs) {
		const level = p.level ?? 0;
		if (hiding && level > 0 && level <= hiding) hiding = 0;
		if (hiding) continue;
		if (level > 0 && (p.frontmatter || p.backmatter)) {
			hiding = level;
			continue;
		}
		out.push(p);
	}
	return out;
}
