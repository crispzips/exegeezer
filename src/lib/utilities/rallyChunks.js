import { isDefinition } from '#lib/utilities/renderMarkdown.js';

/**
 * Rally view's chunks: the text's paragraphs (and section headers), each one a chunk, paced out to the reader.
 *
 * @typedef {{ id: string, paraId: string, text: string, header: boolean }} Chunk
 *   `paraId` is the paragraph (or section header) the chunk is.
 */

/**
 * The text as rally shows it: footnote marks (`[^1]`, `^[inline]`) and images (`![alt](src)`,
 * `![alt][ref]`, `<img>`) are removed.
 * @param {string} text
 */
export function scrub(text) {
	return text
		.replace(/!\[[^\]]*\](?:\([^)]*\)|\[[^\]]*\])/g, '')
		.replace(/<img\b[^>]*>/gi, '')
		.replace(/\[\^[^\]]*\]/g, '')
		.replace(/\^\[[^\]]*\]/g, '')
		.replace(/[ \t]{2,}/g, ' ')
		.replace(/\s+([.,;:!?])/g, '$1')
		.trim();
}

/**
 * @param {{ id: string, text: string, level?: number }[]} paragraphs
 * @returns {Chunk[]}
 */
export function rallyChunks(paragraphs) {
	/** @type {Chunk[]} */
	const chunks = [];
	for (const p of paragraphs) {
		if (isDefinition(p.text.trim())) continue;
		const text = scrub(p.text);
		if (!text || /^#{1,6}$/.test(text)) continue; // an image or a footnote mark on its own, an empty paragraph, or a section with no title yet
		chunks.push({ id: p.id, paraId: p.id, text, header: (p.level ?? 0) > 0 });
	}
	return chunks;
}

/** ms to read a chunk at a speed tick, with a beat to start @param {string} text @param {number} speed */
export const readMs = (text, speed) => Math.max(1200, (wordCount(text) / (READ_WPM[speed] ?? 200)) * 60000 + 500);

/** ms to compose a new paragraph at a speed tick @param {number} speed */
export const composeMs = (speed) => (COMPOSE_SECONDS[speed] ?? 20) * 1000 * PARAGRAPH_FACTOR;

/** @param {string} text */
export const wordCount = (text) => text.trim().split(/\s+/).filter(Boolean).length;

/** speed ticks (0 slowest) -> reading words per minute */
export const READ_WPM = [30, 50, 75, 100, 150, 200, 260, 340, 450, 600];
/** text size steps -> rem */
export const SIZES = [0.95, 1.1, 1.3, 1.5, 1.75, 2];
/** the size step a rally starts at (2rem) */
export const DEFAULT_SIZE = SIZES.length - 1;

/** writing: seconds for a sentence at each speed tick (a paragraph gets PARAGRAPH_FACTOR times as long) */
export const COMPOSE_SECONDS = [180, 120, 90, 60, 40, 28, 20, 14, 10, 7];
export const PARAGRAPH_FACTOR = 5;

/** the writing rally's accent colour (a theme colour name) */
export const WRITING_COLOUR = 'violet';
