<script>
	import { tick, untrack } from 'svelte';
	import { LayersDownRight, Undo, Redo } from '@boxicons/svelte';
	import { buildSections } from '#lib/utilities/buildSections.js';
	import { colorSections, MATTER_COLOR } from '#lib/utilities/sectionColor.js';
	import MinimapTooltip from '#lib/components/MinimapTooltip.svelte';
	import { tip as hint } from '#lib/utilities/menuTip.svelte.js';

	/**
	 * The map: a modal showing the architecture of the whole text as a family tree
	 * running left to right. Every section is a coloured bubble (the same colours as
	 * the minimaps), sized by how much text sits directly in it, and thin gray curves
	 * link each section to its parent. The curves are cubic Béziers whose tangents
	 * leave and enter level, which smooths each link into an S; a parent sits at the
	 * midpoint of its children, as in a family tree.
	 *
	 * Drag to pan, scroll to zoom (the map opens fitted to the whole tree). Hovering a bubble shows
	 * its name preceded by its ancestors'; clicking it calls `onnavigate` with the
	 * section and its ancestors' ids (outermost first) and closes the map.
	 *
	 * Back matter: top-level sections flagged `backmatter` (a bibliography, appendices...),
	 * and everything inside them, are marginalised: they are left out of the size
	 * comparison and drawn at the row's minimum size, and they are left out of the
	 * percentages (which are shares of the text without them) and show none of their own.
	 *
	 * In writing mode (`writing`) the map also shows the paragraphs. A run of paragraphs in a section starts as a
	 * stack (the layers icon); a double click on a stack spreads it into its paragraphs, and a double click on
	 * one of those gathers them again. A paragraph with no neighbours is not stacked. A single click on a stack or a
	 * paragraph shows it in the preview bubble beside the map, linked to it by two thin lines (like a detail
	 * inset on a map); a stack shows as a carousel of its paragraphs. The text is set in 12 pt, and the bubble scrolls
	 * when a paragraph is longer. A single click on a section shows all the paragraphs in it (the subsections' too) in the bubble, as a carousel, and does not leave the map.
	 *
	 * With `onmove` (editing), a paragraph or a stack can be picked up and dragged. Unspreading a stack only changes the
	 * map (the preview bubble still carries all its paragraphs as a carousel). While something is dragged the open
	 * section stays open until the item is over a different top-level section, which opens in its place; dropping on a section calls `onmove` with the paragraphs'
	 * ids and the section (sections can be chosen several at a time too, but not together with paragraphs): they are always appended to it, never prepended. Between two bubbles (a violet line shows where) is a gap:
	 * dropped there they land between them instead. Shift-click and cmd/ctrl-click choose several paragraphs and stacks to carry
	 * at once. A section bubble can be dragged too: onto a section it is joined to the end of it, into a gap it moves there.
	 *
	 * In writing mode only one top-level section is open at a time, the first until another is chosen:
	 * the others are drawn closed. A click on a closed top-level section opens it (and closes the open one) and shows it in the bubble.
	 *
	 * In `mode="matter"` the map is not a modal but a column of the Load Text modal, where front and
	 * back matter are chosen beside the preview of the text. It shows only the top-level row, without
	 * any children. A switch says which kind a click marks; clicking a section marks it (or unmarks it,
	 * or moves it from the other kind) and calls `onchoose` at once with both lists of section ids, so
	 * the text's flags, the sizes and the percentages follow (back matter shrinks). The marks shown are
	 * the paragraphs' own flags. Hovering a section calls `onhover` with its id (null on leaving).
	 *
	 * @type {{
	 *   open: boolean,
	 *   title?: string,
	 *   paragraphs: { id: string, originalIndex: number, text: string, level?: number, frontmatter?: boolean, backmatter?: boolean }[],
	 *   onnavigate?: (ids: string[]) => void,
	 *   mode?: 'navigate' | 'matter',
	 *   writing?: boolean,
	 *   onchoose?: (choice: { front: string[], back: string[] }) => void,
	 *   onhover?: (id: string | null) => void,
	 *   onmove?: (move: { kind: 'paragraphs' | 'section', ids: string[], into?: string, before?: string, after?: string, parentId?: string | null }) => void,
	 *   onmatter?: (change: { id: string, kind: 'front' | 'back' | null }) => void,
	 *   onundo?: () => void,
	 *   onredo?: () => void,
	 *   canundo?: boolean,
	 *   canredo?: boolean
	 * }}
	 */
	let { open = $bindable(false), title = '', paragraphs, onnavigate, mode = 'navigate', writing = false, onchoose, onhover, onmove, onmatter, onundo, onredo, canundo = false, canredo = false } = $props();
	const picking = $derived(mode === 'matter');
	/** the writing-mode map: paragraphs and stacks as well as sections, with the preview bubble */
	const full = $derived(writing && !picking);

	// ---- Paragraphs (writing mode) ----
	/** the stacks spread out into their paragraphs (by stack key) */
	/** @type {Set<string>} */
	let expanded = $state(new Set());
	/** the colour each paragraph had when the map was opened (its section's): a paragraph that is moved keeps it until the map is closed, as the move is not saved until then */
	/** @type {Map<string, string>} */
	let leafColors = new Map();
	/** the same for sections: a section that is moved keeps its colour (and so do its contents) until the map is closed */
	/** @type {Map<string, string>} */
	let sectionColors = new Map();
	/** the colour of front and back matter, whichever section it was */
	const MATTER = MATTER_COLOR;
	/** @param {string | null | undefined} id a section @returns {string | undefined} */
	const sectionFill = (id) => sectionColors.get(id ?? '') ?? colors.get(id ?? '');
	/** @param {{ kind: string, items: { id: string }[], ids: string[], aside: boolean }} n a paragraph or stack @returns {string} */
	const leafColor = (n) => n.aside ? MATTER : leafColors.get(n.items[0].id) ?? sectionFill(n.ids[n.ids.length - 1]) ?? 'var(--color-taupe3)';
	/** the key of the stack or paragraph shown in the preview bubble */
	/** @type {string | null} */
	let selected = $state(null);
	/** the top-level section that is open (the others are shown closed): the first, until another is chosen */
	/** @type {string | null} */
	let openTop = $state(null);
	/** which paragraph of a stack the carousel shows */
	let slide = $state(0);
	/** what is being dragged: the paragraphs (or the one section) it is made of, where the pointer is (in the stage) and started from (on the screen), and whether it has really started (moved a few px) */
	/** @type {{ node: MapNode, kind: 'paragraphs' | 'section', ids: string[], count: number, stack: boolean, sectionId: string | null, sectionIds: string[], x: number, y: number, sx: number, sy: number, started: boolean } | null} */
	let carry = $state(null);
	/** the key of the section the carried item is over */
	/** @type {string | null} */
	let target = $state(null);
	/** the gap the carried item is over, as the line drawn there and where in the text it is */
	/** @type {{ x: number, y0: number, y1: number, before?: string, after?: string, parentId: string | null } | null} */
	let gapAt = $state(null);
	/** the paragraphs and stacks chosen with shift or cmd/ctrl clicks (by key), and where a shift range starts */
	/** @type {Set<string>} */
	let picked = $state(new Set());
	/** @type {string | null} */
	let anchor = null;
	/** whether the anchor was left chosen (or just plainly clicked) rather than dropped: only then does shift reach from it */
	let anchorLive = false;
	/** a drag has just ended: the click that follows it is not a click */
	let dragEnded = false;
	const dragging = $derived(!!carry?.started);

	/** the root's label: the text's title, or a placeholder when it has none */
	let rootTitle = $derived(title.trim() && title.trim() !== 'Untitled' ? title.trim() : 'Unnamed text');

	// Geometry (px, before zoom)
	const LEVEL_H = $derived(full ? 110 : 130); // distance between levels (room for labels beneath the bubbles)
	const SLOT_P = $derived(full ? 46 : 56); // paragraphs and stacks sit close together
	const SLOT_W = $derived(full ? 84 : 56); // (writing mode draws everything larger, to fill the room it has)
	const SLOT_W_TOP = $derived(full ? 170 : 2 * 56 + 30); // with only the top-level row shown, the largest bubbles must not touch
	const R_MIN = $derived(full ? 8 : 5); // radius of the smallest bubble in a row of subsections
	const R_MIN_TOP = $derived(full ? 16 : 14); // the same for the top-level sections, which are drawn larger
	const CURVE = 0.7; // below 1 lifts mid-size bubbles so one huge section does not flatten its row
	const PCT_PX = (8 * 4) / 3; // 8 pt, kept the same on screen however far the map is zoomed
	const R_MAX = $derived(full ? 36 : 24); // radius of the largest bubble in a row of subsections
	const R_MAX_TOP = $derived(full ? 66 : 56); // the same for the top-level sections
	const MAX_ZOOM = 6;

	/** @type {HTMLDialogElement | undefined} */
	let dialogEl = $state();

	// ---- Front and back matter choice (mode "matter") ----
	/** which kind a click marks */
	/** @type {'front' | 'back'} */
	let step = $state('front');

	$effect(() => {
		if (!picking && open && dialogEl && !dialogEl.open) dialogEl.showModal();
	});

	let tree = $derived(buildSections(paragraphs));
	let colors = $derived(colorSections(tree));
	$effect(() => {
		if (!open) return;
		untrack(() => {
			leafColors = new Map();
			sectionColors = new Map(colors);
			/** @param {import('#lib/utilities/buildSections.js').SectionChild[]} list @param {string | undefined} color */
			const walk = (list, color) => {
				for (const c of list) {
					if (c.kind === 'paragraph') {
						if (color) leafColors.set(c.paragraph.id, color);
					} else walk(c.children, colors.get(c.id));
				}
			};
			walk(tree, undefined);
		});
	});

	const R_P_MIN = $derived(full ? 6 : 4); // radius of the smallest paragraph
	const R_P_MAX = $derived(full ? 16 : 11); // radius of the largest
	const R_STACK = $derived(full ? 19 : 13); // radius of a stack

	/**
	 * @typedef {{ kind: 'section' | 'paragraph' | 'stack', key: string, items: { id: string, text: string }[], group: string | null, id: string | null, title: string, depth: number, x: number, y: number, r: number, trail: string[], ids: string[], own: number, size: number, frontmatter: boolean, backmatter: boolean, aside: boolean, open?: boolean, lowGroup?: number, rowTop?: number }} MapNode
	 */

	/** The tree laid out: nodes, and the links between a node and its parent. */
	let graph = $derived.by(() => {
		/** @type {MapNode[]} */
		const nodes = [];
		/** @type {{ from: MapNode, to: MapNode }[]} */
		const links = [];
		/** all the text there is, headers included: what the percentages are shares of */
		const total = Math.max(1, paragraphs.reduce((n, p) => n + p.text.length, 0));
		/** where the next leaf goes along its row (map units): each takes the width of its own slot */
		let cursor = 0;
		/** @param {number} w the slot's width @returns {number} the centre of the slot */
		const take = (w) => {
			const x = cursor + w / 2;
			cursor += w;
			return x;
		};
		/** the sections that are lowered below their siblings to make room for what is spread beneath them */
		/** @type {{ node: MapNode, parent: MapNode, nodes: MapNode[] }[]} */
		const groups = [];
		/** writing mode: the one top-level section that is open */
		const openSec = full ? (tree.find((t) => t.kind === 'section' && t.id === openTop) ?? tree.find((t) => t.kind === 'section' && !t.header.frontmatter && !t.header.backmatter) ) : undefined;
		/** whether the open section is lowered: there are closed ones to make room beneath */
		const lowerMode = !!openSec && tree.some((t) => t !== openSec);

		/**
		 * @param {import('#lib/utilities/buildSections.js').Section} sec
		 * @param {number} depth
		 * @param {MapNode} parent
		 */
		/** every paragraph in a section, the subsections' included, in the order of the text
		 * @param {import('#lib/utilities/buildSections.js').Section} x @returns {{ id: string, text: string }[]} */
		const collect = (x) => x.children.flatMap((c) => (c.kind === 'paragraph' ? [c.paragraph] : collect(c)));

		/** whether a section has a stack of its own spread out into its paragraphs
		 * @param {import('#lib/utilities/buildSections.js').Section} x */
		const hasSpread = (x) => {
			let i = 0;
			while (i < x.children.length) {
				if (x.children[i].kind !== 'paragraph') {
					i++;
					continue;
				}
				const first = /** @type {any} */ (x.children[i]).paragraph.id;
				let n = 0;
				while (i < x.children.length && x.children[i].kind === 'paragraph') (i++, n++);
				if (n > 1 && expanded.has(`stack:${first}`)) return true;
			}
			return false;
		};

		/** roughly the room something takes along its row once laid out (map units): the slots of its subsections and,
		 * in writing mode, its paragraphs; a section with nothing inside takes one slot
		 * @param {import('#lib/utilities/buildSections.js').SectionChild} x @param {number} [depth] @returns {number} */
		const widthOf = (x, depth = 2) => {
			if (x.kind === 'paragraph') return full ? SLOT_P : 0;
			const inner = x.children.reduce((n, c) => n + widthOf(c, depth + 1), 0);
			return Math.max(inner, depth === 1 ? SLOT_W_TOP : SLOT_W);
		};

		/**
		 * @param {import('#lib/utilities/buildSections.js').Section} sec
		 * @param {number} depth
		 * @param {MapNode} parent
		 * @param {import('#lib/utilities/buildSections.js').SectionChild[]} siblings everything in the row it belongs to
		 */
		function place(sec, depth, parent, siblings) {
			const own = sec.children.reduce((n, c) => n + (c.kind === 'paragraph' ? c.paragraph.text.length : 0), 0);
			// the whole section's text, descendants included (what its percentage is of)
			/** @param {import('#lib/utilities/buildSections.js').Section} x @returns {number} */
			const whole = (x) => x.header.text.length + x.children.reduce((n, c) => n + (c.kind === 'paragraph' ? c.paragraph.text.length : whole(c)), 0);
			// in writing mode only one top-level section is open at a time: the others are drawn without what is inside them
			const closed = full && depth === 1 && sec !== openSec;
			/** @type {MapNode} */
			const node = {
				kind: /** @type {const} */ ('section'),
				key: sec.id,
				items: full ? collect(sec) : [],
				group: null,
				id: sec.id,
				title: sec.title,
				depth,
				x: 0,
				y: depth * LEVEL_H,
				r: depth === 1 ? R_MIN_TOP : R_MIN,
				own,
				size: 0,
				frontmatter: depth === 1 && sec.header.frontmatter === true,
				// back matter and everything inside it is marginalised
				backmatter: parent.backmatter || (depth === 1 && sec.header.backmatter === true),
				// front and back matter, and everything inside it, are set aside: yellow, at the smallest size, and out of every share
				aside: parent.aside || (depth === 1 && (sec.header.backmatter === true || sec.header.frontmatter === true)),
				trail: [...parent.trail, sec.title],
				ids: [...parent.ids, sec.id]
			};
			node.size = whole(sec);
			node.open = !closed;
			nodes.push(node);
			links.push({ from: parent, to: node });
			// A section with room to make is lowered below its siblings: the open top-level section, or a section whose stack is spread
			// out into paragraphs. It keeps its place in the row and hangs below it; its contents are laid out in their own space
			// and set beneath the siblings, spreading to the right of the section when it is the first, to the left when it is the
			// last, and both ways in between (the further along the text, the further to the left they spread)
			if (!picking && !closed && siblings.length > 1 && (depth === 1 ? lowerMode && sec === openSec : full && hasSpread(sec))) {
				const slot = take(depth === 1 ? SLOT_W_TOP : SLOT_W);
				const keep = cursor;
				cursor = 0;
				const from = nodes.length;
				const kidXs = placeKids(sec.children, depth + 1, node);
				cursor = keep;
				if (kidXs.length > 0) {
					const lo = Math.min(...kidXs);
					const hi = Math.max(...kidXs);
					// it spreads towards the side with more room: the less of the row (its siblings' contents
					// included) lies on that side, the more of the spread goes that way
					const at = siblings.indexOf(sec);
					const before = siblings.slice(0, at).reduce((n, t) => n + widthOf(t), 0);
					const after = siblings.slice(at + 1).reduce((n, t) => n + widthOf(t), 0);
					const f = before + after > 0 ? after / (before + after) : 0.5;
					const shift = slot - f * (hi - lo) - lo;
					for (const n of nodes.slice(from)) n.x += shift;
				}
				node.x = slot;
				groups.push({ node, parent, nodes: nodes.slice(from - 1) });
				return node;
			}
			const start = cursor;
			const from = nodes.length;
			const xs = picking || closed ? [] : placeKids(sec.children, depth + 1, node);
			if (xs.length === 0) node.x = take(picking || (lowerMode && depth === 1) ? SLOT_W_TOP : SLOT_W);
			else {
				node.x = (xs[0] + xs[xs.length - 1]) / 2;
				if (full) {
					// the section's own bubble needs room too, however narrow what is beneath it: make it, to the right
					const w = depth === 1 ? SLOT_W_TOP : SLOT_W;
					const over = start - (node.x - w / 2);
					if (over > 0) {
						for (const n of nodes.slice(from)) n.x += over;
						node.x += over;
						cursor += over;
					}
					cursor = Math.max(cursor, node.x + w / 2);
				}
			}
			return node;
		}

		/**
		 * Place what is inside a section (or at the top): its subsections and, in writing mode, its paragraphs.
		 * A run of paragraphs is one stack, unless it is a single paragraph or has been spread out.
		 * @param {import('#lib/utilities/buildSections.js').SectionChild[]} kids
		 * @param {number} depth
		 * @param {MapNode} parent
		 * @returns {number[]} the columns of what was placed, left to right
		 */
		function placeKids(kids, depth, parent) {
			/** @type {number[]} */
			const xs = [];
			let i = 0;
			while (i < kids.length) {
				const c = kids[i];
				if (c.kind === 'section') {
					xs.push(place(c, depth, parent, kids).x);
					i++;
					continue;
				}
				if (!full) {
					i++;
					continue;
				}
				/** @type {{ id: string, text: string }[]} */
				const run = [];
				while (i < kids.length && kids[i].kind === 'paragraph') run.push(/** @type {any} */ (kids[i++]).paragraph);
				const stackKey = `stack:${run[0].id}`;
				const spread = run.length === 1 || expanded.has(stackKey);
				for (const item of spread ? run.map((p) => [p]) : [run]) {
					const single = item.length === 1;
					/** @type {MapNode} */
					const leaf = {
						kind: single ? 'paragraph' : 'stack',
						key: single ? item[0].id : stackKey,
						items: item,
						group: single && run.length > 1 ? stackKey : null,
						id: null,
						title: '',
						depth,
						x: take(SLOT_P),
						y: depth * LEVEL_H,
						r: single ? R_P_MIN : R_STACK,
						own: 0,
						size: item.reduce((n, p) => n + p.text.length, 0),
						frontmatter: false,
						backmatter: parent.backmatter,
						aside: parent.aside,
						trail: [...parent.trail, single ? 'Paragraph' : `${item.length} paragraphs`],
						ids: parent.ids
					};
					nodes.push(leaf);
					links.push({ from: parent, to: leaf });
					xs.push(leaf.x);
				}
			}
			return xs;
		}

		/** @type {MapNode} */
		const root = { kind: /** @type {const} */ ('section'), key: '', items: [], group: null, id: null, title: rootTitle, depth: 0, x: 0, y: 0, r: 8, trail: [], ids: [], own: 0, size: 0, frontmatter: false, backmatter: false, aside: false };
		const xs = placeKids(tree, 1, root);
		if (xs.length > 0) root.x = (xs[0] + xs[xs.length - 1]) / 2;
		// (the innermost lowered group a node is in names its row for the labels)
		groups.forEach((g, i) => {
			for (const n of g.nodes) if (!n.lowGroup) n.lowGroup = i + 1;
		});
		const heads = new Set(groups.map((g) => g.node));
		// Size each bubble against the others in its row: the radius grows with the text
		// in the section (as a power of its share of the row's largest, see CURVE), from the row's minimum (none) to its maximum (the row's largest); top-level rows are larger.
		// Back matter is left out of the sums and drawn at the minimum size.
		// in writing mode a bubble's size is its share of all the text (what its percentage says), the contents of its subsections
		// included, so it follows paragraphs as they are moved; otherwise it is the text directly in the section
		if (full) for (const n of nodes) if (n.kind === 'section') n.own = n.size;
		/** @type {Map<number, number>} */
		const rowMax = new Map();
		for (const n of nodes) if (n.kind === 'section' && !n.aside) rowMax.set(n.depth, Math.max(rowMax.get(n.depth) ?? 0, n.own));
		for (const n of nodes) if (n.aside) n.own = 0;
		// a paragraph's radius grows with its length, against the longest paragraph
		const longest = Math.max(1, ...nodes.filter((n) => n.kind === 'paragraph').map((n) => n.size));
		for (const n of nodes) if (n.kind === 'paragraph') n.r = n.aside ? R_P_MIN : R_P_MIN + (R_P_MAX - R_P_MIN) * Math.pow(n.size / longest, CURVE);
		for (const n of nodes) {
			if (n.kind !== 'section') continue;
			const [lo, hi] = n.depth === 1 ? [R_MIN_TOP, R_MAX_TOP] : [R_MIN, R_MAX];
			n.r = lo + (hi - lo) * Math.pow(n.own / (rowMax.get(n.depth) || 1), CURVE);
		}
		// the top-level bubbles hang from one line: their bottoms (and so their labels) are level
		const row1 = nodes.filter((n) => n.depth === 1 && !heads.has(n));
		const topR = Math.max(0, ...row1.map((n) => n.r));
		for (const n of row1) n.y += topR - n.r;
		// Each lowered section drops until its middle is on the line of the largest of its siblings' bottoms: half of it is within
		// the band of its siblings' row (in its own column, clear of their bubbles), half below, with its contents beneath it,
		// a little lower still so the section's label has room.
		for (const g of groups) {
			const sibs = links.filter((l) => l.from === g.parent && l.to !== g.node).map((l) => l.to);
			const drop = Math.max(0, ...sibs.map((n) => n.r));
			for (const [i, n] of g.nodes.entries()) n.y += drop + (i > 0 ? 30 : 0);
		}
		// where the link to a lowered section must already have reached its own column: the top of the row it hangs below
		for (const g of groups) {
			const sibs = links.filter((l) => l.from === g.parent && l.to !== g.node).map((l) => l.to);
			g.node.rowTop = Math.min(Infinity, ...sibs.map((n) => n.y - n.r));
		}
		// percentages are shares of the text without the back matter
		const margin = nodes.filter((n) => n.kind === 'section' && n.depth === 1 && n.aside).reduce((n, x) => n + x.size, 0);
		const counted = Math.max(1, total - margin);
		root.size = counted;
		return { total: counted, root, nodes, links, empty: nodes.length === 0 };
	});

	/** A smooth link: leaves the parent heading down and enters the child heading down (a vertical S). */
	/** @param {MapNode} a @param {MapNode} b */
	function curve(a, b) {
		if (b.rowTop !== undefined && isFinite(b.rowTop)) {
			// To the lowered open section: one smooth cubic, not an S ending in a straight drop. Both control points lie high (within
			// the room above the closed row), so the curve swings across into the section's own column early, while it is still
			// above the closed sections, and then falls past them in a long gentle run to the section.
			const room = Math.max(b.rowTop - a.y, 20);
			return `M${a.x},${a.y} C${a.x},${a.y + room * 0.3} ${b.x},${a.y + room * 0.55} ${b.x},${b.y}`;
		}
		const mid = (a.y + b.y) / 2;
		return `M${a.x},${a.y} C${a.x},${mid} ${b.x},${mid} ${b.x},${b.y}`;
	}

	/** A bubble's share of all the text, as a percentage label . */
	/** @param {number} size @param {number} total */
	function percent(size, total) {
		const v = (size / total) * 100;
		return v >= 9.95 ? `${Math.round(v)}` : v >= 0.05 ? v.toFixed(1) : '<0.1';
	}

	/**
	 * Whether a percentage label fits inside a bubble at the current zoom: the text, at its
	 * fixed on-screen size, may just fill the bubble's width (and no more than its height).
	 * @param {string} label @param {number} r the bubble's radius, in map units
	 */
	function fits(label, r) {
		const side = 2 * r * view.k;
		return Math.max(label.length * PCT_PX * 0.58, PCT_PX) <= side;
	}

	/** @param {string} s */
	const clip = (s) => (s.length > 26 ? s.slice(0, 25) + '…' : s);

	// ---- Pan and zoom ----
	let box = $state({ w: 0, h: 0 });
	let view = $state({ x: 0, y: 0, k: 1 });

	/** @type {HTMLDivElement | undefined} */
	let stage = $state();

	/** Scale and centre the whole tree in the stage. */
	/**
	 * Forced perspective, as in the hierarchical view: a bubble's drop shadow falls away from
	 * the vertical centre line of the map pane, further the further the bubble is from it.
	 * Sizes are divided by the zoom so the shadow keeps the same size on screen.
	 * @param {number} x the bubble's centre, in map units
	 */
	const SHADOW_SPREAD = 4; // sideways offset (px) at the edge of the pane
	/** @param {number} x @param {string} [color] @param {number} [dy] @param {number} [blur] */
	function shadow(x, color = 'var(--color-taupe4)', dy = 2, blur = 1.5) {
		const t = Math.max(-1, Math.min(1, (view.x + x * view.k - box.w / 2) / ((box.w || 1) / 2)));
		const u = 1 / view.k;
		return `drop-shadow(${(t * SHADOW_SPREAD * u).toFixed(2)}px ${(dy * u).toFixed(2)}px ${(blur * u).toFixed(2)}px ${color})`;
	}

	// Labels are taupe5 with a taupe0 drop shadow that falls away from the centre line like the
	// bubbles' shadows. They keep one size on screen however far the map is zoomed, and a label
	// is cut short (or left out) rather than run into its neighbour's.
	const LABEL_PX = 11;
	const LABEL_PX_TOP = 13;
	/** @param {number} x */
	const labelShadow = (x) => shadow(x, 'var(--color-taupe0)', 1.5, 0.5);
	/** room (px on screen) beside each bubble before the next one on its level */
	/** @param {MapNode} n the row a node is in: its depth, apart from the lowered open section's */
	const rowKey = (n) => `${n.depth}:${n.lowGroup ?? ''}`;
	let labelRoom = $derived.by(() => {
		/** @type {Map<string, number[]>} */
		const rows = new Map();
		for (const n of graph.nodes) rows.set(rowKey(n), [...(rows.get(rowKey(n)) ?? []), n.x]);
		for (const xs of rows.values()) xs.sort((a, b) => a - b);
		return new Map(
			graph.nodes.map((n) => {
				const xs = rows.get(rowKey(n)) ?? [];
				const i = xs.indexOf(n.x);
				const gap = Math.min(i > 0 ? n.x - xs[i - 1] : Infinity, i < xs.length - 1 ? xs[i + 1] - n.x : Infinity);
				return [n, gap * view.k];
			})
		);
	});
	const LABEL_LINES = 5; // the import map's top-level labels run to this many rows
	const LABEL_LINES_NAV = 1; // the main map's are clipped to a single row
	const LABEL_LEADING = 1.2;
	/**
	 * A top-level label wrapped to the room it has: up to five rows in the import map (one in the main map), the last ending in an ellipsis
	 * when the title does not fit. Words are kept whole where they can be.
	 * @param {{ title: string }} n
	 * @returns {string[]} the rows (none when there is no room for even a few letters)
	 */
	function labelLines(n) {
		const room = Math.min(labelRoom.get(/** @type {any} */ (n)) ?? Infinity, 220) - 2;
		const per = Math.floor(room / (LABEL_PX_TOP * 0.52));
		if (per < 3) return [];
		/** @type {string[]} */
		const lines = [];
		let line = '';
		for (let word of n.title.split(/\s+/).filter(Boolean)) {
			while (word.length > per) {
				// a word longer than a row is broken
				if (line) {
					lines.push(line);
					line = '';
				}
				lines.push(word.slice(0, per));
				word = word.slice(per);
			}
			if (!line) line = word;
			else if (line.length + 1 + word.length <= per) line += ' ' + word;
			else {
				lines.push(line);
				line = word;
			}
		}
		if (line) lines.push(line);
		const max = picking ? LABEL_LINES : LABEL_LINES_NAV;
		if (lines.length <= max) return lines;
		const kept = lines.slice(0, max);
		const last = kept[max - 1];
		kept[max - 1] = (last.length >= per ? last.slice(0, per - 1) : last) + '…';
		return kept;
	}


	function fit() {
		if (!box.w || !box.h || graph.empty || carry?.started) return; // (the map holds still under a carried item)
		const pad = 60;
		// room each top-level bubble's label needs to either side of it (screen px): the title on one row (at most 220 px), or the matter caption
		/** @param {MapNode} n */
		const labelHalf = (n) => (n.kind === 'section' && n.depth <= 1 ? Math.max(Math.min(220, n.title.length * LABEL_PX_TOP * 0.52), n.frontmatter || n.backmatter ? 70 : 0) / 2 : 0);
		// the outermost edges of the bubbles and their labels, with a little room beyond; a label's width is on screen, so the zoom and the extent are found together
		const minY = -50; // room for the root's label
		// room beneath the deepest bubbles: for the labels of sections, but little below paragraphs and stacks (they have none)
		const maxY = Math.max(...graph.nodes.map((n) => n.y + (n.kind === 'section' ? 150 : n.r + 24)));
		const kTall = (box.h - pad) / (maxY - minY);
		let k = Math.min(1.5, kTall);
		let minX = 0;
		let maxX = 0;
		for (let pass = 0; pass < 5; pass++) {
			minX = Math.min(graph.root.x - graph.root.r, ...graph.nodes.map((n) => n.x - Math.max(n.r, labelHalf(n) / k))) - 10;
			maxX = Math.max(graph.root.x + graph.root.r, ...graph.nodes.map((n) => n.x + Math.max(n.r, labelHalf(n) / k))) + 10;
			k = Math.min((box.w - 8) / (maxX - minX), 1.5, kTall);
		}
		view = { k, x: (box.w - (maxX - minX) * k) / 2 - minX * k, y: (box.h - (maxY - minY) * k) / 2 - minY * k };
	}

	// Fit whenever the map opens (or its text or size changes)
	// (the sections only: spreading a stack out does not reset the zoom)
	let layoutKey = $derived(`${full}|` + graph.nodes.filter((n) => n.kind === 'section').map((n) => n.key).join('|'));
	$effect(() => {
		void layoutKey; // (not the sizes, so marking back matter does not reset the zoom)
		void box.w;
		void box.h;
		if (open || picking) tick().then(fit);
	});

	/** @param {number} cx @param {number} cy @param {number} factor */
	function zoomAt(cx, cy, factor) {
		const k = Math.min(Math.max(view.k * factor, 0.05), MAX_ZOOM);
		const f = k / view.k;
		view = { k, x: cx - (cx - view.x) * f, y: cy - (cy - view.y) * f };
	}

	/** wheel zoom about the pointer (a non-passive listener, so the page behind does not scroll) */
	/** @param {HTMLElement} node */
	function wheelZoom(node) {
		/** @param {WheelEvent} e */
		const onWheel = (e) => {
			e.preventDefault();
			const r = node.getBoundingClientRect();
			zoomAt(e.clientX - r.left, e.clientY - r.top, Math.exp(-e.deltaY * 0.0015));
		};
		node.addEventListener('wheel', onWheel, { passive: false });
		return { destroy: () => node.removeEventListener('wheel', onWheel) };
	}

	/** @type {{ x: number, y: number, vx: number, vy: number, moved: boolean } | null} */
	let drag = null;

	/** @param {PointerEvent} e */
	function down(e) {
		if (e.button !== 0) return;
		drag = { x: e.clientX, y: e.clientY, vx: view.x, vy: view.y, moved: false };
	}

	/** @type {MapNode | null} */
	let hover = $state(null);
	$effect(() => {
		if (picking) onhover?.(hover?.id ?? null);
	});
	let tip = $state({ x: 0, y: 0 });
	/** the bubble whose name is shown: the one hovered or, with an item in tow, the section it is over */
	let tipNode = $derived(dragging ? (graph.nodes.find((n) => n.key === target) ?? null) : hover);

	/** @param {PointerEvent} e */
	function move(e) {
		if (stage) {
			const r = stage.getBoundingClientRect();
			tip = { x: e.clientX - r.left, y: e.clientY - r.top };
		}
		if (!drag) return;
		const dx = e.clientX - drag.x;
		const dy = e.clientY - drag.y;
		if (!drag.moved && Math.hypot(dx, dy) < 4) return;
		drag.moved = true;
		stage?.setPointerCapture(e.pointerId); // from here on the drag keeps tracking outside the stage
		view = { ...view, x: drag.vx + dx, y: drag.vy + dy };
	}

	function up() {
		drag = null;
	}

	/** @param {PointerEvent} e @param {MapNode} n a section, paragraph or stack: pick it up (it only starts to move after a few px, so a click still works) */
	function grab(e, n) {
		if (e.button !== 0 || !onmove || !full || !stage || e.shiftKey || e.metaKey || e.ctrlKey) return;
		if (n.kind === 'section' && !n.id) return;
		e.stopPropagation(); // not a pan
		const r = stage.getBoundingClientRect();
		// a picked bubble takes every other picked one with it (in the order of the text)
		const group = picked.has(n.key) ? graph.nodes.filter((m) => picked.has(m.key)) : [n];
		const ids = n.kind === 'section' ? group.map((m) => /** @type {string} */ (m.id)) : group.flatMap((m) => m.items.map((p) => p.id));
		carry = { node: n, kind: n.kind === 'section' ? 'section' : 'paragraphs', ids, count: group.length, stack: n.kind === 'stack', sectionId: n.kind === 'section' ? n.id : null, sectionIds: n.kind === 'section' ? ids : [], x: e.clientX - r.left, y: e.clientY - r.top, sx: e.clientX, sy: e.clientY, started: false };
		window.addEventListener('pointermove', carryMove);
		window.addEventListener('pointerup', carryEnd);
		window.addEventListener('pointercancel', carryEnd);
	}

	/**
	 * The gap under the pointer, if any: between two neighbours in a row (a section's contents), or before the first or after the last.
	 * @param {number} mx @param {number} my the pointer, in map units
	 */
	function gapUnder(mx, my) {
		if (!carry) return null;
		/** @type {Map<string, MapNode[]>} */
		const kids = new Map();
		for (const l of graph.links) kids.set(l.from.key, [...(kids.get(l.from.key) ?? []), l.to]);
		const k = view.k;
		for (const [pk, row] of kids) {
			const parent = pk === '' ? graph.root : graph.nodes.find((n) => n.key === pk);
			if (!parent) continue;
			if (carry.sectionIds.some((id) => parent.ids.includes(id))) continue; // not into itself
			const parentId = parent.id;
			// the neighbours' edges, with an edge's own slot at either end
			for (let i = 0; i <= row.length; i++) {
				const a = row[i - 1];
				const b = row[i];
				// a section lands among sections: not in front of a paragraph (the paragraphs after it would become its own)
				if (carry.kind === 'section' && b && b.kind !== 'section') continue;
				if (b?.id && carry.sectionIds.includes(b.id)) continue;
				const left = a ? a.x + a.r : b.x - b.r - 16;
				const right = b ? b.x - b.r : a.x + a.r + 16;
				const gx = (left + right) / 2;
				const hw = Math.max(right - left, 0) / 2 + 4 / k;
				const y = ((a ?? b).y + (b ?? a).y) / 2;
				if (a && b && Math.abs(a.y - b.y) > 40) continue;
				const h = Math.max(a?.r ?? 0, b?.r ?? 0) + 4 / k;
				if (Math.abs(mx - gx) > hw || Math.abs(my - y) > h) continue;
				const first = b ? (b.kind === 'section' ? b.id : b.items[0].id) : null;
				const last = a ? (a.kind === 'section' ? a.id : a.items[a.items.length - 1].id) : null;
				if (!first && !last) continue;
				return { x: gx, y0: y - h, y1: y + h, ...(first ? { before: first } : { after: /** @type {string} */ (last) }), parentId };
			}
		}
		return null;
	}

	/** @param {PointerEvent} e */
	function carryMove(e) {
		if (!carry || !stage) return;
		const r = stage.getBoundingClientRect();
		const x = e.clientX - r.left;
		const y = e.clientY - r.top;
		const started = carry.started || Math.hypot(e.clientX - carry.sx, e.clientY - carry.sy) >= 4;
		carry = { ...carry, x, y, started };
		if (!started) return;
		hover = null;
		const mx = (x - view.x) / view.k;
		const my = (y - view.y) / view.k;
		const slack = 8 / view.k;
		/** @param {number} extra the section under the pointer (nearest if several), this far beyond its edge counting too
		 * @returns {MapNode | undefined} */
		const sectionAt = (extra) => {
			let best = Infinity;
			/** @type {MapNode | undefined} */
			let found;
			for (const n of graph.nodes) {
				if (n.kind !== 'section') continue;
				if (carry?.sectionIds.some((id) => n.ids.includes(id))) continue; // not onto itself or what is inside it
				const d = Math.max(Math.abs(mx - n.x), Math.abs(my - n.y));
				if (d <= n.r + extra && d < best) (best = d, (found = n));
			}
			return found;
		};
		// over a bubble is onto it; between bubbles is a gap; just beside a bubble is onto it again
		const strict = sectionAt(0);
		const gap = strict ? null : gapUnder(mx, my);
		const over = strict ?? (gap ? undefined : sectionAt(slack));
		target = over?.key ?? null;
		gapAt = gap;
		// the open section stays open until the carried item is over a different top-level section: that one opens instead
		if (over && over.depth === 1 && !over.open && over.id) openTop = over.id;
	}

	/** @param {PointerEvent} e */
	function carryEnd(e) {
		window.removeEventListener('pointermove', carryMove);
		window.removeEventListener('pointerup', carryEnd);
		window.removeEventListener('pointercancel', carryEnd);
		const c = carry;
		const up = e.type === 'pointerup';
		const to = target && up ? graph.nodes.find((n) => n.key === target) : undefined;
		const gap = up ? gapAt : null;
		carry = null;
		target = null;
		gapAt = null;
		if (!c?.started) return;
		dragEnded = true;
		setTimeout(() => (dragEnded = false));
		if (to?.id || gap) {
			if (to?.id) onmove?.({ kind: c.kind, ids: c.ids, into: to.id });
			else if (gap) onmove?.({ kind: c.kind, ids: c.ids, before: gap.before, after: gap.after, parentId: gap.parentId });
			// the top-level section it went to opens to show it there
			if (to) openTop = to.ids[0] ?? openTop;
			picked = new Set();
			selected = null;
		} else {
			// let go over nothing: the section it came from opens again, with what was dragged in focus
			const n = c.node;
			openTop = n.ids[0] ?? openTop;
			const g = n.kind === 'paragraph' ? n.group : null;
			if (g) {
				select(g);
				slide = Math.max(0, graph.nodes.filter((m) => m.group === g).findIndex((m) => m.key === n.key));
			} else select(n.key);
		}
	}

	/** A click on a bubble that was not the end of a drag goes to that section (or, when choosing front or back matter, selects it). */
	/** @param {MapNode} node @param {MouseEvent} [e] */
	function pick(node, e) {
		if (drag?.moved || dragEnded) return;
		if (full && onmove && e && (e.shiftKey || e.metaKey || e.ctrlKey) && (node.kind !== 'section' || node.id)) {
			window.getSelection()?.removeAllRanges(); // (shift-clicking must not leave a stretch of the page selected)
			// several at once: cmd/ctrl adds or drops one, shift takes everything from the last one chosen up to this (in its own row), when that one is still chosen: otherwise it adds just this one
			// (sections and paragraphs are not carried together: choosing the other kind starts afresh)
			const same = (/** @type {MapNode} */ m) => (m.kind === 'section') === (node.kind === 'section');
			const next = new Set([...picked].filter((k) => { const m = graph.nodes.find((x) => x.key === k); return !m || same(m); }));
			if (e.shiftKey && anchor && anchorLive) {
				const row = graph.nodes.filter((m) => same(m) && m.depth === node.depth && m.ids.slice(0, node.kind === 'section' ? -1 : undefined).join() === node.ids.slice(0, node.kind === 'section' ? -1 : undefined).join());
				const a = row.findIndex((m) => m.key === anchor);
				const b = row.findIndex((m) => m.key === node.key);
				if (a !== -1 && b !== -1) for (const m of row.slice(Math.min(a, b), Math.max(a, b) + 1)) next.add(m.key);
				else next.add(node.key);
			} else if (next.has(node.key) && !e.shiftKey) next.delete(node.key);
			else next.add(node.key);
			picked = next;
			anchor = node.key;
			anchorLive = next.has(node.key);
			return;
		}
		if (picked.size) picked = new Set();
		anchor = node.key;
		anchorLive = true;
		if (full && node.kind === 'paragraph' && node.group) {
			// a paragraph of a spread-out stack: the preview still carries the whole stack, at this paragraph
			select(node.group);
			slide = Math.max(0, graph.nodes.filter((m) => m.group === node.group).findIndex((m) => m.key === node.key));
			return;
		}
		if (full || node.kind !== 'section') {
			// writing mode: a click shows what the section, stack or paragraph holds in the preview bubble; on a closed top-level
			// section it also opens it, closing the one that was open
			if (full && node.kind === 'section' && node.depth === 1 && !node.open && node.id) openTop = node.id;
			select(node.key);
			return;
		}
		if (!node.id) return;
		if (picking) {
			const tops = graph.nodes.filter((n) => n.depth === 1);
			const front = tops.filter((n) => n.frontmatter && n.id !== node.id).map((n) => /** @type {string} */ (n.id));
			const back = tops.filter((n) => n.backmatter && n.id !== node.id).map((n) => /** @type {string} */ (n.id));
			// marking a section that is already of this kind clears it; otherwise it becomes this kind (leaving the other)
			if (!(step === 'front' ? node.frontmatter : node.backmatter)) (step === 'front' ? front : back).push(node.id);
			onchoose?.({ front, back });
			return;
		}
		dialogEl?.close();
		onnavigate?.(node.ids);
	}

	/** Show a stack or paragraph in the preview bubble. @param {string | null} key */
	function select(key) {
		if (key !== selected) slide = 0;
		selected = key;
	}

	/** A double click spreads a stack into its paragraphs, or gathers a paragraph back into its stack@param {MapNode} n */
	function toggle(n) {
		if (n.kind === 'stack') {
			expanded = new Set([...expanded, n.key]);
			anchor = n.items[0].id; // (a shift-click then reaches from its first paragraph)
			anchorLive = true;
			select(n.key); // (the preview keeps showing the whole stack: spreading it out only changes the map)
			// once the map has been laid out again, bring all the paragraphs into view
			const keys = n.items.map((p) => p.id);
			tick().then(() => reveal(keys));
		} else if (n.kind === 'paragraph' && n.group) {
			const next = new Set(expanded);
			next.delete(n.group);
			expanded = next;
			select(n.group);
		}
	}

	/**
	 * Move the map (and, if they cannot all fit at this zoom, zoom it out) so that the given bubbles are all in view.
	 * @param {string[]} keys the bubbles' keys
	 */
	function reveal(keys) {
		const ns = graph.nodes.filter((n) => keys.includes(n.key));
		if (!ns.length || !box.w || !box.h) return;
		const m = 28; // room to keep around them
		const x0 = Math.min(...ns.map((n) => n.x - n.r));
		const x1 = Math.max(...ns.map((n) => n.x + n.r));
		const y0 = Math.min(...ns.map((n) => n.y - n.r));
		const y1 = Math.max(...ns.map((n) => n.y + n.r));
		const k = Math.max(0.05, Math.min(view.k, (box.w - 2 * m) / (x1 - x0), (box.h - 2 * m) / (y1 - y0)));
		if (k < view.k) {
			// too big for the pane at this zoom: zoom out and centre them
			view = { k, x: box.w / 2 - ((x0 + x1) / 2) * k, y: box.h / 2 - ((y0 + y1) / 2) * k };
			return;
		}
		// otherwise just slide the map the least that brings them in
		/** @param {number} v the map's offset @param {number} a @param {number} b the bubbles' extent @param {number} size the pane's */
		const slide = (v, a, b, size) => (v + a * k < m ? m - a * k : v + b * k > size - m ? size - m - b * k : v);
		view = { k, x: slide(view.x, x0, x1, box.w), y: slide(view.y, y0, y1, box.h) };
	}

	/** the stack or paragraph in the bubble (none: nothing chosen, or it has been spread out) */
	let shown = $derived.by(() => {
		if (!selected) return undefined;
		const n = graph.nodes.find((m) => m.key === selected);
		if (n || !selected.startsWith('stack:')) return n;
		// a stack that has been spread out: its paragraphs still make up what the preview shows, and the lines point at them all
		const ps = graph.nodes.filter((m) => m.group === selected);
		if (!ps.length) return undefined;
		const x0 = Math.min(...ps.map((m) => m.x - m.r));
		const x1 = Math.max(...ps.map((m) => m.x + m.r));
		const y0 = Math.min(...ps.map((m) => m.y - m.r));
		const y1 = Math.max(...ps.map((m) => m.y + m.r));
		return { ...ps[0], kind: /** @type {const} */ ('stack'), key: selected, items: ps.flatMap((m) => m.items), x: (x0 + x1) / 2, y: (y0 + y1) / 2, r: Math.max(x1 - x0, y1 - y0) / 2 };
	});
	let current = $derived(shown ? shown.items[Math.min(slide, shown.items.length - 1)] : undefined);

	// the bubble's place beside the map (the lines from the map end at its near corners)
	let bubble = $state({ x: 0, y: 0, w: 0, h: 0, r: 0 });
	/** @param {HTMLElement} node */
	function trackBubble(node) {
		const update = () => (bubble = { x: node.offsetLeft, y: node.offsetTop, w: node.offsetWidth, h: node.offsetHeight, r: parseFloat(getComputedStyle(node).borderTopLeftRadius) || 0 });
		const ro = new ResizeObserver(update);
		ro.observe(node);
		if (node.parentElement) ro.observe(node.parentElement);
		update();
		return { destroy: () => ro.disconnect() };
	}

	/**
	 * The two lines from the chosen bubble to the preview bubble, like the sides of a detail inset on a map: the upper one joins the
	 * top right corner of the bubble to the top left corner of the preview, the lower one the two bottom corners. Both bubbles have
	 * rounded corners, so each line is the common tangent of the two corner arcs (the line that just touches both). Drawn when the
	 * chosen bubble is on screen.
	 */
	let insetLines = $derived.by(() => {
		if (!shown || !bubble.w) return null;
		const k = view.k;
		const sx = view.x + shown.x * k;
		const sy = view.y + shown.y * k;
		if (sx < 0 || sy < 0 || sx > box.w || sy > box.h) return null;
		const half = shown.r * k;
		const ra = Math.min(shown.r * 0.7 * k, half); // the bubble's corner radius (as drawn: 0.7 of its radius)
		const R = Math.min(bubble.r, bubble.h / 2);
		return [-1, 1].map((side) => {
			// the arcs' centres and radii: the chosen bubble's right-hand corner and the preview's left-hand corner on this side
			const c1 = { x: sx + half - ra, y: sy + side * (half - ra) };
			const c2 = { x: bubble.x + R, y: side < 0 ? bubble.y + R : bubble.y + bubble.h - R };
			const dx = c2.x - c1.x;
			const dy = c2.y - c1.y;
			const d = Math.hypot(dx, dy) || 1;
			// the outer tangent: a unit normal u with u . (c2 - c1) = ra - R, pointing up for the upper line and down for the lower
			const a = Math.acos(Math.max(-1, Math.min(1, (ra - R) / d)));
			const t = Math.atan2(dy, dx);
			const us = [t + a, t - a].map((q) => ({ x: Math.cos(q), y: Math.sin(q) }));
			const u = us.reduce((m, q) => (side < 0 ? q.y < m.y : q.y > m.y) ? q : m);
			return { x1: c1.x + ra * u.x, y1: c1.y + ra * u.y, x2: c2.x + R * u.x, y2: c2.y + R * u.y };
		});
	});

	/** @param {MouseEvent} e */
	function onBackdrop(e) {
		if (e.target === dialogEl) dialogEl?.close();
	}
