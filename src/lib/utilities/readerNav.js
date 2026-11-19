/**
 * Keyboard navigation through the reader views. The cursor rests on a "stop": a paragraph,
 * a section, or (in editing mode only, `gaps`) an interstice: the space between two neighbours,
 * or the edge of a row. An interstice is named by the item it sits beside and the `place`: the
 * space between A and B is "before B", the edge after the last item is "after" it. Arrowing off
 * the end of a row moves on to the next stop of the same type in the next row.
 *
 * @typedef {{ type: 'paragraph' | 'section' | 'gap', id: string, axis?: 'x' | 'y', place?: 'before' | 'after' }} Stop
 * @typedef {import('#lib/utilities/buildSections.js').SectionChild} SectionChild
 * @typedef {{ depth: number, parentId: string | null, path: string[], nodes: SectionChild[] }} NavRow
 */

/** @param {SectionChild} n */
const idOf = (n) => (n.kind === 'section' ? n.id : n.paragraph.id);

/** @param {Stop} a @param {Stop} b */
const same = (a, b) => a.id === b.id && a.type === b.type && a.place === b.place;

/**
 * The stops along one row of the hierarchical view: its items, with a gap between each pair of
 * neighbours and at both edges (when `gaps`). The front-matter paragraphs (before the first section) are stacked vertically, so
 * the gaps between them run along the y axis; every other gap runs along x.
 * @param {SectionChild[]} nodes
 * @param {boolean} gaps
 * @returns {Stop[]}
 */
export function rowStops(nodes, gaps) {
	const firstSection = nodes.findIndex((n) => n.kind === 'section');
	const front = firstSection === -1 ? 0 : firstSection;
	/** @type {Stop[]} */
	const out = [];
	nodes.forEach((n, i) => {
		if (gaps && (i > 0 || nodes.length)) out.push({ type: 'gap', id: idOf(n), place: 'before', axis: i < front ? 'y' : 'x' });
		out.push({ type: n.kind, id: idOf(n) });
	});
	if (gaps && nodes.length) out.push({ type: 'gap', id: idOf(nodes[nodes.length - 1]), place: 'after', axis: 'x' });
	return out;
}

/**
 * Every row the hierarchical view can show, in document order: the top-level row, then (for
 * each section, depth first) the row holding its children. `path` lists the sections to open
 * (outermost first) for the row to be on screen.
 * @param {SectionChild[]} tree
 * @returns {NavRow[]}
 */
export function allRows(tree) {
	/** @type {NavRow[]} */
	const rows = [{ depth: 0, parentId: null, path: [], nodes: tree }];
	/** @param {SectionChild[]} nodes @param {string[]} path @param {number} depth */
	function walk(nodes, path, depth) {
		for (const n of nodes) {
			if (n.kind !== 'section') continue;
			const p = [...path, n.id];
			rows.push({ depth: depth + 1, parentId: n.id, path: p, nodes: n.children });
			walk(n.children, p, depth + 1);
		}
	}
	walk(tree, [], 0);
	return rows;
}

/** @param {NavRow[]} rows @param {string} id the row that holds this item (or gap) */
const rowOf = (rows, id) => rows.findIndex((r) => r.nodes.some((n) => idOf(n) === id));

/**
 * Left (-1) or right (+1) along a row. Off the end of the row, on to the first (or last) stop of
 * the same type in the nearest row of the same depth in that direction; nowhere when there is none.
 * @param {NavRow[]} rows
 * @param {Stop} cur
 * @param {-1 | 1} dir
 * @param {boolean} gaps
 * @returns {{ row: NavRow, stop: Stop } | null}
 */
export function moveAlong(rows, cur, dir, gaps) {
	const r = rowOf(rows, cur.id);
	if (r === -1) return null;
	const stops = rowStops(rows[r].nodes, gaps);
	const i = stops.findIndex((s) => same(s, cur));
	if (i === -1) return null;
	if (stops[i + dir]) return { row: rows[r], stop: stops[i + dir] };
	return crossRows(rows, r, cur.type, dir, gaps);
}

/**
 * Off the end of row `r`: the first (or last) stop of `type` in the nearest row of the same depth.
 * @param {NavRow[]} rows
 * @param {number} r
 * @param {Stop['type']} type
 * @param {-1 | 1} dir
 * @param {boolean} gaps
 * @returns {{ row: NavRow, stop: Stop } | null}
 */
function crossRows(rows, r, type, dir, gaps) {
	for (let k = r + dir; k >= 0 && k < rows.length; k += dir) {
		if (rows[k].depth !== rows[r].depth) continue;
		const alike = rowStops(rows[k].nodes, gaps).filter((s) => s.type === type);
		if (alike.length) return { row: rows[k], stop: dir > 0 ? alike[0] : alike[alike.length - 1] };
	}
	return null;
}

