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
