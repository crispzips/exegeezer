/**
 * Reading mode can set a paragraph's first sentence apart (larger, on its own line, highlighted).
 * Chosen with the on/off toggle in the text appearance menu (`EmphasisToggle.svelte`); on by default. Shared by every view.
 */
export const emphasis = $state({ first: true });

/** Flip the setting. */
export function toggleEmphasis() {
	emphasis.first = !emphasis.first;
}
