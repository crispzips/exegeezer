/**
 * Editing helpers for the flat paragraph list (a header is a paragraph whose
 * `level` is 1-6). Each returns a new list with `originalIndex` renumbered.
 *
 * @typedef {{ id: string, originalIndex: number, text: string, level?: number }} Para
 */

import { buildSections } from '#lib/utilities/buildSections.js';

/**
 * Index just past the last paragraph that belongs to the section whose header is at
 * `i`: a section runs to the next header of the same or a shallower level.
 * @param {Para[]} list
 * @param {number} i
 */
function sectionEnd(list, i) {
	const level = list[i].level ?? 0;
	let end = i + 1;
	while (end < list.length && ((list[end].level ?? 0) === 0 || (list[end].level ?? 0) > level)) end++;
	return end;
}

/** @template {Para} T @param {T[]} list */
function renumber(list) {
	return list.map((p, i) => ({ ...p, originalIndex: i }));
}

/**
 * What deleting a section would take with it.
 * @param {Para[]} list
 * @param {string} id a section header's id
 * @returns {{ title: string, paragraphs: number, sections: number }} counts of the
 *   paragraphs and sub-sections inside the section (not counting the section itself)
 */
export function describeSection(list, id) {
	const i = list.findIndex((p) => p.id === id);
	if (i === -1) return { title: '', paragraphs: 0, sections: 0 };
	const inside = list.slice(i + 1, sectionEnd(list, i));
	return {
		title: list[i].text.replace(/^#{1,6}\s+/, ''),
		paragraphs: inside.filter((p) => (p.level ?? 0) === 0).length,
		sections: inside.filter((p) => (p.level ?? 0) > 0).length
	};
}

/**
 * Delete one paragraph (or a lone header).
 * @template {Para} T
 * @param {T[]} list
 * @param {string} id
 */
export function removeParagraph(list, id) {
	return renumber(list.filter((p) => p.id !== id));
}

/**
 * Delete a section. `withDescendants` true removes the header and everything in it. False removes
 * only the header and hands its contents to the section above: the next sibling above it (same level)
 * takes the section's paragraphs (placed before that sibling's own subsections, so they stay its
 * direct content) and its subsections (which follow the sibling's). With no sibling above (it is the
 * first in its parent), the contents stay in place and fall under the parent.
 * @template {Para} T
 * @param {T[]} list
 * @param {string} id
 * @param {boolean} withDescendants
 */
export function removeSection(list, id, withDescendants) {
	const i = list.findIndex((p) => p.id === id);
	if (i === -1) return list;
	const end = sectionEnd(list, i);
	if (withDescendants) return renumber([...list.slice(0, i), ...list.slice(end)]);
	const level = list[i].level ?? 0;
	// the sibling above: the nearest header before it at its own level, with nothing shallower in between
	let j = i - 1;
	while (j >= 0 && ((list[j].level ?? 0) === 0 || (list[j].level ?? 0) > level)) j--;
	if (j < 0 || (list[j].level ?? 0) !== level) return renumber([...list.slice(0, i), ...list.slice(i + 1)]);
	// the section's own paragraphs (before its first subsection) go before the sibling's first subsection
	let k = i + 1;
	while (k < end && (list[k].level ?? 0) === 0) k++;
	let m = j + 1;
	while (m < i && (list[m].level ?? 0) === 0) m++;
	return renumber([...list.slice(0, m), ...list.slice(i + 1, k), ...list.slice(m, i), ...list.slice(k, end), ...list.slice(end)]);
}

/**
 * The indices an item (a paragraph or a section header) currently has.
 * A section has its own `sectionIndex` and `hierarchicalIndex`; a paragraph reports
 * those of the section it sits in (null when it is above the first header) plus its
 * own `paragraphIndex`.
 * @param {Para[]} list
 * @param {string} id
 * @returns {{ kind: 'paragraph' | 'section', title: string | null, originalIndex: number,
 *   paragraphIndex: number | null, sectionIndex: number | null, hierarchicalIndex: string | null } | null}
 */
export function indexInfo(list, id) {
	const originalIndex = list.findIndex((p) => p.id === id);
	if (originalIndex === -1) return null;
	/** @type {ReturnType<typeof indexInfo>} */
	let found = null;
	/** @param {import('#lib/utilities/buildSections.js').SectionChild[]} nodes @param {import('#lib/utilities/buildSections.js').Section | null} parent */
	(function walk(nodes, parent) {
		for (const n of nodes) {
			if (n.kind === 'section') {
				if (n.id === id) {
					found = { kind: 'section', title: n.title, originalIndex, paragraphIndex: null, sectionIndex: n.sectionIndex, hierarchicalIndex: n.hierarchicalIndex };
				}
				walk(n.children, n);
			} else if (n.paragraph.id === id) {
				found = {
					kind: 'paragraph',
					title: null,
					originalIndex,
					paragraphIndex: n.paragraphIndex,
					sectionIndex: parent?.sectionIndex ?? null,
					hierarchicalIndex: parent?.hierarchicalIndex ?? null
				};
			}
		}
	})(buildSections(list), null);
	return found;
}

/**
 * Move an item so that it sits at position `to` of the resulting list. A section
 * moves together with everything inside it.
 * @template {Para} T
 * @param {T[]} list
 * @param {string} id
 * @param {number} to position in the list after the move (clamped)
 */
export function moveItem(list, id, to) {
	const i = list.findIndex((p) => p.id === id);
	if (i === -1) return list;
	const end = (list[i].level ?? 0) > 0 ? sectionEnd(list, i) : i + 1;
	const block = list.slice(i, end);
	const rest = [...list.slice(0, i), ...list.slice(end)];
	const at = Math.max(0, Math.min(to, rest.length));
	return renumber([...rest.slice(0, at), ...block, ...rest.slice(at)]);
}

/**
 * How many positions an item can be moved to (the length of the list without it,
 * plus one for the end).
 * @param {Para[]} list
 * @param {string} id
 */
export function positionCount(list, id) {
	const i = list.findIndex((p) => p.id === id);
	if (i === -1) return 0;
	const end = (list[i].level ?? 0) > 0 ? sectionEnd(list, i) : i + 1;
	return list.length - (end - i) + 1;
}

/**
 * Find the position to move an item to so that one of its indices becomes `value`.
 * When several positions would do, the one closest to `from` wins (the smallest move).
 * @param {Para[]} list
 * @param {string} id
 * @param {'originalIndex' | 'paragraphIndex' | 'sectionIndex' | 'hierarchicalIndex'} field
 * @param {string} value
 * @param {number} from the item's current position in the draft
 * @returns {number | null} null when no position gives that value
 */
export function findPosition(list, id, field, value, from) {
	const count = positionCount(list, id);
	if (field === 'originalIndex') {
		const n = Number(value);
		return Number.isInteger(n) && n >= 0 && n < count ? n : null;
	}
	/** @type {number | null} */
	let best = null;
	for (let p = 0; p < count; p++) {
		if (best !== null && Math.abs(p - from) >= Math.abs(best - from) && p > from) break;
		const info = indexInfo(moveItem(list, id, p), id);
		if (info && String(info[field]) === value.trim() && (best === null || Math.abs(p - from) < Math.abs(best - from))) best = p;
	}
	return best;
}

/**
 * Give a section a new title (its Markdown "#" prefix is kept).
 * @template {Para} T
 * @param {T[]} list
 * @param {string} id
 * @param {string} title
 */
export function renameSection(list, id, title) {
	return list.map((p) => (p.id === id ? { ...p, text: `${'#'.repeat(p.level ?? 1)} ${title.trim()}` } : p));
}

// ---- Drag and drop ----

/**
 * Index just past the item at `i` together with everything that moves with it
 * (a section brings its whole contents; a paragraph is alone).
 * @param {Para[]} list
 * @param {number} i
 */
function blockEnd(list, i) {
	return (list[i].level ?? 0) > 0 ? sectionEnd(list, i) : i + 1;
}

/**
 * Where a dropped item lands, relative to the target. `before`/`after` put it in the gap
 * next to the target; `merge-before`/`merge-after` merge it into the target (prepend /
 * append). In the linear view (`flat`) every row is one paragraph, so the gap after a
 * header row is right under it; in the hierarchical view the gap after a section bubble
 * is after everything inside it.
 * @typedef {'before' | 'after' | 'merge-before' | 'merge-after'} DropPlace
 */

/**
 * The gap (an index into the list: "before list[gap]") that `before`/`after` the target means.
 * @param {Para[]} list
 * @param {number} j target index
 * @param {'before' | 'after'} side
 * @param {boolean} flat
 */
function gapOf(list, j, side, flat) {
	return side === 'before' ? j : flat ? j + 1 : blockEnd(list, j);
}

/**
 * Whether dropping `id` at `place` of `targetId` would do anything legal: not onto itself
 * or into its own contents, not a no-op move, and merges only between two paragraphs or
 * two sections.
 * @param {Para[]} list
 * @param {string} id
 * @param {string} targetId
 * @param {DropPlace} place
 * @param {boolean} flat
 */
export function dropAllowed(list, id, targetId, place, flat) {
	const i = list.findIndex((p) => p.id === id);
	const j = list.findIndex((p) => p.id === targetId);
	if (i === -1 || j === -1 || i === j) return false;
	const end = blockEnd(list, i);
	if (j > i && j < end) return false; // the target is inside what is being dragged
	if (place === 'merge-before' || place === 'merge-after') return (list[i].level ?? 0) > 0 === (list[j].level ?? 0) > 0;
	const gap = gapOf(list, j, place, flat);
	return !(gap >= i && gap <= end);
}

/**
 * Move an item (a section with its contents) into a gap, or merge it into another item.
 * Merging two paragraphs joins their text into the target. Merging two sections moves the
 * dragged section's contents into the target (its sub-sections shifted to nest under it)
 * and drops the dragged section's own header: prepend puts them at the start of the
 * target, append at its end.
 * @template {Para} T
 * @param {T[]} list
 * @param {{ id: string, targetId: string, place: DropPlace }} drop
 * @param {boolean} flat see {@link DropPlace}
 * @returns {T[]}
 */
export function applyDrop(list, { id, targetId, place }, flat) {
	if (!dropAllowed(list, id, targetId, place, flat)) return list;
	const i = list.findIndex((p) => p.id === id);
	const j = list.findIndex((p) => p.id === targetId);
	const end = blockEnd(list, i);

	if (place === 'before' || place === 'after') {
		const gap = gapOf(list, j, place, flat);
		const block = list.slice(i, end);
		const rest = [...list.slice(0, i), ...list.slice(end)];
		const at = gap > end ? gap - (end - i) : gap;
		return renumber([...rest.slice(0, at), ...block, ...rest.slice(at)]);
	}

	const prepend = place === 'merge-before';
	const dragged = list[i];
	const target = list[j];

	if ((dragged.level ?? 0) === 0) {
		const text = prepend ? `${dragged.text} ${target.text}` : `${target.text} ${dragged.text}`;
		return renumber(list.filter((p) => p.id !== id).map((p) => (p.id === targetId ? { ...p, text } : p)));
	}

	const delta = (target.level ?? 1) - (dragged.level ?? 1);
	const contents = list.slice(i + 1, end).map((p) => {
		const lv = p.level ?? 0;
		if (lv === 0) return p;
		const level = Math.max(1, Math.min(6, lv + delta));
		return { ...p, level, text: p.text.replace(/^#{1,6}/, '#'.repeat(level)) };
	});
	const rest = [...list.slice(0, i), ...list.slice(end)];
	const t = list.findIndex((p) => p.id === targetId) > i ? j - (end - i) : j;
	const at = prepend ? t + 1 : sectionEnd(rest, t);
	return renumber([...rest.slice(0, at), ...contents, ...rest.slice(at)]);
}

/**
 * The index (into the list) of the gap that `before`/`after` an item means, for injecting.
 * @param {Para[]} list
 * @param {string} targetId
 * @param {'before' | 'after'} place
 * @param {boolean} flat true in the linear view (see {@link DropPlace})
 * @returns {number} -1 when the target is not in the list
 */
export function gapIndex(list, targetId, place, flat) {
	const j = list.findIndex((p) => p.id === targetId);
	return j === -1 ? -1 : gapOf(list, j, place, flat);
}

/**
 * How many paragraphs are dangling: not inside any section (before the first header, or in a text with
 * no headers at all). Paragraphs have to be inside sections, so an edit must never raise this number.
 * @param {Para[]} list
 */
export function danglingCount(list) {
	let n = 0;
	for (const p of list) {
		if ((p.level ?? 0) > 0) break;
		n++;
	}
	return n;
}

/**
 * Insert items at a gap.
 * @template {Para} T
 * @param {T[]} list
 * @param {number} gap
 * @param {T[]} items
 */
export function insertAt(list, gap, items) {
	return renumber([...list.slice(0, gap), ...items, ...list.slice(gap)]);
}
