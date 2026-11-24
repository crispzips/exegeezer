<script>
	import { caretOffsetAt, editable, noLineBreaks } from '#lib/utilities/editable.js';
	import { tip } from '#lib/utilities/menuTip.svelte.js';
	import { tick, untrack } from 'svelte';
	import { ChevronsUp, Cog, Fullscreen, Minus, PencilEditCircle, Plus, TrashX } from '@boxicons/svelte';
	import { buildSections, ancestorsOf } from '#lib/utilities/buildSections.js';
	import { sectionColor } from '#lib/utilities/sectionColor.js';
	import FootnoteTip from '#lib/components/FootnoteTip.svelte';
	import { definitionsOf, emphasizeFirst, plainFirst, renderFootnoteMarks } from '#lib/utilities/renderMarkdown.js';
	import DropTip from '#lib/components/DropTip.svelte';
	import { DragDrop } from '#lib/utilities/dragDrop.svelte.js';
	import { GapHover } from '#lib/utilities/gapHover.svelte.js';
	import { dropAllowed } from '#lib/utilities/editText.js';

	/**
	 * Cascading view: every bubble is the same size and sits in one grid, inside one container.
	 * The top level is a horizontal row. Opening a section lays its children out orthogonally to
	 * the section itself: a section in a horizontal row opens a vertical column beneath it; a
	 * section in a vertical column opens a horizontal row to its right. So the text cascades
	 * down and to the right. One section per level is open at a time.
	 *
	 * @type {{
	 *   paragraphs: { id: string, originalIndex: number, text: string, level?: number }[],
	 *   onrename?: (change: { id: string, title: string }) => void,
	 *   focusId?: string | null,
	 *   onfocusitem?: (id: string) => void,
	 *   empty?: string,
	 *   exploded?: boolean,
	 *   onmove?: (drop: { id: string, targetId: string, place: import('#lib/utilities/editText.js').DropPlace }) => void,
	 *   onnewitem?: (id: string, rect: DOMRect, pick: (kind: 'paragraph' | 'section', level?: number) => void) => void,
	 *   onadd?: (req: { targetId: string, place: 'before' | 'after' | 'inside', kind: 'paragraph' | 'section', auto?: boolean, level?: number }) => string | void,
	 *   onleave?: (id: string, changed: boolean) => void,
	 *   ondelete?: (req: { id: string, kind: 'paragraph' | 'section', scope?: 'only' | 'tree' }) => void,
	 *   onedit?: (edit: { id: string, text: string, title: string, description: string }) => void,
	 *   placing?: boolean,
	 *   cursor?: { id: string, place: 'before' | 'after' | 'inside' } | null
	 * }}
	 *
	 * With `onmove` (editing mode), bubbles can be dragged within their row or column: onto the
	 * edge of a sibling, or the space between, to interject; onto the middle of a bubble of the
	 * same kind to prepend or append (merge). A section drags with its contents.
	 *
	 * With `onadd` (editing mode), hovering the space between bubbles shows the same line and a
	 * plus; hovering the plus asks "Paragraph or section?" and adds an empty one there.
	 *
	 * A single click on a paragraph bubble only selects it. Hovering a bubble shows a vertical menu
	 * of buttons at its top right: expand (the reading modal) and, with `onedit` (writing mode), the
	 * pencil (a modal with fields for the paragraph's title, description and body) and, with `ondelete`,
	 * the trash (below them; a section's menu is its settings cog, then the trash). Double-clicking a
	 * paragraph edits its text in place, in the bubble; while not writing, `onwrite` is asked first
	 * to switch to writing mode.
	 *
	 * With `placing` (rally view, writing mode), a cursor marks where the next thing will be inserted: a gap between bubbles
	 * (or just inside a section). Click a gap, or use the arrow keys, to move it; `cursor` is bindable.
	 *
	 * Exploded: every section is open at once (children may land on the same cell), the view is
	 * zoomed all the way out, and the bubbles drop their contents and show only their section's
	 * colour.
	 */
	let { paragraphs, onrename = undefined, focusId = null, onfocusitem = undefined, empty = 'No text yet.', exploded = false, onmove = undefined, onadd = undefined, onnewitem = undefined, onedit = undefined, onwrite = undefined, onleave = undefined, ondelete = undefined, placing = false, cursor = $bindable(null) } = $props();

	const dd = new DragDrop();
	const gap = new GapHover();
	/** whether the plus is hovered (its "Paragraph or section?" popup is open) */
	/** which gap's add popup is open (see `gapKey`), or null */
	/** @type {string | null} */
	let plusOpen = $state(null);
	// leaving editing mode (or exploding) drops any drag in progress
	$effect(() => {
		if (!onmove || exploded) dd.end();
	});

	/** @param {DragEvent} e */
	function dragOver(e) {
		if (!onmove || exploded) return;
		if (dd.over(e, (id, target, place) => dropAllowed(paragraphs, id, target, place, false))) {
			e.preventDefault();
			if (e.dataTransfer) e.dataTransfer.dropEffect = 'move';
		}
	}

	/** @param {DragEvent} e */
	function drop(e) {
		const d = dd.drop;
		const id = dd.dragId;
		dd.end();
		if (!onmove || !d || !id) return;
		e.preventDefault();
		onmove({ id, targetId: d.id, place: d.place });
	}

	/** a bubble's merge highlight; an interjection is drawn as a line in the gap instead (see `gapLine`)
	 * @param {string} id @param {boolean} horizontal */
	const mergeClasses = (id, horizontal) => {
		if (dd.drop?.id !== id) return '';
		const base = 'outline-2 outline-taupe4 bg-taupe2!';
		switch (dd.drop.place) {
			case 'merge-before':
				return `${base} ${horizontal ? 'shadow-[inset_3px_0_0_0]' : 'shadow-[inset_0_3px_0_0]'} shadow-taupe4`;
			case 'merge-after':
				return `${base} ${horizontal ? 'shadow-[inset_-3px_0_0_0]' : 'shadow-[inset_0_-3px_0_0]'} shadow-taupe4`;
			default:
				return '';
		}
	};

	/** The interject marker: a straight taupe3 line across the gap, halfway between the two bubbles
	 * (a cell boundary, as bubbles are centred in their cells), perpendicular to the row or column.
	 * It shows for a drag's interject drop and for the gap the pointer hovers in editing mode; `cx`/`cy`
	 * is its middle, where the plus goes. */
	/** @typedef {{ id: string, place: 'before' | 'after' | 'inside' }} GapSpec */
	/** @param {GapSpec} z */
	const gapKey = (z) => `${z.id}:${z.place}`;
	/**
	 * The line (and its middle) for a gap.
	 * @param {GapSpec} z
	 */
	function lineFor(z) {
		const p = layout.find((q) => (q.node.kind === 'section' ? q.node.id : q.node.paragraph.id) === z.id);
		if (!p) return null;
		const LINE = 10; // as thick as a bubble's border
		const step = z.place === 'before' ? 0 : 1;
		// 'inside' is the gap beyond a section bubble, on the axis its contents open along: beneath a bubble
		// in a row, to the right of one in a column
		const along = z.place === 'inside' ? !p.horizontal : p.horizontal;
		const [x, y] = along ? [(p.col + step) * PITCH - LINE / 2, p.row * PITCH + GAP / 2] : [p.col * PITCH + GAP / 2, (p.row + step) * PITCH - LINE / 2];
		const width = along ? LINE : SIZE;
		const height = along ? SIZE : LINE;
		// the line is centred on a cell boundary, so at the grid's outer edges half of it would fall outside the
		// scene and be clipped (a thin line beside the full ones between bubbles): keep it wholly inside
		const left = Math.max(0, Math.min(x, colCount * PITCH - width));
		const top = Math.max(0, Math.min(y, rowCount * PITCH - height));
		return { id: z.id, place: z.place, left, top, width, height, cx: left + width / 2, cy: top + height / 2 };
	}
	let gapLine = $derived.by(() => {
		const d = dd.drop;
		/** @type {GapSpec | null} */
		const z = d && (d.place === 'before' || d.place === 'after') ? { id: d.id, place: d.place } : onadd && gap.lit && !dd.dragId ? gap.target : null;
		return z && !exploded ? lineFor(z) : null;
	});
	/** Whether a paragraph can go in the hovered gap. In the text a paragraph belongs to the header above it,
	 * so right after a section's bubble it would land inside that section, not beside it. */
	/** @param {GapSpec} z */
	function paragraphFits(z) {
		if (z.place === 'inside') return true; // the first thing in a section
		const id = (/** @type {Placed} */ q) => (q.node.kind === 'section' ? q.node.id : q.node.paragraph.id);
		const at = layout.findIndex((q) => id(q) === z.id);
		if (at === -1) return false;
		if (!layout[at].parent) return false; // paragraphs have to be inside sections: never among the top-level bubbles
		const parent = layout[at].parent?.id ?? null;
		const sibs = layout.filter((q) => (q.parent?.id ?? null) === parent);
		const prev = z.place === 'after' ? layout[at] : sibs[sibs.indexOf(layout[at]) - 1];
		return !prev || prev.node.kind === 'paragraph';
	}

	/**
	 * Every gap on the grid as an element of its own (shown in editing mode): the strip between two neighbouring cells, as wide as
	 * the grid's gap and as long as a bubble is across. Where a vertical strip crosses a horizontal one (the corner squares between four
	 * cells) belongs to neither. Hovering a strip lights its line and offers the plus, fixed in the middle of the gap.
	 */
	let zones = $derived.by(() => {
		if (!onadd || exploded) return [];
		/** @type {(NonNullable<ReturnType<typeof lineFor>> & { zl: number, zt: number, zw: number, zh: number, axis: 'x' | 'y' })[]} */
		const out = [];
		for (const p of layout) {
			const id = p.node.kind === 'section' ? p.node.id : p.node.paragraph.id;
			const last = layout.filter((q) => (q.parent?.id ?? null) === (p.parent?.id ?? null)).at(-1) === p;
			/** @type {GapSpec[]} */
			const specs = [{ id, place: 'before' }];
			if (last) specs.push({ id, place: 'after' });
			if (p.node.kind === 'section') specs.push({ id, place: 'inside' });
			for (const z of specs) {
				const line = lineFor(z);
				if (!line) continue;
				const vertical = line.width < line.height;
				const zl = vertical ? Math.max(0, line.cx - GAP / 2) : line.left;
				const zt = vertical ? line.top : Math.max(0, line.cy - GAP / 2);
				out.push({ ...line, zl, zt, zw: vertical ? Math.min(GAP, colCount * PITCH - zl) : line.width, zh: vertical ? line.height : Math.min(GAP, rowCount * PITCH - zt), axis: vertical ? 'x' : 'y' });
			}
		}
		return out;
	});
	/** @param {'paragraph' | 'section'} kind @param {GapSpec} z the gap to add at @param {boolean} [auto] made by Enter in the bubble before it (the page then drops it if it is left empty) @param {number} [level] a section's heading level */
	async function add(kind, z, auto = false, level = undefined) {
		gap.clear();
		plusOpen = null;
		if (z?.place === 'inside') {
			// the new first item lives in the section: open it so it can be seen
			const p = layout.find((q) => q.node.kind === 'section' && q.node.id === z.id);
			if (p) selected = [...selected.slice(0, p.depth), z.id];
		}
		const id = z ? onadd?.({ targetId: z.id, place: z.place, kind, auto, level }) : undefined;
		if (!id) return;
		// once the new bubble is laid out (the grid may grow and re-zoom), bring it to the middle of the view
		await tick();
		await new Promise((r) => setTimeout(r, 60));
		host?.querySelector(`[data-node="${CSS.escape(id)}"]`)?.scrollIntoView({ behavior: 'smooth', block: 'center', inline: 'center' });
		// the editing cursor goes straight into the new item: a paragraph's body, or a section's title
		await new Promise((r) => setTimeout(r, 350));
		if (kind === 'paragraph') {
			inlineCaret = 0;
			inlineEditId = id;
		} else {
			titleEditId = id; // the new section's title is editable at once, in place
		}
	}

	/**
	 * Enter in an edited bubble: ask the page what to add next. A paragraph made from a section goes inside it, as its first item;
	 * anything else goes right after the bubble.
	 * @param {string} id @param {'paragraph' | 'section'} from what the bubble is @param {DOMRect} rect
	 */
	function askNew(id, from, rect) {
		onnewitem?.(id, rect, (/** @type {'paragraph' | 'section'} */ kind, /** @type {number | undefined} */ level) => add(kind, { id, place: kind === 'paragraph' && from === 'section' ? 'inside' : 'after' }, true, level));
	}

	/** drag attributes shared by every bubble: a bubble in a row moves along x, in a column along y
	 * @param {string} id @param {'paragraph' | 'section'} kind @param {boolean} horizontal */
	const dragAttrs = (id, kind, horizontal) =>
		onmove && !exploded
			? {
					'data-drop': id,
					'data-kind': kind,
					'data-axis': horizontal ? 'x' : 'y',
					draggable: true,
					ondragstart: (/** @type {DragEvent} */ e) => dd.start(id, kind, e),
					ondragend: () => dd.end()
				}
			: {};

	// The grid is laid out in unscaled units and drawn with CSS `zoom`, so bubbles, gaps, borders
	// and text all scale together. A cell is PITCH wide; its bubble is SIZE, centred in it.
	const SIZE = 224;
	const PITCH = SIZE + 80; // the gap is wide enough for the hover plus, with room around it
	const GAP = PITCH - SIZE;
	/** exploded: the tubes' thickness (half of what the exploded circles were) */
	const TUBE = SIZE * 0.75 * 0.5;
	/** exploded: opacity of a section's whole stroke */
	const STROKE_OPACITY = 0.5;
	/** exploded: thickness of the opaque outline around each colour's shape */
	const RIM = 10;
	/** exploded: how many of a section's paragraphs are drawn (the rest are clipped) */
	const PARAGRAPH_RUN = 6;
	/** the on-screen cell size (px) the view aims for by default: the current look */
	const IDEAL_CELL = 189;
	/** the largest a cell ever gets (px), so a text with one bubble is not blown up to fill the pane: the bubble tops out around 200px */
	const MAX_CELL = 270;

	/** @typedef {import('#lib/utilities/buildSections.js').SectionChild} SectionChild */

	let tree = $derived(buildSections(paragraphs));
	/** footnote and reference definitions shared by every paragraph */
	let defs = $derived(definitionsOf(paragraphs));
	/** section id -> colour */
	let colors = $derived.by(() => {
		// every section takes its top-level section's accent, undarkened at any depth
		/** @type {Map<string, string>} */
		const map = new Map();
		/** @param {SectionChild[]} list @param {number} topIdx */
		const walk = (list, topIdx) => {
			for (const n of list) {
				if (n.kind !== 'section') continue;
				map.set(n.id, sectionColor(topIdx, 0));
				walk(n.children, topIdx);
			}
		};
		tree.filter((n) => n.kind === 'section').forEach((n, i) => {
			if (n.kind !== 'section') return;
			map.set(n.id, sectionColor(i, 0));
			walk(n.children, i);
		});
		return map;
	});

	/** the open section at each level: selected[0] is open among the top-level bubbles, and so on */
	/** @type {string[]} */
	let selected = $state([]);

	/** @type {HTMLDivElement | undefined} */
	let host = $state();

	/**
	 * Place every visible bubble on the grid.
	 * @typedef {{ node: SectionChild, row: number, col: number, color: string | null, open: boolean, horizontal: boolean, depth: number, parent: { row: number, col: number, id: string } | null }} Placed
	 */
	let layout = $derived.by(() => {
		/** @type {Placed[]} */
		const out = [];
		/**
		 * @param {SectionChild[]} nodes
		 * @param {boolean} horizontal true: a row running right from (row, col); false: a column running down
		 * @param {number} row @param {number} col @param {number} depth @param {string | null} color the parent section's colour
		 * @param {{ row: number, col: number, id: string } | null} parent the section these nodes belong to
		 */
		function place(nodes, horizontal, row, col, depth, color, parent) {
			// exploded: a section's paragraphs run on cell after cell, each fainter than the last, and are
			// clipped after PARAGRAPH_RUN of them so the grid stays a manageable size (a clipped paragraph
			// takes no cell, so whatever follows closes up behind it)
			let slot = 0;
			let paragraphs = 0;
			nodes.forEach((node) => {
				if (exploded && node.kind === 'paragraph') {
					if (paragraphs >= PARAGRAPH_RUN) return;
					paragraphs++;
				}
				const i = slot++;
				const r = horizontal ? row : row + i;
				const c = horizontal ? col + i : col;
				const open = node.kind === 'section' && (exploded || selected[depth] === node.id);
				out.push({ node, row: r, col: c, color: node.kind === 'section' ? (colors.get(node.id) ?? null) : color, open, horizontal, depth, parent });
				if (node.kind === 'section' && open) {
					// children go orthogonally: beneath a bubble in a row, to the right of one in a column
					if (horizontal) place(node.children, false, r + 1, c, depth + 1, colors.get(node.id) ?? null, { row: r, col: c, id: node.id });
					else place(node.children, true, r, c + 1, depth + 1, colors.get(node.id) ?? null, { row: r, col: c, id: node.id });
				}
			});
		}
		place(tree, true, 0, 0, 0, null, null);
		return out;
	});

	// ---- placing (rally writing mode): the insertion cursor ----
	/** @param {Placed} q */
	const idOf = (q) => (q.node.kind === 'section' ? q.node.id : q.node.paragraph.id);
	/** every gap the cursor can sit in, as a drawn line: before each bubble, after the last of each list, and inside a section with nothing open in it */
	let slots = $derived.by(() => {
		if (!placing || exploded) return [];
		const out = [];
		for (const p of layout) {
			const id = idOf(p);
			const sibs = layout.filter((q) => (q.parent?.id ?? null) === (p.parent?.id ?? null));
			/** @type {GapSpec[]} */
			const specs = [{ id, place: 'before' }];
			if (sibs[sibs.length - 1] === p) specs.push({ id, place: 'after' });
			if (p.node.kind === 'section' && !(p.open && p.node.children.length)) specs.push({ id, place: 'inside' });
			for (const z of specs) {
				const line = lineFor(z);
				if (line) out.push(line);
			}
		}
		return out;
	});
	let cursorLine = $derived(placing && cursor && !exploded ? lineFor(cursor) : null);
	// the cursor's own section(s) are opened so its gap is on show, and it is brought to the middle of the view
	$effect(() => {
		const c = placing ? cursor : null;
		if (!c) return;
		untrack(() => {
			const anc = ancestorsOf(tree, c.id);
			if (!anc) return;
			selected = c.place === 'inside' ? [...anc, c.id] : anc;
			tick().then(() => host?.querySelector(`[data-node="${CSS.escape(c.id)}"]`)?.scrollIntoView({ behavior: 'smooth', block: 'center', inline: 'center' }));
		});
	});
	/**
	 * Move the cursor to the nearest gap in a direction.
	 * @param {'left' | 'right' | 'up' | 'down'} dir
	 * @returns {boolean} whether it moved
	 */
	export function moveCursor(dir) {
		if (!placing || !slots.length) return false;
		const here = cursorLine;
		if (!here) {
			cursor = { id: slots[0].id, place: slots[0].place };
			return true;
		}
		const dx = dir === 'left' ? -1 : dir === 'right' ? 1 : 0;
		const dy = dir === 'up' ? -1 : dir === 'down' ? 1 : 0;
		let best = null;
		let bestScore = Infinity;
		for (const g of slots) {
			if (g.id === here.id && g.place === here.place) continue;
			const along = (g.cx - here.cx) * dx + (g.cy - here.cy) * dy;
			if (along <= 1) continue;
			const across = Math.abs((g.cx - here.cx) * dy) + Math.abs((g.cy - here.cy) * dx);
			const score = along + across * 2;
			if (score < bestScore) ((best = g), (bestScore = score));
		}
		if (!best) return false;
		cursor = { id: best.id, place: best.place };
		return true;
	}
	/** drag the map to move around it (placing): a drag past a few pixels scrolls the view, and the click that ends it is swallowed */
	let panning = $state(false);
	/** @param {PointerEvent} e */
	function startPan(e) {
		if (!placing || e.button !== 0 || !stage) return;
		const view = stage;
		const x0 = e.clientX;
		const y0 = e.clientY;
		const left0 = view.scrollLeft;
		const top0 = view.scrollTop;
		let moved = false;
		/** @param {PointerEvent} m */
		const move = (m) => {
			if (!moved && Math.hypot(m.clientX - x0, m.clientY - y0) < 5) return;
			moved = panning = true;
			view.scrollLeft = left0 - (m.clientX - x0);
			view.scrollTop = top0 - (m.clientY - y0);
		};
		const up = () => {
			window.removeEventListener('pointermove', move);
			window.removeEventListener('pointerup', up);
			panning = false;
			if (!moved) return;
			const swallow = (/** @type {Event} */ c) => (c.stopPropagation(), c.preventDefault());
			window.addEventListener('click', swallow, true);
			setTimeout(() => window.removeEventListener('click', swallow, true), 0);
		};
		window.addEventListener('pointermove', move);
		window.addEventListener('pointerup', up);
	}
	/** close every section, so only the first level shows, and zoom out until all of it is in view; a cursor inside one moves to the section that held it */
	async function collapseAll() {
		selected = [];
		const anc = cursor ? ancestorsOf(tree, cursor.id) : null;
		if (cursor && anc?.length) cursor = { id: anc[0], place: 'after' };
		// then zoom out to the level that fits the whole (now one-level) layout, so every top-level section is in view
		await tick();
		wantedCell = levels[levels.length - 1];
		await tick();
		if (stage) {
			stage.scrollLeft = 0;
			stage.scrollTop = 0;
		}
	}
	/** whether a paragraph can be inserted at a gap (see `paragraphFits`) @param {GapSpec} z */
	export function canHoldParagraph(z) {
		return paragraphFits(z);
	}

	/** exactly one bubble in the layout */
	let lone = $derived(!exploded && layout.length === 1);
	/** only one bubble: its three gaps (before, after, and beyond it) always show their add buttons, not just on hover */
	let solo = $derived(!!onadd && !exploded && layout.length === 1);
	/** every gap line on show (with the plus on each, when there is an `onadd`) */
	let guides = $derived.by(() => {
		if (solo) {
			const only = layout[0];
			const id = only.node.kind === 'section' ? only.node.id : only.node.paragraph.id;
			/** @type {GapSpec[]} */
			const specs = [{ id, place: 'before' }, { id, place: 'after' }, ...(only.node.kind === 'section' ? /** @type {GapSpec[]} */ ([{ id, place: 'inside' }]) : [])];
			return specs.map(lineFor).filter((g) => g !== null);
		}
		return gapLine ? [gapLine] : [];
	});

	/**
	 * Exploded: the trail of a crawler that opens every section and subsection. Each list of
	 * siblings is walked cell to cell, starting from the section that owns it (a section opens
	 * orthogonally to its own row or column). Every step is a tube from one cell centre to the
	 * next, blending from one section's colour to the other's; each level of nesting is a branch
	 * @typedef {{ x1: number, y1: number, x2: number, y2: number, from: string }} Tube
	 */
	let tubes = $derived.by(() => {
		if (!exploded) return /** @type {Tube[]} */ ([]);
		/** @typedef {{ row: number, col: number, color: string }} Stop */
		/** @type {Map<string, { owner: Stop | null, depth: number, stops: Stop[] }>} */
		const lists = new Map();
		for (const p of layout) {
			const key = p.parent?.id ?? '';
			let list = lists.get(key);
			if (!list) {
				const owner = p.parent ? { row: p.parent.row, col: p.parent.col, color: colors.get(p.parent.id) ?? 'var(--color-taupe3)' } : null;
				list = { owner, depth: p.depth, stops: [] };
				lists.set(key, list);
			}
			// a section's paragraphs share one cell: one stop for them
			if (!list.stops.some((t) => t.row === p.row && t.col === p.col)) {
				list.stops.push({ row: p.row, col: p.col, color: p.color ?? 'var(--color-taupe3)' });
			}
		}
		/** @type {Tube[]} */
		const out = [];
		const centre = (/** @type {number} */ n) => n * PITCH + PITCH / 2;
		for (const { owner, stops } of lists.values()) {
			// the top-level sections are not linked to each other: each opens downward on its own
			if (!owner) continue;
			const trail = [owner, ...stops];
			for (let i = 0; i + 1 < trail.length; i++) {
				const a = trail[i];
				const b = trail[i + 1];
				out.push({ x1: centre(a.col), y1: centre(a.row), x2: centre(b.col), y2: centre(b.row), from: owner.color });
			}
		}
		// a top-level section with nothing beneath it has no tube of its own: draw it as a zero-length
		// tube (just its two end caps)
		const touched = new Set(out.flatMap((t) => [`${t.y1},${t.x1}`, `${t.y2},${t.x2}`]));
		for (const p of layout) {
			if (p.parent || touched.has(`${centre(p.row)},${centre(p.col)}`)) continue;
			const color = p.color ?? 'var(--color-taupe3)';
			out.push({ x1: centre(p.col), y1: centre(p.row), x2: centre(p.col), y2: centre(p.row), from: color });
		}
		return out;
	});

	/** exploded: the tubes grouped by colour (the colour of the section a tube leaves) */
	let tubeGroups = $derived.by(() => {
		/** @type {Map<string, Tube[]>} */
		const groups = new Map();
		for (const t of tubes) groups.set(t.from, [...(groups.get(t.from) ?? []), t]);
		/** @param {Tube[]} list */
		const path = (list) => list.map((t) => `M${t.x1} ${t.y1}L${t.x2} ${t.y2}`).join('');
		// each successive top-level section's tube sits RIM lower, and RIM further right, than the one before it
		// (so every tube's coloured border shows instead of stacking on the others')
		/** @type {Map<string, number>} */
		const topIndex = new Map();
		tree.filter((n) => n.kind === 'section').forEach((n, i) => {
			const c = n.kind === 'section' ? colors.get(n.id) : undefined;
			if (c && !topIndex.has(c)) topIndex.set(c, i);
		});
		return [...groups.entries()].map(([color, list], i) => {
			const offset = (topIndex.get(color) ?? 0) * RIM;
			// elongate the root of the tube (the top-level section's own end) upward by the offset, so the
			// tops of all the tubes line up at the same height whatever their offsets
			const roots = layout
				.filter((p) => p.depth === 0 && p.color === color)
				.map((p) => `M${p.col * PITCH + PITCH / 2} ${p.row * PITCH + PITCH / 2}L${p.col * PITCH + PITCH / 2} ${p.row * PITCH + PITCH / 2 - offset}`)
				.join('');
			return { color, id: `rim-${i}`, path: path(list) + roots, dy: offset, dx: offset };
		});
	});

	/** exploded: how far the lowest tube is pushed down; past the slack at the foot of the last cell it needs another row */
	let extraY = $derived(Math.max(0, ...tubeGroups.map((g) => g.dy)));
	let extraX = $derived(Math.max(0, ...tubeGroups.map((g) => g.dx)));
	let rowCount = $derived(Math.max(1, ...layout.map((p) => p.row + 1)) + (exploded && extraY > (PITCH - TUBE) / 2 - RIM ? 1 : 0));
	let colCount = $derived(Math.max(1, ...layout.map((p) => p.col + 1)) + (exploded && extraX > (PITCH - TUBE) / 2 - RIM ? 1 : 0));

	// ---- Fitting and zooming ----
	// The pane only ever shows whole cells. Every zoom level is a cell size (px) at which a whole
	// number of cells fills the pane's width (the stage is trimmed to whole rows too), so scrolling
	// snaps cell by cell and no bubble is ever cut off. The farthest-out level fits the whole layout.
	let paneW = $state(0);
	let paneH = $state(0);
	/** padding kept clear around the view: this fraction of the pane's width and height, split evenly over both sides */
	const PADDING = 0.2;
	/** the room the stage may use inside the pane's padding */
	let roomW = $derived(paneW * (1 - PADDING));
	let roomH = $derived(paneH * (1 - PADDING));
	/** the cell size the person last chose (px); the nearest available level is used */
	let wantedCell = $state(IDEAL_CELL);

	/** available cell sizes, largest (most zoomed in) first */
	let levels = $derived.by(() => {
		if (roomW < 50 || roomH < 50) return [IDEAL_CELL];
		const smallest = Math.min(roomW / colCount, roomH / rowCount, MAX_CELL);
		/** @type {number[]} */
		const out = [];
		for (let n = 1; ; n++) {
			const c = Math.min(roomW / n, roomH, MAX_CELL);
			if (c < smallest - 0.5) break;
			if (!out.length || out[out.length - 1] - c > 1) out.push(c);
		}
		// the last level is exactly the size that fits the whole layout (a near-duplicate is replaced by it)
		if (out.length && out[out.length - 1] - smallest <= 1) out.pop();
		out.push(smallest);
		return out;
	});
	let levelIndex = $derived.by(() => {
		let best = 0;
		levels.forEach((c, i) => {
			if (Math.abs(c - wantedCell) < Math.abs(levels[best] - wantedCell)) best = i;
		});
		return best;
	});
	let cell = $derived(exploded ? levels[levels.length - 1] : levels[levelIndex]);
	let zoom = $derived(cell / PITCH);
	// the whole space between two bubbles is a drop zone: each side reaches the gap's midpoint
	$effect(() => {
		dd.reach = Math.ceil((GAP * zoom) / 2) + 2;
	});
	/** The plus's on-screen diameter: small (at most 20px), shrinking with the zoom so it always leaves a margin
	 * (6px a side) between itself and the bubbles either side of the gap. */
	let plusSize = $derived(Math.max(14, Math.min(20, GAP * zoom - 12)));
	/** the stage's scroll position (px), so the plus (drawn outside the stage) follows the scene */
	let scrollX = $state(0);
	let scrollY = $state(0);
	/** Where the plus is drawn, in px from the stage's top-left: the gap line's middle, scaled and scrolled.
	 * It is hidden when that is scrolled out of the stage.
	 * @param {{ id: string, place: 'before' | 'after' | 'inside', left: number, top: number, width: number, height: number, cx: number, cy: number }} z */
	function plusSpot(z) {
		const { cx, cy } = z;
		const x = cx * zoom - scrollX;
		const y = cy * zoom - scrollY;
		const slack = plusSize / 2 + 1;
		return { x, y, visible: x >= -slack && y >= -slack && x <= stageW + slack && y <= stageH + slack };
	}

	// the hovered gap goes when the scene moves under the pointer, a drag starts or editing ends
	$effect(() => {
		void zoom;
		if (!onadd || exploded || dd.dragId) gap.clear();
	});
	// a new gap starts with the popup closed
	$effect(() => {
		void gap.target?.id;
		void gap.target?.place;
		plusOpen = null;
	});
	/** the stage: as many whole cells as fit, no more than the layout has */
	let stageW = $derived(Math.min(Math.floor(roomW / cell + 0.01), colCount) * cell);
	let stageH = $derived(Math.min(Math.floor(roomH / cell + 0.01), rowCount) * cell);

	/** @type {HTMLDivElement | undefined} */
	let stage = $state();

	/** Step to a more zoomed-in (+1) or zoomed-out (-1) level, keeping the top-left cell in place. @param {number} dir */
	async function zoomBy(dir) {
		const next = Math.max(0, Math.min(levels.length - 1, levelIndex - dir));
		if (next === levelIndex || !stage) return;
		const x = stage.scrollLeft / cell;
		const y = stage.scrollTop / cell;
		wantedCell = levels[next];
		await tick();
		if (!stage) return;
		stage.scrollLeft = Math.round(x) * cell;
		stage.scrollTop = Math.round(y) * cell;
	}

	let wheelAt = 0;
	/** Ctrl/⌘ + wheel (and trackpad pinch) zooms, one level at a time. @param {HTMLElement} node */
	function wheelZoom(node) {
		/** @param {WheelEvent} e */
		const onwheel = (e) => {
			if (!e.ctrlKey && !e.metaKey) return;
			e.preventDefault();
			if (exploded) return;
			const now = Date.now();
			if (now - wheelAt < 150 || e.deltaY === 0) return;
			wheelAt = now;
			zoomBy(e.deltaY < 0 ? 1 : -1);
		};
		node.addEventListener('wheel', onwheel, { passive: false });
		return { destroy: () => node.removeEventListener('wheel', onwheel) };
	}

	/** Scroll a bubble into the view. @param {Element | null | undefined} el */
	function reveal(el) {
		el?.scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'nearest' });
	}

	/**
	 * Open or close the section `id` at `depth` (closing also closes everything beneath it).
	 * @param {number} depth @param {string} id @param {HTMLElement} el
	 */
	async function toggle(depth, id, el) {
		onfocusitem?.(id);
		selected = selected[depth] === id ? selected.slice(0, depth) : [...selected.slice(0, depth), id];
		await tick();
		reveal(el);
	}

	// ---- Synced with the other views: report the clicked bubble, and open centred on the shared one ----
	let revealed = false;
	$effect(() => {
		if (revealed || !host || tree.length === 0 || !focusId) return;
		const id = untrack(() => focusId) ?? '';
		const anc = ancestorsOf(tree, id);
		if (!anc) return;
		revealed = true;
		const isSection = paragraphs.some((p) => p.id === id && (p.level ?? 0) > 0);
		selected = isSection ? [...anc, id] : anc;
		tick().then(() => host?.querySelector(`[data-node="${CSS.escape(id)}"]`)?.scrollIntoView({ behavior: 'instant', block: 'center', inline: 'center' }));
	});

	/**
	 * Open a section and every section around it (`ids`, outermost first), and bring it into view.
	 * @param {string[]} ids
	 */
	export async function openPath(ids) {
		selected = ids;
		await tick();
		reveal(host?.querySelector(`[data-node="${CSS.escape(ids[ids.length - 1] ?? '')}"]`));
	}

	// ---- Reading modal ----
	/** every paragraph in document order, with its section's colour (for previous / next in the modal) */
	let flat = $derived.by(() => {
		/** @type {{ id: string, text: string, title: string, description: string, index: string | number, color: string, path: string[] }[]} */
		const out = [];
		/** @param {SectionChild[]} list @param {string} color @param {string[]} path the sections around the list, outermost first */
		const walk = (list, color, path) => {
			for (const n of list) {
				if (n.kind === 'section') walk(n.children, colors.get(n.id) ?? color, [...path, n.id]);
				else out.push({ id: n.paragraph.id, text: n.paragraph.text, title: /** @type {any} */ (n.paragraph).title ?? '', description: /** @type {any} */ (n.paragraph).description ?? '', index: n.paragraphIndex, color, path });
			}
		};
		walk(tree, 'var(--color-taupe3)', []);
		return out;
	});

	/** paragraph id -> its text as HTML with hoverable footnote marks (only paragraphs that have any) */
	let notes = $derived(new Map(flat.flatMap((f) => { const html = renderFootnoteMarks(f.text, defs, f.id); return html ? [[f.id, html]] : []; })));

	/** the paragraph shown in the modal (its id), or null */
	/** @type {string | null} */
	let openId = $state(null);
	let current = $derived(flat.find((f) => f.id === openId) ?? null);
	let currentIdx = $derived(flat.findIndex((f) => f.id === openId));
	/** @type {HTMLDivElement | undefined} */
	let panel = $state();
	let closing = false;
	/** whether the modal is the editor (double-click in editing mode) rather than the reader, and its draft */
	let editMode = $state(false);
	let draftTitle = $state('');
	let draftDescription = $state('');
	let draftBody = $state('');
	/** @type {HTMLInputElement | undefined} */
	let titleInput = $state();
	/** @type {HTMLTextAreaElement | undefined} */
	let bodyInput = $state();
	/** the modal is a square this fraction of the window's shorter side, whatever the zoom */
	const MODAL_FRACTION = 0.75;
	const DURATION = 380;
	/** the modal's size, from the window rather than the bubble */
	let modalW = $state(0);
	let modalH = $state(0);
	/** the bubble's corner radius (5rem on a SIZE bubble) kept in proportion at the modal's size */
	let modalRadius = $derived((Math.min(modalW, modalH) * 80) / SIZE);
	let modalPad = $derived(modalRadius * 0.4);

	/** the text scrolls; an ellipsis shows at the foot while there is more below */
	/** @type {HTMLDivElement | undefined} */
	let textBox = $state();
	let more = $state(false);
	function measureMore() {
		if (!textBox) return;
		more = textBox.scrollTop + textBox.clientHeight < textBox.scrollHeight - 2;
	}
	$effect(() => {
		// re-measure when the text or the modal's size changes
		void [current?.id, modalW, modalH, textBox];
		if (!textBox) return;
		textBox.scrollTop = 0;
		tick().then(measureMore);
	});

	/** @type {ReturnType<typeof setTimeout> | undefined} */
	let clickTimer;
	/**
	 * A click on a section bubble opens or closes it. Where a double-click edits the title (`onrename`), the
	 * toggle waits a moment for a second click: opening the section moves the grid, and the double-click would be lost.
	 * @param {number} depth @param {string} id @param {HTMLElement} el
	 */
	function clickSection(depth, id, el) {
		if (!onrename && !onwrite) return void toggle(depth, id, el);
		clearTimeout(clickTimer);
		clickTimer = setTimeout(() => toggle(depth, id, el), 260);
	}
	/** a title edit waiting for writing mode to be on (a double-click while reading) @type {string | null} */
	let pendingTitleEdit = null;
	/** @param {string} id */
	function editTitle(id) {
		clearTimeout(clickTimer);
		if (!onrename) {
			// reading: ask the page for writing mode, which then opens the title for editing
			pendingTitleEdit = id;
			return onwrite?.(id);
		}
		titleEditId = id;
	}
	$effect(() => {
		if (!onrename || !pendingTitleEdit) return;
		titleEditId = pendingTitleEdit;
		pendingTitleEdit = null;
	});

	// ---- A section's title edited in place (double-click, or straight after adding the section) ----
	/** @type {string | null} */
	let titleEditId = $state(null);
	/** @param {string} id @param {string | null} text */
	function finishTitle(id, text) {
		if (titleEditId === id) titleEditId = null;
		const changed = text !== null && text.trim() !== '';
		if (changed) onrename?.({ id, title: /** @type {string} */ (text).trim() });
		onleave?.(id, changed);
	}

	// ---- A section's settings modal: the bubble grown to a form, in the bubble's own colours (the cog on a hovered bubble) ----
	/** @type {{ id: string, color: string, index: string, mix: number } | null} */
	let sectionModal = $state(null);
	let draftSectionTitle = $state('');
	/** @type {HTMLInputElement | undefined} */
	let sectionTitleInput = $state();

	/** @param {string} id */
	async function openSectionSettings(id) {
		if (openId || sectionModal || closing) return;
		const p = layout.find((q) => q.node.kind === 'section' && q.node.id === id);
		if (!p || p.node.kind !== 'section') return;
		const from = bubbleRect(id);
		draftSectionTitle = p.node.title;
		modalW = modalH = Math.min(window.innerWidth, window.innerHeight) * MODAL_FRACTION;
		sectionModal = { id, color: p.color ?? 'var(--color-taupe3)', index: `§${p.node.hierarchicalIndex}`, mix: p.open ? 28 : 10 };
		await tick();
		sectionTitleInput?.focus();
		sectionTitleInput?.select();
		morph(from, false);
	}

	async function closeSectionSettings() {
		if (!sectionModal || closing) return;
		closing = true;
		await morph(bubbleRect(sectionModal.id), true);
		sectionModal = null;
		closing = false;
	}

	function saveSectionSettings() {
		if (sectionModal && draftSectionTitle.trim()) onrename?.({ id: sectionModal.id, title: draftSectionTitle.trim() });
		closeSectionSettings();
	}

	/** @param {string} id */
	function bubbleRect(id) {
		return host?.querySelector(`[data-node="${CSS.escape(id)}"]`)?.getBoundingClientRect() ?? null;
	}

	/** Grow or shrink the panel between the bubble's rectangle and its own. @param {DOMRect | null} from @param {boolean} reverse */
	function morph(from, reverse) {
		if (!panel) return Promise.resolve();
		const to = panel.getBoundingClientRect();
		const frames = from
			? [
					{ transform: `translate(${from.left + from.width / 2 - (to.left + to.width / 2)}px, ${from.top + from.height / 2 - (to.top + to.height / 2)}px) scale(${from.width / to.width}, ${from.height / to.height})`, opacity: 0.6 },
					{ transform: 'none', opacity: 1 }
				]
			: [{ transform: 'scale(0.6)', opacity: 0 }, { transform: 'none', opacity: 1 }];
		const a = panel.animate(reverse ? frames.reverse() : frames, { duration: DURATION, easing: 'cubic-bezier(0.2, 0.8, 0.2, 1)', fill: 'both' });
		return a.finished.catch(() => {});
	}

	// ---- A section's trash: the choice of deleting just the section, or everything in it ----
	/** @type {{ id: string, left: number, top: number } | null} */
	let trashMenu = $state(null);
	/** @param {'only' | 'tree'} scope */
	function chooseDelete(scope) {
		const m = trashMenu;
		trashMenu = null;
		if (m) ondelete?.({ id: m.id, kind: 'section', scope });
	}

	// ---- A paragraph's text edited in place in its bubble (double-click, or straight after adding the paragraph) ----
	/** @type {string | null} */
	let inlineEditId = $state(null);
	/** where the caret goes when the in-place edit starts */
	let inlineCaret = 0;
	/** an in-place edit waiting for writing mode to be on (a double-click while reading) @type {{ id: string, caret: number } | null} */
	let pendingEdit = null;

	/** @param {string} id @param {number} caret */
	function editInPlace(id, caret) {
		if (!onedit) {
			pendingEdit = { id, caret };
			return onwrite?.(id);
		}
		inlineCaret = caret;
		inlineEditId = id;
	}
	$effect(() => {
		if (!onedit) {
			inlineEditId = null; // leaving writing mode drops an open editor
			return;
		}
		if (!pendingEdit) return;
		inlineCaret = pendingEdit.caret;
		inlineEditId = pendingEdit.id;
		pendingEdit = null;
	});

	/** @param {string} id @param {string | null} text */
	function finishInline(id, text) {
		if (inlineEditId === id) inlineEditId = null;
		if (text !== null) {
			const f = flat.find((x) => x.id === id);
			onedit?.({ id, text, title: f?.title ?? '', description: f?.description ?? '' });
		}
		onleave?.(id, text !== null);
	}

	/** @param {string} id @param {boolean} [edit] */
	async function openModal(id, edit = false) {
		if (openId) return;
		const from = bubbleRect(id);
		const f = flat.find((x) => x.id === id);
		editMode = edit;
		draftTitle = f?.title ?? '';
		draftDescription = f?.description ?? '';
		draftBody = f?.text ?? '';
		modalW = modalH = Math.min(window.innerWidth, window.innerHeight) * MODAL_FRACTION;
		closing = false;
		openId = id;
		await tick();
		(edit ? titleInput : panel)?.focus();
		morph(from, false);
	}

	function saveEdit() {
		if (openId && editMode) onedit?.({ id: openId, text: draftBody, title: draftTitle.trim(), description: draftDescription.trim() });
		closeModal();
	}

	async function closeModal() {
		if (!openId || closing) return;
		closing = true;
		// open the sections around the paragraph and bring its bubble into view, so the modal shrinks into it
		if (current) {
			selected = current.path;
			await tick();
			host?.querySelector(`[data-node="${CSS.escape(openId)}"]`)?.scrollIntoView({ behavior: 'instant', block: 'nearest', inline: 'nearest' });
			await tick();
		}
		await morph(bubbleRect(openId), true);
		openId = null;
		editMode = false;
		closing = false;
	}

	/** @param {number} dir */
	function step(dir) {
		const next = flat[currentIdx + dir];
		if (next) openId = next.id;
	}

	/** @param {KeyboardEvent} e */
	function onkeydown(e) {
		if (trashMenu && e.key === 'Escape') {
			trashMenu = null;
			e.preventDefault();
			return;
		}
		if (sectionModal) {
			if (e.key === 'Escape') closeSectionSettings();
			else if (e.key === 'Enter') saveSectionSettings();
			else return;
			e.preventDefault();
			return;
		}
		if (placing && !openId && !(e.target instanceof Element && e.target.closest('input, textarea, select, [contenteditable]')) && !e.metaKey && !e.ctrlKey && !e.altKey) {
			const dir = { ArrowLeft: 'left', ArrowRight: 'right', ArrowUp: 'up', ArrowDown: 'down' }[e.key];
			if (dir && moveCursor(/** @type {'left' | 'right' | 'up' | 'down'} */ (dir))) e.preventDefault();
			return;
		}
		if (!openId) return;
		if (editMode) {
			// the fields own the keys; only Escape (cancel) and Ctrl/Cmd+Enter (save) are the modal's
			if (e.key === 'Escape') closeModal();
			else if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) saveEdit();
			else return;
			e.preventDefault();
			return;
		}
		if (e.key === 'Escape') closeModal();
		else if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') step(-1);
		else if (e.key === 'ArrowRight' || e.key === 'ArrowDown') step(1);
		else return;
		e.preventDefault();
	}

	/** Split a section title at its first colon: the title keeps the colon, the rest is the subtitle. @param {string} text */
	function splitTitle(text) {
		const i = text.indexOf(':');
		return i === -1 ? { title: text, subtitle: '' } : { title: text.slice(0, i + 1), subtitle: text.slice(i + 1).trim() };
	}
