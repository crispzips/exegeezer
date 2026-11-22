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
/** ms to write a chunk back at a speed tick @param {string} text @param {number} speed */
export const writeMs = (text, speed) => Math.max(1500, (wordCount(text) / (WRITE_WPM[speed] ?? 20)) * 60000 + 1000);
/** ms to compose a new paragraph at a speed tick @param {number} speed */
export const composeMs = (speed) => (COMPOSE_SECONDS[speed] ?? 20) * 1000 * PARAGRAPH_FACTOR;

/** @param {string} text */
export const wordCount = (text) => text.trim().split(/\s+/).filter(Boolean).length;

/** Plain text for matching typed input: markdown marks dropped, whitespace and case flattened. @param {string} text */
export function plain(text) {
	return text
		.replace(/^#{1,6}\s+/, '')
		.replace(/!?\[([^\]]*)\]\([^)]*\)/g, '$1')
		.replace(/\[\^[^\]]*\]/g, '')
		.replace(/[*_`]/g, '')
		.replace(/\s+/g, ' ')
		.trim();
}

/** speed ticks (0 slowest) -> reading words per minute, and writing words per minute */
export const READ_WPM = [30, 50, 75, 100, 150, 200, 260, 340, 450, 600];
export const WRITE_WPM = [3, 5, 8, 11, 15, 20, 28, 38, 52, 70];
/** text size steps -> rem */
export const SIZES = [1.1, 1.3, 1.5, 1.75, 2, 2.375, 2.75, 3.25, 3.75];
/** writing styles, the default first: compose (new text, no source), copy (type the chunk as shown), recall (shown, hidden, typed from memory), dictate (shown once, written at your own pace) */
/** @type {('compose' | 'copy' | 'recall' | 'dictate')[]} */
export const STYLES = ['compose', 'copy', 'recall', 'dictate'];
/** compose: seconds for a sentence at each speed tick (a paragraph gets PARAGRAPH_FACTOR times as long, and rally is all paragraphs) */
export const COMPOSE_SECONDS = [180, 120, 90, 60, 40, 28, 20, 14, 10, 7];
export const PARAGRAPH_FACTOR = 5;