/**
 * Left (-1) or right (+1) as the arrow keys mean it: like {@link moveAlong}, except that the
 * front-matter paragraphs, which are stacked in one column, count as a single bubble. Leaving the
 * stack goes to the next bubble in the row (or, off the row's end, to the next row), never to the
 * next paragraph in the stack.
 * @param {NavRow[]} rows
 * @param {Stop} cur
 * @param {-1 | 1} dir
 * @param {boolean} gaps
 * @returns {{ row: NavRow, stop: Stop } | null}
 */
export function moveOut(rows, cur, dir, gaps) {
	const r = rowOf(rows, cur.id);
	if (r === -1) return null;
	const nodes = rows[r].nodes;
	const firstSection = nodes.findIndex((n) => n.kind === 'section');
	const stackIds = new Set(nodes.slice(0, firstSection === -1 ? 0 : firstSection).map(idOf));
	if (!stackIds.has(cur.id)) return moveAlong(rows, cur, dir, gaps);
	const stops = rowStops(nodes, gaps);
	const inStack = (/** @type {Stop} */ s) => stackIds.has(s.id);
	if (dir > 0) {
		const after = stops[stops.map(inStack).lastIndexOf(true) + 1];
		return after ? { row: rows[r], stop: after } : null;
	}
	return crossRows(rows, r, cur.type, dir, gaps);
}

/**
 * Up (-1): to the section container that holds the current row. Down (+1): from an open
 * section into the first item of its row.
 * @param {NavRow[]} rows
 * @param {Stop} cur
 * @param {-1 | 1} dir
 * @param {string[]} open ids of the sections that are open
 * @returns {{ row: NavRow, stop: Stop } | null}
 */
export function moveAcross(rows, cur, dir, open) {
	const r = rowOf(rows, cur.id);
	if (r === -1) return null;
	if (dir < 0) {
		const parentId = rows[r].parentId;
		if (!parentId) return null;
		const pr = rowOf(rows, parentId);
		return pr === -1 ? null : { row: rows[pr], stop: { type: 'section', id: parentId } };
	}
	if (cur.type !== 'section' || !open.includes(cur.id)) return null;
	const child = rows.find((row) => row.parentId === cur.id);
	const first = child && rowStops(child.nodes, false).find((s) => s.type !== 'gap');
	return child && first ? { row: child, stop: first } : null;
}

/**
 * The stops of the linear view: every paragraph or header, with a gap between each pair and at
 * both ends (when `gaps`).
 * @param {{ id: string, level?: number }[]} paragraphs
 * @param {boolean} gaps
 * @returns {Stop[]}
 */
export function linearStops(paragraphs, gaps) {
	/** @type {Stop[]} */
	const out = [];
	paragraphs.forEach((p, i) => {
		if (gaps) out.push({ type: 'gap', id: p.id, place: 'before', axis: 'y' });
		out.push({ type: (p.level ?? 0) > 0 ? 'section' : 'paragraph', id: p.id });
	});
	if (gaps && paragraphs.length) out.push({ type: 'gap', id: paragraphs[paragraphs.length - 1].id, place: 'after', axis: 'y' });
	return out;
}

/**
 * One stop up (-1) or down (+1) the linear view.
 * @param {Stop[]} stops
 * @param {Stop} cur
 * @param {-1 | 1} dir
 * @returns {Stop | null}
 */
export function moveLinear(stops, cur, dir) {
	const i = stops.findIndex((s) => same(s, cur));
	return i === -1 ? null : (stops[i + dir] ?? null);
}

/**
 * The topmost (then leftmost) of the elements that is on screen: not scrolled out of, or clipped
 * by, any scrolling ancestor up to `root`. Used to start keyboard navigation from what the
 * reader is looking at.
 * @param {HTMLElement[]} els
 * @param {HTMLElement} root
 * @returns {HTMLElement | null}
 */
export function topmostInView(els, root) {
	/** @param {HTMLElement} el */
	function visible(el) {
		const r = el.getBoundingClientRect();
		if (r.width === 0 && r.height === 0) return false;
		for (let a = el.parentElement; a; a = a.parentElement) {
			const { overflowX, overflowY } = getComputedStyle(a);
			if (overflowX !== 'visible' || overflowY !== 'visible') {
				const b = a.getBoundingClientRect();
				if (r.bottom <= b.top || r.top >= b.bottom || r.right <= b.left || r.left >= b.right) return false;
			}
			if (a === root) break;
		}
		const b = root.getBoundingClientRect();
		return r.bottom > b.top && r.top < b.bottom && r.right > b.left && r.left < b.right;
	}
	/** @type {HTMLElement | null} */
	let best = null;
	let bestRect = null;
	for (const el of els) {
		if (!visible(el)) continue;
		const r = el.getBoundingClientRect();
		if (!bestRect || r.top < bestRect.top - 1 || (Math.abs(r.top - bestRect.top) <= 1 && r.left < bestRect.left)) {
			best = el;
			bestRect = r;
		}
	}
	return best;
}