</script>

<DropTip {dd} />

<div
	role="presentation"
	onpointerleave={() => gap.leave()}
	ondragover={dragOver}
	ondrop={drop}
	ondragleave={(e) => {
		if (!e.currentTarget.contains(/** @type {Node | null} */ (e.relatedTarget))) dd.drop = null;
	}}
	class="relative flex h-full w-full items-center justify-center overflow-hidden bg-taupe1" bind:this={host} bind:clientWidth={paneW} bind:clientHeight={paneH} use:wheelZoom>
	{#if !tree.length}
		<p class="text-sm text-gray-500">{empty}</p>
	{:else}
		<!-- a lone bubble (in every mode) sits two thirds of the way up the pane: its middle a third of the pane's height from the top -->
		<div class="relative" style={lone ? `transform: translateY(-${Math.round(paneH / 6)}px)` : ''}>
		<div
			bind:this={stage}
			onscroll={() => stage && ((scrollX = stage.scrollLeft), (scrollY = stage.scrollTop))}
			class="overflow-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
			onpointerdown={startPan}
			style="width:{stageW}px;height:{stageH}px;scroll-snap-type:{panning ? 'none' : 'both mandatory'};{placing ? `cursor:${panning ? 'grabbing' : 'grab'};` : ''}"
		>
		<div class="relative" style="width:{colCount * PITCH}px;height:{rowCount * PITCH}px;zoom:{zoom}">
			{#if exploded}
				<!-- exploded: each section's whole trail is a single stroke (a thick line with round end caps)
				     in its colour at half opacity, so joints and branches are not painted twice. Strokes of
				     different colours blend where they cross. -->
				<svg class="pointer-events-none absolute inset-0" width={colCount * PITCH} height={rowCount * PITCH}>
					{#each tubeGroups as g (g.id)}
						<path d={g.path} transform="translate({g.dx} {g.dy})" fill="none" stroke={g.color} stroke-opacity={STROKE_OPACITY} stroke-width={TUBE} stroke-linecap="round" stroke-linejoin="round" />
					{/each}

					<!-- Each section's whole trail also gets its own opaque outline in the pure colour: its stroke
					     grown by RIM, minus its own interior, so there is no line inside its own branches. The
					     outline stays visible where the stroke overlaps another section's. -->
					<defs>
						{#each tubeGroups as g (g.id)}
							<mask id={g.id} maskUnits="userSpaceOnUse" x="-500" y="-500" width={colCount * PITCH + 1000} height={rowCount * PITCH + 1000}>
								<rect x="-500" y="-500" width={colCount * PITCH + 1000} height={rowCount * PITCH + 1000} fill="black" />
								<path d={g.path} fill="none" style="stroke: var(--color-taupe1)" stroke-width={TUBE + 2 * RIM} stroke-linecap="round" />
								<path d={g.path} fill="none" stroke="black" stroke-width={TUBE} stroke-linecap="round" />
							</mask>
						{/each}
					</defs>
					{#each tubeGroups as g (g.id)}
						<path d={g.path} transform="translate({g.dx} {g.dy})" fill="none" stroke={g.color} stroke-width={TUBE + 2 * RIM} stroke-linecap="round" mask="url(#{g.id})" />
					{/each}
				</svg>
			{:else}
				<!-- connectors run from each section to its children, behind the bubbles -->
				<svg class="pointer-events-none absolute inset-0" width={colCount * PITCH} height={rowCount * PITCH}>
					{#each layout as p (p.node.kind === 'section' ? p.node.id : p.node.paragraph.id)}
						{#if p.parent}
							<line
								x1={p.parent.col * PITCH + PITCH / 2}
								y1={p.parent.row * PITCH + PITCH / 2}
								x2={p.col * PITCH + PITCH / 2}
								y2={p.row * PITCH + PITCH / 2}
								stroke="var(--color-taupe3)"
								stroke-width="2"
							/>
						{/if}
					{/each}
				</svg>
			{/if}

			{#each exploded ? [] : layout as p (p.node.kind === 'section' ? p.node.id : p.node.paragraph.id)}
				{@const tint = p.color ?? 'var(--color-taupe3)'}
				{@const style = `left:${p.col * PITCH + GAP / 2}px;top:${p.row * PITCH + GAP / 2}px;width:${SIZE}px;height:${SIZE}px;--c:${tint};scroll-snap-align:start;scroll-margin:${GAP / 2}px`}
				{#if p.node.kind === 'section'}
					{@const t = splitTitle(p.node.title)}
					{@const node = p.node}
					<div
						data-node={node.id}
						data-section
						role="button"
						tabindex="0"
						aria-expanded={p.open}
						{style}
						{...titleEditId === node.id ? {} : dragAttrs(node.id, 'section', p.horizontal)}
						onclick={(e) => titleEditId !== node.id && clickSection(p.depth, node.id, e.currentTarget)}
						ondblclick={onrename || onwrite ? () => editTitle(node.id) : undefined}
						onkeydown={(e) => {
							if ((e.key === 'Enter' || e.key === ' ') && e.target === e.currentTarget) {
								e.preventDefault();
								toggle(p.depth, node.id, e.currentTarget);
							}
						}}
						class="group absolute flex cursor-pointer flex-col items-center gap-1 overflow-hidden rounded-[5rem] border-10 border-(--c) px-8 py-6 text-center text-dark transition-[left,top] focus:outline-none {dd.dragId === node.id ? 'opacity-40' : ''} {mergeClasses(node.id, p.horizontal)} {p.open
							? 'bg-[color-mix(in_srgb,var(--c)_28%,var(--color-taupe1))] font-semibold'
							: 'bg-[color-mix(in_srgb,var(--c)_10%,var(--color-taupe1))] hover:bg-[color-mix(in_srgb,var(--c)_20%,var(--color-taupe1))]'}"
					>
						<span class="mb-3 text-xs font-normal text-grey2">§{node.hierarchicalIndex}</span>
						<span class="flex min-h-0 min-w-0 flex-1 flex-col items-center justify-center break-words text-xl leading-snug">
							{#if titleEditId === node.id}
								<!-- double-clicked (or just added): the title is edited in place; Enter saves and adds a new section after it (a sibling), which opens for editing; leaving saves, Esc cancels -->
								<span data-placeholder="Untitled section" use:editable={{ text: node.title, onfinish: (v) => finishTitle(node.id, v), onenter: onadd && onnewitem ? (r) => askNew(node.id, 'section', r) : undefined }} class="max-w-full min-w-8 cursor-text rounded-md bg-taupe1/70 px-2 py-0.5 break-words outline-2 outline-(--c)"></span>
							{:else}
								<!-- long titles are cut off with an ellipsis rather than spilling out of the bubble -->
								<span class="max-w-full overflow-hidden {t.subtitle ? 'line-clamp-2' : 'line-clamp-3'}" title={node.title}>{#if t.title}{t.title}{:else}<span class="font-normal text-grey2 italic">Untitled section</span>{/if}</span>
								{#if t.subtitle}<span class="mt-1 line-clamp-1 max-w-full overflow-hidden text-sm font-normal text-grey2">{t.subtitle}</span>{/if}
							{/if}
						</span>
						<!-- the caret shows the open state, so only a section with something in it has one -->
						{#if node.children.length}
							<svg class="h-5 w-5 shrink-0 transition-transform {p.open ? 'rotate-90' : ''}" viewBox="0 0 20 20" fill="currentColor">
								<path d="M7.2 4.8a.75.75 0 011.06 0l4.5 4.5a.75.75 0 010 1.06l-4.5 4.5a.75.75 0 01-1.06-1.06L11.17 9.8 7.2 5.86a.75.75 0 010-1.06z" />
							</svg>
						{:else}
							<span class="h-5 w-5 shrink-0"></span>
						{/if}

						{#if (onrename || ondelete) && !exploded && titleEditId !== node.id}
							<!-- the bubble's menu: top right, shown on hover, a vertical stack: the settings cog, then the trash -->
							<div class="absolute top-[12%] right-[12%] z-10 flex flex-col gap-1 opacity-0 group-focus-within:opacity-100 group-hover:opacity-100">
								{#if onrename}
									<button type="button" aria-label="Section settings" use:tip={'Settings'} draggable="false" onclick={(e) => { e.stopPropagation(); openSectionSettings(node.id); }} ondblclick={(e) => e.stopPropagation()} class="inline-flex items-center justify-center rounded-full p-0.5 text-taupe5 hover:bg-taupe2"><Cog width={18} height={18} /></button>
								{/if}
								{#if ondelete}
									<button type="button" aria-label="Delete section" use:tip={'Delete'} draggable="false" data-trash-menu onclick={(e) => { e.stopPropagation(); const r = e.currentTarget.getBoundingClientRect(); trashMenu = trashMenu?.id === node.id ? null : { id: node.id, left: r.left, top: r.bottom + 4 }; }} ondblclick={(e) => e.stopPropagation()} class="inline-flex items-center justify-center rounded-full p-0.5 text-taupe5 hover:bg-taupe2"><TrashX width={18} height={18} /></button>
								{/if}
							</div>
						{/if}
					</div>
				{:else}
					{@const pid = p.node.paragraph.id}
					<div
						data-node={pid}
						tabindex="0"
						role="button"
						aria-label="Paragraph"
						onclick={() => onfocusitem?.(pid)}
						ondblclick={onedit || onwrite
							? (e) => editInPlace(pid, caretOffsetAt(e.currentTarget, e.clientX, e.clientY, p.node.kind === 'paragraph' ? p.node.paragraph.text : ''))
							: undefined}
						onkeydown={(e) => {
							if ((e.key === 'Enter' || e.key === ' ') && e.target === e.currentTarget) {
								e.preventDefault();
								if (onedit) editInPlace(pid, p.node.kind === 'paragraph' ? p.node.paragraph.text.length : 0);
								else openModal(pid);
							}
						}}
						{style}
						{...inlineEditId === pid ? {} : dragAttrs(pid, 'paragraph', p.horizontal)}
						class="group absolute flex {inlineEditId === pid ? 'cursor-text' : 'cursor-default'} flex-col gap-0.5 overflow-y-auto rounded-[5rem] border-10 border-(--c) bg-[color-mix(in_srgb,var(--c)_10%,var(--color-taupe1))] px-6 py-4 text-center text-sm focus:outline-none {dd.dragId === pid ? 'opacity-40' : ''} {mergeClasses(pid, p.horizontal)}"
					>
						<span class="mb-3 text-xs text-gray-500">{p.node.paragraphIndex}</span>
						{#if /** @type {any} */ (p.node.paragraph).title}<span class="mb-1 text-sm font-semibold">{/** @type {any} */ (p.node.paragraph).title}</span>{/if}
						{#if inlineEditId === pid}
							<!-- double-clicked: the text is edited in place; Enter or leaving saves, Esc cancels -->
							<p use:editable={{ text: p.node.paragraph.text, caret: inlineCaret, onfinish: (t) => finishInline(pid, t), onenter: onadd && onnewitem ? (r) => askNew(pid, 'paragraph', r) : undefined }} class="whitespace-pre-wrap outline-none"></p>
						{:else}
							<p class="md whitespace-pre-wrap">{#if notes.get(pid)}{@html onedit ? notes.get(pid) : emphasizeFirst(notes.get(pid) ?? '')}{:else if onedit}{p.node.paragraph.text}{:else}{@html plainFirst(p.node.paragraph.text)}{/if}</p>
						{/if}
						{#if !exploded && inlineEditId !== pid}
							<!-- the bubble's menu: top right, shown on hover, a vertical stack of buttons -->
							<div class="absolute top-[12%] right-[12%] z-10 flex flex-col gap-1 opacity-0 group-focus-within:opacity-100 group-hover:opacity-100">
								<button type="button" aria-label="Expand paragraph" use:tip={'Expand'} draggable="false" onclick={(e) => { e.stopPropagation(); openModal(pid); }} ondblclick={(e) => e.stopPropagation()} class="inline-flex items-center justify-center rounded-full p-0.5 text-taupe5 hover:bg-taupe2"><Fullscreen width={18} height={18} /></button>
								{#if onedit}
									<button type="button" aria-label="Edit paragraph" use:tip={'Edit title, description and text'} draggable="false" onclick={(e) => { e.stopPropagation(); openModal(pid, true); }} ondblclick={(e) => e.stopPropagation()} class="inline-flex items-center justify-center rounded-full p-0.5 text-taupe5 hover:bg-taupe2"><PencilEditCircle width={18} height={18} /></button>
								{/if}
								{#if ondelete}
									<button type="button" aria-label="Delete paragraph" use:tip={'Delete'} draggable="false" onclick={(e) => { e.stopPropagation(); ondelete({ id: pid, kind: 'paragraph' }); }} ondblclick={(e) => e.stopPropagation()} class="inline-flex items-center justify-center rounded-full p-0.5 text-taupe5 hover:bg-taupe2"><TrashX width={18} height={18} /></button>
								{/if}
							</div>
						{/if}
					</div>
				{/if}
			{/each}

			{#if onadd && !exploded && !dd.dragId}
				{#each zones as z (gapKey(z))}
					<div
						data-gapzone
						role="presentation"
						onpointerenter={(e) => gap.set({ id: z.id, place: z.place, axis: z.axis }, e)}
						onpointerleave={() => gap.leave()}
						class="absolute"
						style="left:{z.zl}px;top:{z.zt}px;width:{z.zw}px;height:{z.zh}px"
					></div>
				{/each}
			{/if}

			{#each guides as g (gapKey(g))}
				<div class="pointer-events-none absolute rounded-full bg-taupe3" style="left:{g.left}px;top:{g.top}px;width:{g.width}px;height:{g.height}px"></div>
			{/each}

			{#if placing}
				<!-- every gap is a target: click one to put the cursor there -->
				{#each slots as g (gapKey(g))}
					{@const vertical = g.width < g.height}
					<button
						type="button"
						aria-label="Insert here"
						onclick={() => (cursor = { id: g.id, place: g.place })}
						class="absolute cursor-pointer rounded-full hover:bg-taupe3/60"
						style="left:{vertical ? g.left - 24 : g.left}px;top:{vertical ? g.top : g.top - 24}px;width:{vertical ? g.width + 48 : g.width}px;height:{vertical ? g.height : g.height + 48}px"
					></button>
				{/each}
				{#if cursorLine}
					<div class="pointer-events-none absolute z-10 animate-pulse rounded-full bg-accent" style="left:{cursorLine.left - (cursorLine.width < cursorLine.height ? 2 : 0)}px;top:{cursorLine.top - (cursorLine.width < cursorLine.height ? 0 : 2)}px;width:{cursorLine.width + (cursorLine.width < cursorLine.height ? 4 : 0)}px;height:{cursorLine.height + (cursorLine.width < cursorLine.height ? 0 : 4)}px"></div>
				{/if}
			{/if}
		</div>
		</div>
		<div class="pointer-events-none absolute top-0 left-0 h-0 w-0">
				{#each onadd && !dd.dragId ? guides : [] as g (gapKey(g))}
			{@const spot = plusSpot(g)}
			{#if spot.visible}
			<!-- the plus sits on the gap line's middle at a constant on-screen size. It is drawn outside the
			     scrolling stage (positioned from the scene's coordinates and the scroll), so a gap on the scene's
			     edge still gets a whole plus, centred on its line. -->
					<div
						data-gapctl
						role="toolbar"
						aria-label="Add at this gap"
						tabindex="-1"
						class="pointer-events-auto absolute z-30 h-0 w-0"
						style="left:{spot.x}px;top:{spot.y}px"
						onpointerenter={() => gap.hold()}
						onpointerleave={() => {
							plusOpen = null;
							gap.leave();
						}}
					>
						<div class="absolute top-0 left-0 -translate-x-1/2 -translate-y-1/2">
							<button
								type="button"
								aria-label={paragraphFits(g) ? 'Add here' : 'Add a section here'}
								aria-haspopup={paragraphFits(g) ? 'menu' : undefined}
								aria-expanded={paragraphFits(g) ? plusOpen === gapKey(g) : undefined}
								onpointerenter={() => paragraphFits(g) && (plusOpen = gapKey(g))}
								onclick={() => (paragraphFits(g) ? (plusOpen = gapKey(g)) : add('section', g))}
								style="width:{plusSize}px;height:{plusSize}px"
								class="flex items-center justify-center rounded-full border-[3px] border-taupe3 bg-taupe1 p-px text-taupe4 hover:bg-taupe2 [&_svg]:h-full [&_svg]:w-full"
							>
								<Plus />
							</button>
							{#if plusOpen === gapKey(g)}
								<!-- the padding bridges the pointer from the plus to the popup -->
								<div role="menu" class="absolute top-full left-1/2 z-40 -translate-x-1/2 pt-2">
									<div class="flex items-center gap-1 raised rounded-md px-2 py-1 whitespace-nowrap shadow-lg">
										<button type="button" role="menuitem" aria-label="Paragraph sign" title={paragraphFits(g) ? 'Paragraph sign' : 'Paragraphs have to be inside a section'} disabled={!paragraphFits(g)} onclick={() => add('paragraph', g)} class="flex h-7 w-7 items-center justify-center rounded-md text-taupe5 enabled:hover:bg-taupe2 disabled:cursor-not-allowed disabled:opacity-30">
											<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="20" height="20" fill="currentColor"><path d="M4 10c0 3.31 2.69 6 6 6h2v4h2V6h2v14h2V6h3V4H10c-3.31 0-6 2.69-6 6m8 4h-2c-2.21 0-4-1.79-4-4s1.79-4 4-4h2z" /></svg>
										</button>
										<span class="text-xs font-semibold text-taupe5">OR</span>
										<button type="button" role="menuitem" aria-label="Section sign" title="Section sign" onclick={() => add('section', g)} class="flex h-7 w-7 items-center justify-center rounded-md text-taupe5 hover:bg-taupe2">
											<span class="text-xl leading-none font-semibold" style="font-family: Georgia, serif">§</span>
										</button>
										<span class="text-base font-semibold text-taupe5">?</span>
									</div>
								</div>
							{/if}
						</div>
					</div>
			{/if}
		{/each}
		</div>
		</div>

		{#if placing}
			<button type="button" onclick={collapseAll} aria-label="Collapse to the first level" use:tip={'Collapse to the first level'} data-tip-place="below" class="absolute top-3 right-3 z-20 rounded-xl border border-taupe3 bg-taupe2 p-1.5 text-dark hover:bg-taupe3"><ChevronsUp /></button>
		{/if}

		<!-- zoom controls (Ctrl/⌘ + wheel also zooms) -->
		<div class="absolute right-3 bottom-3 flex {exploded ? 'hidden' : ''} gap-1 rounded-xl border border-taupe3 bg-taupe1 p-1">
			<button aria-label="Zoom out" disabled={levelIndex >= levels.length - 1} onclick={() => zoomBy(-1)} class="rounded-lg p-1 text-dark hover:bg-taupe2 disabled:opacity-30"><Minus /></button>
			<button aria-label="Zoom in" disabled={levelIndex <= 0} onclick={() => zoomBy(1)} class="rounded-lg p-1 text-dark hover:bg-taupe2 disabled:opacity-30"><Plus /></button>
		</div>
	{/if}
</div>

<svelte:window {onkeydown} onpointerdown={(e) => trashMenu && !(e.target instanceof Element && e.target.closest('[data-trash-menu]')) && (trashMenu = null)} />

{#if trashMenu}
	<div role="menu" data-trash-menu class="fixed z-50 w-max raised rounded-md py-1 shadow-lg" style="left: {Math.max(4, Math.min(trashMenu.left, innerWidth - 340))}px; top: {trashMenu.top}px">
		<button role="menuitem" onclick={() => chooseDelete('only')} class="block w-full px-4 py-2 text-left text-sm text-dark hover:bg-taupe2">Delete just this section</button>
		<button role="menuitem" onclick={() => chooseDelete('tree')} class="block w-full px-4 py-2 text-left text-sm text-dark hover:bg-taupe2">Delete this section and all its descendants</button>
	</div>
{/if}

<FootnoteTip />

{#if current}
	<div class="fixed inset-0 z-50 flex items-center justify-center bg-dark/40" role="presentation" onclick={(e) => e.target === e.currentTarget && !editMode && closeModal()}>
		<div
			bind:this={panel}
			role="dialog"
			aria-modal="true"
			aria-label="Paragraph {current.index}"
			tabindex="-1"
			style="width:{modalW}px;height:{modalH}px;border-radius:{modalRadius}px;padding:{modalPad}px;padding-inline:calc({modalPad}px + var(--ta-mx, 0rem));--c:{current.color}"
			class="bubble-form relative flex flex-col overflow-hidden border-8 border-(--c) bg-[color-mix(in_srgb,var(--c)_10%,var(--color-taupe1))] text-dark shadow-2xl focus:outline-none"
		>
			<span class="mb-4 text-center text-sm text-gray-500">{current.index}</span>
			{#if editMode}
				<div class="flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
					<label class="flex flex-col gap-1 text-xs text-grey3">
						Title
						<input bind:this={titleInput} type="text" bind:value={draftTitle} class="rounded-xl px-3 py-1.5 text-base" />
					</label>
					<label class="flex flex-col gap-1 text-xs text-grey3">
						Description
						<textarea rows="2" bind:value={draftDescription} class="resize-none rounded-xl px-3 py-1.5 text-base"></textarea>
					</label>
					<label class="flex min-h-32 flex-1 flex-col gap-1 text-xs text-grey3">
						Body
						<textarea bind:this={bodyInput} bind:value={draftBody} use:noLineBreaks class="min-h-0 flex-1 resize-none rounded-xl px-3 py-2 text-base leading-relaxed"></textarea>
					</label>
				</div>
				<div class="mt-3 flex shrink-0 justify-center gap-2">
					<button type="button" onclick={closeModal} class="rounded-md px-3 py-1.5 text-sm text-dark hover:bg-taupe2">Cancel</button>
					<button type="button" onclick={saveEdit} class="rounded-md bg-dark px-3 py-1.5 text-sm font-medium text-taupe1 hover:bg-taupe5">Save</button>
				</div>
			{:else}
			{#if current.title}<h2 class="mb-1 text-center text-xl font-semibold">{current.title}</h2>{/if}
			{#if current.description}<p class="mb-4 text-center text-sm text-grey3 italic">{current.description}</p>{/if}
			<div bind:this={textBox} onscroll={measureMore} class="min-h-0 flex-1 overflow-y-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
				<p class="md para-text whitespace-pre-wrap text-xl leading-relaxed">{#if notes.get(current.id)}{@html emphasizeFirst(notes.get(current.id) ?? '')}{:else}{@html plainFirst(current.text)}{/if}</p>
			</div>
			{#if more}
				<div class="pointer-events-none -mt-8 h-8 shrink-0 bg-gradient-to-t from-[color-mix(in_srgb,var(--c)_10%,var(--color-taupe1))] to-transparent text-center text-xl leading-8 text-grey2" aria-hidden="true">…</div>
			{/if}
			{/if}
		</div>
	</div>
{/if}

{#if sectionModal}
	<!-- a section's settings: the bubble grown into a form, with the bubble's colour, background, border and proportions -->
	<div class="fixed inset-0 z-50 flex items-center justify-center bg-dark/40" role="presentation" onclick={(e) => e.target === e.currentTarget && closeSectionSettings()}>
		<div
			bind:this={panel}
			role="dialog"
			aria-modal="true"
			aria-label="Section settings"
			tabindex="-1"
			style="width:{modalW}px;height:{modalH}px;border-radius:{modalRadius}px;padding:{modalPad}px;--c:{sectionModal.color};--mix:{sectionModal.mix}%"
			class="bubble-form relative flex flex-col items-center overflow-hidden border-8 border-(--c) bg-[color-mix(in_srgb,var(--c)_var(--mix),var(--color-taupe1))] text-dark shadow-2xl focus:outline-none"
		>
			<span class="mb-4 text-center text-sm font-normal text-grey2">{sectionModal.index}</span>
			<form class="flex min-h-0 w-full flex-1 flex-col justify-center gap-3" onsubmit={(e) => { e.preventDefault(); saveSectionSettings(); }}>
				<label class="flex flex-col gap-1 text-xs text-grey3">
					Title
					<input bind:this={sectionTitleInput} type="text" placeholder="Untitled section" bind:value={draftSectionTitle} class="rounded-xl px-3 py-1.5 text-base" />
				</label>
				<div class="mt-3 flex shrink-0 justify-center gap-2">
					<button type="button" onclick={closeSectionSettings} class="rounded-md px-3 py-1.5 text-sm text-dark hover:bg-taupe2">Cancel</button>
					<button class="rounded-md bg-dark px-3 py-1.5 text-sm font-medium text-taupe1 hover:bg-taupe5">Save</button>
				</div>
			</form>
		</div>
	</div>
{/if}
