// Solarized accent colours from the theme (src/app.css), in order
export const ACCENTS = ['yellow', 'orange', 'red', 'magenta', 'violet', 'blue', 'cyan', 'green'];

/**
 * Colour for a section: the top-level section's accent (cycling through the
 * theme's accents), darkened a step per level of nesting (mixed with black).
 * @param {number} topIndex which top-level section this belongs to
 * @param {number} depth 0 for the top level, 1 for its subsections, ...
 */
export function sectionColor(topIndex, depth) {
	const accent = ACCENTS[topIndex % ACCENTS.length];
	const keep = Math.max(30, 100 - depth * 22);
	return `color-mix(in srgb, var(--color-${accent}) ${keep}%, black)`;
}

/**
 * Colour for every section of a tree: top-level sections cycle the accents,
 * deeper ones darken (see `sectionColor`).
 * @param {import('#lib/utilities/buildSections.js').SectionChild[]} tree
 * @returns {Map<string, string>} section id -> colour
 */
export function colorSections(tree) {
	/** @type {Map<string, string>} */
	const map = new Map();
	let top = 0;
	/** @param {import('#lib/utilities/buildSections.js').SectionChild[]} list @param {number} topIdx @param {number} depth */
	function walk(list, topIdx, depth) {
		for (const node of list) {
			if (node.kind !== 'section') continue;
			const idx = depth === 0 ? top++ : topIdx;
			map.set(node.id, sectionColor(idx, depth));
			walk(node.children, idx, depth + 1);
		}
	}
	walk(tree, 0, 0);
	return map;
}
