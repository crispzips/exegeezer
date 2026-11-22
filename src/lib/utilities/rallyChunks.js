import { isDefinition } from '#lib/utilities/renderMarkdown.js';

/**
 * Rally view's chunks: the text cut into the units that are paced out to the reader.
 *
 * @typedef {{ id: string, paraId: string, text: string, header: boolean }} Chunk
 *   `paraId` is the paragraph (or section header) the chunk comes from.
 */

/** words that end in a full stop without ending a sentence */
const ABBREVIATIONS = /(?:\b(?:Mr|Mrs|Ms|Dr|Prof|St|Sr|Jr|vs|etc|cf|ca|Fig|No|Vol|pp?|ch|ed|eds|trans|e\.g|i\.e)|\b[A-Z])\.$/;

/**
 * Split one paragraph into sentences: after . ! ? or … (and any closing quote or bracket),
 * before a capital, quote, bracket or digit; not after a known abbreviation or an initial.
 * @param {string} text
 * @returns {string[]}
 */
export function splitSentences(text) {
	const parts = text.split(/(?<=[.!?…]["'”’)\]*_]*)\s+(?=["'“‘(\[*_]*[A-Z0-9])/);
	/** @type {string[]} */
	const out = [];
	for (const part of parts) {
		if (out.length && ABBREVIATIONS.test(out[out.length - 1])) out[out.length - 1] += ` ${part}`;
		else out.push(part);
	}
	return out.map((s) => s.trim()).filter(Boolean);
}

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
 * @param {'sentence' | 'paragraph'} unit
 * @returns {Chunk[]}
 */
export function rallyChunks(paragraphs, unit) {
	/** @type {Chunk[]} */
	const chunks = [];
	for (const p of paragraphs) {
		if (isDefinition(p.text.trim())) continue;
		const text = scrub(p.text);
		if (!text) continue; // an image or a footnote mark on its own
		const header = (p.level ?? 0) > 0;
		const pieces = unit === 'sentence' && !header ? splitSentences(text) : [text];
		pieces.forEach((piece, i) => chunks.push({ id: `${p.id}:${i}`, paraId: p.id, text: piece, header }));
	}
	return chunks;
}

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
export const READ_WPM = [100, 150, 200, 260, 340, 450, 600];
export const WRITE_WPM = [8, 14, 20, 28, 38, 52, 70];
/** text size steps -> rem */
export const SIZES = [1.1, 1.3, 1.5, 1.75, 2, 2.375, 2.75, 3.25, 3.75];
/** writing styles, the default first: compose (new text, no source), copy (type the chunk as shown), recall (shown, hidden, typed from memory), dictate (shown once, written at your own pace) */
/** @type {('compose' | 'copy' | 'recall' | 'dictate')[]} */
export const STYLES = ['compose', 'copy', 'recall', 'dictate'];
/** compose: seconds for a sentence at each speed tick (a paragraph gets PARAGRAPH_FACTOR times as long) */
export const COMPOSE_SECONDS = [60, 40, 28, 20, 14, 10, 7];
export const PARAGRAPH_FACTOR = 5;