</script>

{#snippet stageView()}
	<div class="relative {picking ? 'mt-2' : 'mt-3'} flex min-h-0 flex-1 gap-8">
	<div
		bind:this={stage}
		bind:clientWidth={box.w}
		bind:clientHeight={box.h}
		use:wheelZoom
		role="presentation"
		onpointerdown={down}
		onmousedown={(e) => (e.shiftKey || e.metaKey || e.ctrlKey) && e.preventDefault()}
		onpointermove={move}
		onpointerup={up}
		onpointercancel={up}
		class="relative min-h-0 flex-1 cursor-grab touch-none select-none overflow-hidden rounded-2xl border border-taupe3 bg-taupe1 shadow-lg active:cursor-grabbing"
	>
		{#if graph.empty}
			<p class="absolute inset-0 flex items-center justify-center text-sm text-grey3">No sections to map yet.</p>
		{:else}
			<svg class="absolute inset-0 h-full w-full" role="img" aria-label="Map of the text's sections">
				<g transform="translate({view.x} {view.y}) scale({view.k})">
					<!-- links, under the bubbles -->
					{#each graph.links as l (l.to.key)}
						<path d={curve(l.from, l.to)} fill="none" stroke="currentColor" class="text-taupe2" stroke-width="1" vector-effect="non-scaling-stroke" />
					{/each}

					<!-- the root: the text as a whole -->
					<rect x={graph.root.x - graph.root.r} y={graph.root.y - graph.root.r} width={graph.root.r * 2} height={graph.root.r * 2} rx={graph.root.r * 0.7} class="fill-dark" style="filter: {shadow(graph.root.x)}" />
					{#if fits('100', graph.root.r)}
						<text x={graph.root.x} y={graph.root.y} text-anchor="middle" dominant-baseline="central" font-size={PCT_PX / view.k} class="pointer-events-none fill-white">100</text>
					{/if}
					<text x={graph.root.x} y={graph.root.y - graph.root.r - 8 / view.k} text-anchor="middle" font-size={LABEL_PX_TOP / view.k} style="filter: {labelShadow(graph.root.x)}" class="pointer-events-none fill-taupe5 font-semibold">{clip(graph.root.title)}</text>

					{#each graph.nodes as n (n.key)}
						{@const rows = n.kind === 'section' && n.depth <= 1 ? labelLines(n) : []}
						{@const lit = hover === n || n.key === selected || n.key === target || picked.has(n.key) || (shown?.key === selected && n.group === selected && n.key === current?.id)}
						<!-- svelte-ignore a11y_click_events_have_key_events, a11y_no_noninteractive_element_interactions -->
						<g
							role="presentation"
							onpointerdown={(e) => grab(e, n)}
							onpointerenter={() => !carry && (hover = n)}
							onpointerleave={() => (hover = null)}
							onclick={(e) => pick(n, e)}
							ondblclick={() => toggle(n)}
							class="cursor-pointer"
						>
							<rect x={n.x - n.r} y={n.y - n.r} width={n.r * 2} height={n.r * 2} rx={n.r * 0.7} style="fill: {n.kind === 'section' ? (n.aside ? MATTER : sectionFill(n.id)) : n.kind === 'stack' ? 'var(--color-taupe1)' : 'var(--color-taupe3)'}; filter: {shadow(n.x)}{n.kind !== 'section' ? `; stroke: ${leafColor(n)}` : ''}" class={n.kind === 'stack' ? 'stroke-taupe3' : 'stroke-taupe1'} stroke-width="1.5" />
							{#if lit || (picking && (n.frontmatter || n.backmatter))}
								<!-- the highlight: a violet outline set off from the bubble by a clear space as wide as the outline -->
								{@const sw = picking && (n.frontmatter || n.backmatter) ? 4 : 2.5}
								{@const out = sw * 1.5 + 0.75}
								<rect x={n.x - n.r - out} y={n.y - n.r - out} width={(n.r + out) * 2} height={(n.r + out) * 2} rx={n.r * 0.7 + out} fill="none" stroke-width={sw} class="pointer-events-none stroke-violet" />
							{/if}
							{#if n.kind === 'stack'}
								<g transform="translate({n.x - n.r * 0.7} {n.y - n.r * 0.7}) scale({(n.r * 1.4) / 24})" class="pointer-events-none"><LayersDownRight width={24} height={24} fill={leafColor(n)} /></g>
							{/if}
							{#if n.kind === 'section' && !n.aside && fits(percent(n.size, graph.total), n.r)}
								<text x={n.x} y={n.y} text-anchor="middle" dominant-baseline="central" font-size={PCT_PX / view.k} class="pointer-events-none fill-white">{percent(n.size, graph.total)}</text>
							{/if}
							{#if rows.length}
								<text
									x={n.x}
									y={n.y + n.r + 6 / view.k}
									text-anchor="middle"
									dominant-baseline="hanging"
									font-size={LABEL_PX_TOP / view.k}
									style="filter: {labelShadow(n.x)}"
									class="pointer-events-none fill-taupe5 font-semibold">{#each rows as row, k (k)}<tspan x={n.x} dy={k === 0 ? 0 : (LABEL_PX_TOP * LABEL_LEADING) / view.k}>{row}</tspan>{/each}</text>
							{:else if n.kind === 'section' && n.depth > 1 && view.k >= 1}
								<text
									x={n.x}
									y={n.y + n.r + 6 / view.k}
									text-anchor="start"
									transform="rotate(90 {n.x} {n.y + n.r + 6 / view.k})"
									dominant-baseline="central"
									font-size={LABEL_PX / view.k}
									style="filter: {labelShadow(n.x)}"
									class="pointer-events-none fill-taupe5">{clip(n.title)}</text>
							{/if}
							{#if (picking || full) && (n.backmatter || n.frontmatter) && n.depth <= 1}
								<text x={n.x} y={n.y + n.r + (6 + Math.max(1, labelLines(n).length) * LABEL_PX_TOP * LABEL_LEADING + 4) / view.k} text-anchor="middle" dominant-baseline="hanging" font-size={LABEL_PX / view.k} font-style="italic" style="filter: {labelShadow(n.x)}" class="pointer-events-none fill-taupe5">{n.backmatter ? 'back matter' : 'front matter'}</text>
							{/if}
						</g>
					{/each}
					{#if gapAt}
						<!-- where the carried item would land between two bubbles -->
						<line x1={gapAt.x} y1={gapAt.y0} x2={gapAt.x} y2={gapAt.y1} class="stroke-violet" stroke-width="3" stroke-linecap="round" vector-effect="non-scaling-stroke" />
					{/if}
				</g>
			</svg>

			{#if tipNode}
				<div
					role="tooltip"
					class="pointer-events-none absolute z-10 w-max max-w-64 rounded-2xl border border-taupe3 bg-taupe1 px-3 py-1.5 text-xs text-taupe5 shadow-lg"
					style="left: {Math.min(tip.x + 14, Math.max(box.w - 270, 0))}px; top: {tip.y + 14}px"
				>
					<MinimapTooltip lines={tipNode.trail} />
				</div>
			{/if}
			{#if carry?.started}
				<!-- what is being carried, under the pointer -->
				<div class="pointer-events-none absolute z-20 flex h-8 w-8 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-lg border border-taupe3 bg-taupe1 opacity-80 shadow-lg" style="left: {carry.x}px; top: {carry.y}px">
					{#if carry.kind === 'section'}<span class="h-4 w-4 rounded-md" style="background: {sectionFill(carry.sectionId)}"></span>{:else if carry.stack}<LayersDownRight width={20} height={20} fill={leafColor(carry.node)} />{:else}<span class="h-3 w-3 rounded-sm bg-taupe3"></span>{/if}
					{#if carry.count > 1}<span class="absolute -top-2 -right-2 rounded-full bg-violet px-1.5 text-xs leading-4 text-white">{carry.count}</span>{/if}
				</div>
			{/if}
		{/if}
	</div>

	{#if full}
		<!-- the preview bubble: the chosen stack or paragraph, text in 12 pt -->
		<aside use:trackBubble class="mt-auto flex h-[min(calc(100%-3.5rem),34rem)] w-[min(24rem,32%)] shrink-0 flex-col rounded-2xl border border-taupe3 bg-taupe1 p-4 shadow-lg">
			{#if shown && current}
				{#if shown.items.length > 1}
					<div class="mb-2 flex shrink-0 items-center justify-center gap-2 text-xs text-grey3">
						<button type="button" onclick={() => (slide = (slide - 1 + shown.items.length) % shown.items.length)} aria-label="Previous paragraph" class="rounded-md px-2 py-0.5 text-base leading-none text-dark hover:bg-taupe2">‹</button>
						<span>{slide + 1} of {shown.items.length}</span>
						<button type="button" onclick={() => (slide = (slide + 1) % shown.items.length)} aria-label="Next paragraph" class="rounded-md px-2 py-0.5 text-base leading-none text-dark hover:bg-taupe2">›</button>
					</div>
				{/if}
				<div class="min-h-0 flex-1 overflow-auto">
					<p class="text-[12pt] break-words whitespace-pre-wrap text-dark">{current.text}</p>
				</div>
			{:else if shown}
				<p class="m-auto text-center text-sm text-grey3">{shown.title ? `${shown.title} has` : 'This has'} no paragraphs.</p>
			{:else}
				<p class="m-auto text-center text-sm text-grey3">Click a section, a stack or a paragraph to see its paragraphs here. Click a closed top-level section to open it, and double-click a stack to spread it out.</p>
			{/if}
		</aside>
		{#if shown?.kind === 'section' && bubble.w}
			<!-- a chosen section's lineage, above the preview bubble: each section it is inside, down to this one -->
			<nav aria-label="Where this section is" class="pointer-events-none absolute flex flex-wrap items-end justify-center gap-x-1 text-xs text-grey3" style="left: {bubble.x}px; width: {bubble.w}px; top: {bubble.y - 8}px; transform: translateY(-100%)">
				{#each shown.trail as crumb, i (i)}
					{#if i > 0}<span aria-hidden="true">›</span>{/if}
					<span class={i === shown.trail.length - 1 ? 'font-semibold text-dark' : ''}>{crumb}</span>
				{/each}
				{#if onmatter && shown.depth === 1 && shown.id}
					<!-- top-level sections can be front or back matter (one or the other): small round toggles -->
					<span class="pointer-events-auto ml-1 inline-flex items-center gap-1">
						{#snippet toggle(/** @type {'front' | 'back'} */ kind, /** @type {string} */ label, /** @type {boolean | undefined} */ on)}
							<button type="button" role="switch" aria-checked={!!on} aria-label={label} use:hint={label} onclick={() => {
								// an open section that is marked as matter closes (the first section that is not matter opens instead)
								if (!on && shown?.open) openTop = null;
								onmatter?.({ id: /** @type {string} */ (shown?.id), kind: on ? null : kind });
							}} class="flex h-7 w-7 items-center justify-center rounded-full border font-script text-[15px] leading-none font-normal {on ? 'border-taupe4 bg-taupe4 text-taupe0 [text-shadow:0_1px_1px_var(--color-taupe5)]' : 'border-taupe3 bg-taupe1 text-taupe5 [text-shadow:0_1px_1px_var(--color-taupe0)] hover:bg-taupe2'}">{kind === 'front' ? 'f' : 'b'}</button>
						{/snippet}
						{@render toggle('front', 'Front matter', shown.frontmatter)}
						{@render toggle('back', 'Back matter', shown.backmatter)}
					</span>
				{/if}
			</nav>
		{/if}
		{#if insetLines}
			<svg class="pointer-events-none absolute inset-0 h-full w-full" aria-hidden="true">
				<!-- the lines start at the middle of the chosen bubble and pass behind every bubble on the map (a mask cuts the bubbles out of them) -->
				<defs>
					<mask id="map-inset-mask" maskUnits="userSpaceOnUse" x="0" y="0" width="100%" height="100%">
						<rect width="100%" height="100%" fill="white" />
						{#each [graph.root, ...graph.nodes] as n (n.key)}
							<!-- (cut out the bubble with its border, which is drawn centred on its edge: up to 2.5 wide, or 4 when marked) -->
							<rect x={view.x + (n.x - n.r - 2) * view.k} y={view.y + (n.y - n.r - 2) * view.k} width={(n.r + 2) * 2 * view.k} height={(n.r + 2) * 2 * view.k} rx={(n.r * 0.7 + 2) * view.k} fill="black" />
						{/each}
					</mask>
				</defs>
				<g mask="url(#map-inset-mask)">
					{#each insetLines as l, i (i)}
						<line {...l} stroke="currentColor" class="text-taupe2" stroke-width="1" />
					{/each}
				</g>
			</svg>
		{/if}
	{/if}
	</div>

{/snippet}

{#if picking}
	<div class="flex h-full min-h-0 flex-col">
		<div class="flex shrink-0 flex-wrap items-center gap-2 text-xs">
			<span>Click a section to mark it as</span>
			<div role="group" aria-label="Kind of matter to mark" class="inline-flex overflow-hidden rounded-md border border-taupe3">
				<button type="button" aria-pressed={step === 'front'} onclick={() => (step = 'front')} class="px-2 py-1 {step === 'front' ? 'bg-violet text-white' : 'hover:bg-taupe2'}">Front matter</button>
				<button type="button" aria-pressed={step === 'back'} onclick={() => (step = 'back')} class="px-2 py-1 {step === 'back' ? 'bg-violet text-white' : 'hover:bg-taupe2'}">Back matter</button>
			</div>
		</div>
		<p class="mt-1 shrink-0 text-xs text-grey3">Front matter is a title page, abstract or acknowledgements; back matter is a bibliography, appendices or an index. Hover a section to see it in the preview.</p>
		{@render stageView()}
	</div>
{:else}
<!-- svelte-ignore a11y_click_events_have_key_events, a11y_no_noninteractive_element_interactions -->
<dialog
	bind:this={dialogEl}
	onclick={onBackdrop}
	onclose={() => {
		open = false;
		hover = null;
		selected = null;
	}}
	class="m-auto h-[85vh] w-[min(94vw,80rem)] overflow-hidden rounded-lg border border-taupe3 bg-taupe1 p-6 text-dark outline-none backdrop:bg-black/40 open:flex open:flex-col"
>
	<div class="flex shrink-0 items-center justify-between">
		<h2 class="text-base font-semibold">Map of {rootTitle}</h2>
		<div class="flex items-center gap-1">
			{#if onundo}
				<button onclick={onundo} disabled={!canundo} aria-label="Undo" class="inline-flex items-center justify-center rounded-md p-1 hover:bg-taupe2 disabled:opacity-30 disabled:hover:bg-transparent"><Undo /></button>
				<button onclick={onredo} disabled={!canredo} aria-label="Redo" class="inline-flex items-center justify-center rounded-md p-1 hover:bg-taupe2 disabled:opacity-30 disabled:hover:bg-transparent"><Redo /></button>
			{/if}
			<button onclick={() => dialogEl?.close()} aria-label="Close" class="rounded-md px-2 py-1 text-lg leading-none hover:bg-taupe2">×</button>
		</div>
	</div>


	{@render stageView()}
</dialog>
{/if}
