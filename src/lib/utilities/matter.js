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

/**
 * The front and back matter sections themselves, for the views that show them apart from the
 * text: each flagged top-level section with its title and everything inside it (sub-headers
 * included), in the order they appear.
 *
 * @template {{ id: string, text: string, level?: number, frontmatter?: boolean, backmatter?: boolean, title?: string }} P
 * @param {P[]} paragraphs
 * @returns {{ front: { id: string, title: string, paragraphs: P[] }[], back: { id: string, title: string, paragraphs: P[] }[] }}
 */
export function matterSections(paragraphs) {
	const front = /** @type {{ id: string, title: string, paragraphs: P[] }[]} */ ([]);
	const back = /** @type {{ id: string, title: string, paragraphs: P[] }[]} */ ([]);
	/** @type {{ id: string, title: string, paragraphs: P[] } | null} */
	let current = null;
	let hiding = 0;
	for (const p of paragraphs) {
		const level = p.level ?? 0;
		if (hiding && level > 0 && level <= hiding) {
			hiding = 0;
			current = null;
		}
		if (!hiding && level > 0 && (p.frontmatter || p.backmatter)) {
			hiding = level;
			current = { id: p.id, title: p.title || p.text.replace(/^#+\s*/, '').trim() || 'Untitled', paragraphs: [] };
			(p.frontmatter ? front : back).push(current);
		} else if (hiding && current) current.paragraphs.push(p);
	}
	return { front, back };
}
