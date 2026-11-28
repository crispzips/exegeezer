<script>
	import { tick, untrack } from 'svelte';
	import { buildSections, ancestorsOf, countParagraphs } from '#lib/utilities/buildSections.js';
	import SplitPane from '#lib/components/SplitPane.svelte';
	import HierarchyMinimap from '#lib/components/HierarchyMinimap.svelte';
	import { colorSections } from '#lib/utilities/sectionColor.js';
	import EditMenu from '#lib/components/EditMenu.svelte';
	import { EditHover } from '#lib/utilities/editHover.svelte.js';
	import { caretOffsetAt, editable } from '#lib/utilities/editable.js';
	import GapMenu from '#lib/components/GapMenu.svelte';
	import { GapHover } from '#lib/utilities/gapHover.svelte.js';
	import DropTip from '#lib/components/DropTip.svelte';
	import MatterBubble from '#lib/components/MatterBubble.svelte';
	import { DragDrop } from '#lib/utilities/dragDrop.svelte.js';
	import { tip } from '#lib/utilities/menuTip.svelte.js';
	import { dropAllowed } from '#lib/utilities/editText.js';
	import { allRows, moveAlong, moveOut, moveAcross, topmostInView } from '#lib/utilities/readerNav.js';
	import FootnoteTip from '#lib/components/FootnoteTip.svelte';
	import { definitionsOf, emphasizeFirst, plainFirst, renderFootnoteMarks } from '#lib/utilities/renderMarkdown.js';
	import CommentBubble from '#lib/components/CommentBubble.svelte';
	import { rowHeights } from '#lib/utilities/rowHeights.js';
	import { useCommentEditor } from '#lib/utilities/commentEditor.svelte.js';
	import { isCommentClick } from '#lib/utilities/comments.js';
	import { QuoteRightAlt } from '@boxicons/svelte';

	/**
	 * Hierarchical view: every header becomes a container (a large button labelled
	 * with the section title). Containers sit side by side in a row. Clicking one
	 * opens it: the container fills with its section's colour (the same colour the
	 * minimaps use) and its content appears in a panel beneath the row, outlined in
	 * that colour. Sub-sections appear as another row of containers inside the panel.
	 *
	 * @type {{
	 *   paragraphs: { id: string, originalIndex: number, text: string, level?: number }[],
	 *   matter?: { front: { id: string, title: string, paragraphs: { id: string, text: string, level?: number }[] }[], back: { id: string, title: string, paragraphs: { id: string, text: string, level?: number }[] }[] },
	 *   focusId?: string | null,
	 *   onfocusitem?: (id: string) => void,
	 *   startEditId?: string | null,
	 *   onstartedit?: () => void,
	 *   empty?: string,
	 *   onnewitem?: (id: string, rect: DOMRect) => void,
	 *   onleave?: (id: string, changed: boolean) => void,
	 *   ondelete?: (req: { id: string, kind: 'paragraph' | 'section', scope?: 'only' | 'tree' }) => void,
	 *   onexpand?: (req: { id: string, kind: 'paragraph' | 'section', from: DOMRect }) => void,
	 *   comments?: import('#lib/utilities/comments.js').AnchoredComment[],
	 *   oncomment?: (id: string) => void,
	 *   picked?: Set<string>
	 * }}
	 *
	 * With `comments` (commenting mode), the comments on a bubble hang beneath it, one under another and as wide as it
	 * is (so paragraph bubbles don't widen on focus, and an open section with comments keeps a closed one's width at
	 * least), and a column too tall for its row scrolls. A click on a paragraph bubble (or Enter on it) goes to `oncomment`; a click on a section
	 * bubble still opens it. Both kinds have a button on their corner, shown on hover, that goes to `oncomment`.
	 *
	 * The last row, where most paragraphs are, takes all the height it can: each row above it is only as tall as its
	 * largest section bubble. A click (or Enter) on a paragraph bubble closes the section open beside it, so that the
	 * paragraph's row becomes the last. A row above still grows to show everything in it, as far as the pane allows, when
	 * the keyboard moves the cursor onto one of its paragraphs, or while a comment on one of its bubbles is being written.
	 *
	 * With `ondelete`, every bubble is editable: hovering a paragraph or section bubble
	 * outlines it and floats an editor menu above it.
	 *
	 * With `onmove`, bubbles can be dragged: onto the edge of a bubble or the space between
	 * bubbles (a violet line) to move them there, or onto the first or second half of a
	 * bubble of the same kind to prepend or append (merge) it. A section drags with its contents.
	 */
	let { paragraphs, matter = undefined, focusId = null, onfocusitem = undefined, startEditId = null, onstartedit = undefined, empty = 'No text yet.', ondelete = undefined, onexpand = undefined, onmove = undefined, oninject = undefined, onedit = undefined, onnewitem = undefined, onwrite = undefined, onrename = undefined, onleave = undefined, comments = undefined, oncomment = undefined, picked = undefined } = $props();

	/** the comment being pointed at: the bubbles it is about are marked */
	/** @type {import('#lib/utilities/comments.js').AnchoredComment | null} */
	let pointed = $state.raw(null);
	let marked = $derived(new Set(pointed ? [pointed.anchorId, ...pointed.targetIds] : []));
	/** each row's run of bubbles */
	/** @type {HTMLDivElement[]} */
	let rowItems = $state([]);

	/** @param {SectionChild} node */
	const nodeId = (node) => (node.kind === 'section' ? node.id : node.paragraph.id);
	/** the comments on each bubble, by its id */
	let notesOn = $derived(Map.groupBy(comments ?? [], (c) => c.anchorId));
	const editor = useCommentEditor();

	// ---- Row heights: the rows above the last are as tall as their section bubbles, and the last takes the rest ----
	/** a row's height until it has been measured, and what the last row keeps, if there is room, when another grows */
	const ROW_H = 150;
	/** the height of a row with no section bubble to measure, and the least the last row is shrunk to */
	const MIN_ROW_H = 96;
	/** the divider between two rows */
	const HANDLE_H = 4;
	/** how long after a click the rows wait to move, so that nothing shifts under a second click */
	const SETTLE_MS = 300;
	/** the height of all the rows together */
	let rowsHeight = $state(0);
	/** each row's height, once worked out */
	let heights = $state.raw(/** @type {number[]} */ ([]));
	/** the bubble whose row is the active one @type {string | null} */
	let activeId = $state(null);

	/**
	 * Take a measurement with every box in a row let out to its full height, leaving the boxes scrolled as they were.
	 * @template T
	 * @param {HTMLElement} items the row's run of bubbles
	 * @param {() => T} measure
	 */
	function letOut(items, measure) {
		const scrolled = Array.from(items.querySelectorAll('[data-front], [data-column], [data-node]'), (el) => ({ el, top: el.scrollTop }));
		items.classList.add('hv-measure');
		const result = measure();
		items.classList.remove('hv-measure');
		for (const { el, top } of scrolled) el.scrollTop = top;
		return result;
	}

	/** The height at which row `d` shows all of its contents. @param {number} d */
	function neededHeight(d) {
		const items = rowItems[d];
		const row = items?.parentElement;
		const scroller = items?.closest('.overflow-auto');
		if (!(row && scroller instanceof HTMLElement)) return 0;
		const full = letOut(items, () => items.offsetHeight);
		// with the row's own top border, and a sideways scrollbar if there is one
		return full + (row.offsetHeight - row.clientHeight) + (scroller.offsetHeight - scroller.clientHeight);
	}

	/** The height at which row `d` shows its largest section bubble whole (0 when it has none). Measured like `neededHeight`, but without the comments and paragraphs. @param {number} d */
	function sectionHeight(d) {
		const items = rowItems[d];
		const row = items?.parentElement;
		const scroller = items?.closest('.overflow-auto');
		if (!(row && scroller instanceof HTMLElement)) return 0;
		const bubbles = Array.from(items.querySelectorAll('[data-section]'), (el) => /** @type {HTMLElement} */ (el));
		if (!bubbles.length) return 0;
		const px = (/** @type {string} */ v) => parseFloat(v) || 0;
		const tallest = letOut(items, () =>
			Math.max(
				...bubbles.map((el) => {
					const s = getComputedStyle(el);
					return el.offsetHeight + px(s.marginTop) + px(s.marginBottom);
				})
			)
		);
		const s = getComputedStyle(items);
		return Math.ceil(tallest + px(s.paddingTop) + px(s.paddingBottom)) + (row.offsetHeight - row.clientHeight) + (scroller.offsetHeight - scroller.clientHeight);
	}

	function fitRows() {
		const last = rows.length - 1;
		const room = rowsHeight - last * HANDLE_H;
		if (last < 0 || room <= 0) return;
		const tight = rows.map((_, d) => sectionHeight(d) || MIN_ROW_H);
		const floors = tight.map((h, d) => (d === last ? Math.max(MIN_ROW_H, h) : h));
		const usual = floors.map((h, d) => (d === last ? Math.max(ROW_H, h) : h));
		// a row above the last grows for a paragraph, or for a comment being written; opening a section leaves it tight
		const at = rows.findIndex((r) => r.nodes.some((node) => nodeId(node) === activeId));
		const reading = !!rows[at]?.nodes.some((node) => node.kind === 'paragraph' && node.paragraph.id === activeId);
		const writing = !!comments?.some((c) => c.id === editor?.open?.id && c.anchorId === activeId);
		const grown = at < last && (reading || writing) ? at : -1;
		const fitted = rowHeights(usual, grown, grown === -1 ? 0 : neededHeight(grown), room, floors);
		// the last row fills what is left whatever its entry says: keep there the height it takes once a row opens beneath it
		fitted[last] = tight[last];
		heights = fitted;
	}

	/** @type {ReturnType<typeof setTimeout> | undefined} */
	let fitTimer;
	let pointerHeld = false;
	let pointerAt = 0;
	/** Size the rows again, after the page has caught up; never while a bubble is being pressed or dragged. */
	function scheduleFit() {
		clearTimeout(fitTimer);
		const busy = () => pointerHeld || !!dd.dragId;
		const wait = () => (busy() ? SETTLE_MS : Math.max(0, pointerAt + SETTLE_MS - Date.now()));
		fitTimer = setTimeout(() => (busy() || wait() ? scheduleFit() : fitRows()), wait());
	}
	/** whether this is a divider between rows. Focus moving to or from one leaves the rows alone, or they would undo a drag of it.
	 * @param {EventTarget | null} t */
	const isDivider = (t) => t instanceof Element && t.getAttribute('role') === 'separator';
	/** @param {boolean} held */
	function pointer(held) {
		if (!held && !pointerHeld) return;
		pointerHeld = held;
		pointerAt = Date.now();
	}
	$effect(() => {
		// (the words being written too: the editor grows with them)
		void [rows, comments, activeId, editor?.open?.id, editor?.open?.body, rowsHeight];
		untrack(scheduleFit);
		return () => clearTimeout(fitTimer);
	});

	/** id of the paragraph being edited in place (double-click), or null */
	/** @type {string | null} */
	let editing = $state(null);
	/** id of the section whose title is being edited in place (a section just added), or null */
	/** @type {string | null} */
	let titleEditId = $state(null);
	/** where the caret goes when editing starts: the character nearest the double-click */
	let editCaret = $state(0);
	/** the caret for an edit that waits on writing mode (a double-click while reading): `editCaret` is reset when the edit starts */
	let pendingCaret = 0;

	// Leaving editing mode (the edit props go away) drops any open editor, menu or highlight
	$effect(() => {
		if (!onedit) editing = null;
		if (!onrename) titleEditId = null;
		if (!ondelete) editHover.clear();
		if (!oninject) {
			gap.clear();
			if (cursor?.type === 'gap') cursor = null; // interstices exist only in editing mode
		}
		if (!onmove) dd.end();
	});

	/** @param {string} id @param {string | null} title */
	function finishTitle(id, title) {
		if (titleEditId === id) titleEditId = null;
		const changed = title !== null && title.trim() !== '';
		if (changed) onrename?.({ id, title: /** @type {string} */ (title).trim() });
		onleave?.(id, changed);
	}

	/** @param {string} id @param {string | null} text */
	function finishEdit(id, text) {
		if (editing === id) editing = null;
		if (text !== null) onedit?.({ id, text });
		onleave?.(id, text !== null);
	}

	let lastX = -1;
	let lastY = -1;
	/**
	 * Whether the pointer itself caused this event. A layout shift under a resting pointer (the
	 * keyboard scrolling, a bubble widening) fires enter and leave events at the old coordinates;
	 * those must not undo a menu the keyboard opened.
	 * @param {PointerEvent} e
	 */
	const pointerMoved = (e) => e.clientX !== lastX || e.clientY !== lastY;
	const editHover = new EditHover();
	const dd = new DragDrop();
	dd.gapBar = true;
	dd.reach = 16; // the interstices are 16 to 24px wide: a drop in one finds the bubble beside it
	const gap = new GapHover();

	/**
	 * Hovering the space between bubbles (or a bubble's thin edge) lights it magenta and
	 * offers the inject menu; anywhere else on a bubble shows its own edit menu.
	 * @param {PointerEvent} e
	 */
	function hoverMove(e) {
		// a layout shift under a resting pointer fires a pointer move with the same coordinates:
		// not the pointer's doing, so it must not undo a menu the keyboard opened
		if (e.clientX === lastX && e.clientY === lastY) return;
		lastX = e.clientX;
		lastY = e.clientY;
		if (!oninject || dd.dragId || editing) return;
		// the interstices are elements of their own (see `gapEl`), which report the pointer themselves
		if (e.target instanceof Element && e.target.closest('[data-gap]')) return;
		if (ondelete && !editHover.target && e.target instanceof Element) {
			const el = e.target.closest('[data-drop]');
			if (el instanceof HTMLElement) editHover.enter({ id: el.dataset.drop ?? '', kind: el.dataset.kind === 'section' ? 'section' : 'paragraph', el });
		}
	}

	/** @param {DragEvent} e */
	function dragOver(e) {
		if (!onmove) return;
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

	/** drag attributes shared by every bubble
	 * @param {string} id @param {'paragraph' | 'section'} kind @param {'x' | 'y'} axis */
	const dragAttrs = (id, kind, axis) =>
		onmove
			? {
					'data-drop': id,
					'data-kind': kind,
					'data-axis': axis,
					draggable: 'true',
					ondragstart: (/** @type {DragEvent} */ e) => {
						editHover.clear();
						dd.start(id, kind, e);
					},
					ondragend: () => dd.end()
				}
			: {};

	/** @typedef {import('#lib/utilities/buildSections.js').SectionChild} SectionChild */
	/** @typedef {import('#lib/utilities/readerNav.js').Stop} Stop */

	/** @type {HTMLDivElement | undefined} */
	let host = $state();

	let tree = $derived(buildSections(paragraphs));
	/** footnote and reference definitions shared by every paragraph */
	let defs = $derived(definitionsOf(paragraphs));

	/** section id -> colour (top-level sections cycle the accents, deeper ones darken) */
	let colors = $derived(colorSections(tree));

	/** the open section at each level: selected[0] is open in the first row, and so on */
	/** @type {string[]} */
	let selected = $state([]);

	/**
	 * Each level of the hierarchy is a row. The first row holds the top-level
	 * nodes; every further row holds the children of the section that is open in
	 * the row above it, so a new row exists only while a section above it is open.
	 */
	let rows = $derived.by(() => {
		/** @type {{ nodes: SectionChild[], parent: import('#lib/utilities/buildSections.js').Section | null }[]} */
		const out = [];
		/** @type {SectionChild[]} */
		let nodes = tree;
		/** @type {import('#lib/utilities/buildSections.js').Section | null} */
		let parent = null;
		for (let d = 0; ; d++) {
			out.push({ nodes, parent });
			const open = nodes.find((n) => n.kind === 'section' && n.id === selected[d]);
			if (!open || open.kind !== 'section') break;
			parent = open;
			nodes = open.children;
		}
		return out;
	});

	// ---- Keyboard navigation ----
	// The cursor rests on one bubble or interstice (an interstice is named by the bubble it sits
	// before). Clicking a bubble puts the cursor on it; the arrow keys move it.
	/** @type {Stop | null} */
	let cursor = $state(null);
	let navRows = $derived(allRows(tree));
	/** the bubble that is tabbable when the cursor is nowhere */
	let firstId = $derived.by(() => {
		const n = tree[0];
		return n ? (n.kind === 'section' ? n.id : n.paragraph.id) : '';
	});

	/** @param {string} id */
	const isCursor = (id) => (cursor ? cursor.id === id : id === firstId);
	/** whether an interstice shows its line: hovered, under the keyboard cursor, or where a drop would land
	 * @param {string} id the bubble it is expressed on
	 * @param {'before' | 'after'} place */
	const gapLit = (id, place) =>
		(gap.lit && gap.target?.id === id && gap.target.place === place) ||
		(cursor?.type === 'gap' && cursor.id === id && (cursor.place ?? 'before') === place) ||
		(dd.drop?.id === id && dd.drop.place === place);

	/** Keep a bubble that is coming into focus centred in its row (once it has finished resizing).
	 * @param {Element} el */
	function centreSoon(el) {
		setTimeout(() => centreInRow(el), 0);
	}

	/** @param {string} id @param {'paragraph' | 'section'} type */
	function setCursor(id, type) {
		cursor = { type, id };
	}

	// the active bubble is whichever was last given the cursor, or called on to have its comment written
	$effect(() => {
		if (cursor) activeId = cursor.id;
	});
	$effect(() => {
		void editor?.called;
		const id = editor?.open?.id;
		const written = untrack(() => comments?.find((c) => c.id === id));
		if (written) activeId = written.anchorId;
	});

	// ---- Synced with the other views: report the focused bubble, and open centred on the shared one ----
	$effect(() => {
		const c = cursor;
		if (c && c.type !== 'gap') untrack(() => onfocusitem?.(c.id));
	});
	let revealed = false;
	$effect(() => {
		if (revealed || !host || tree.length === 0 || !focusId) return;
		const id = untrack(() => focusId) ?? '';
		const anc = ancestorsOf(tree, id);
		if (!anc) return;
		revealed = true;
		const isSection = paragraphs.some((p) => p.id === id && (p.level ?? 0) > 0);
		selected = isSection ? [...anc, id] : anc;
		tick().then(() => {
			selected.forEach((sid, d) => {
				const el = host?.querySelector(`[data-row="${d}"] [data-node="${CSS.escape(sid)}"]`);
				if (el) centreInRow(el);
			});
			cursor = { type: isSection ? 'section' : 'paragraph', id };
			focusCursor();
		});
	});

	// ---- A just-injected empty paragraph opens straight into editing, the cursor in its body ----
	$effect(() => {
		const id = startEditId;
		void paragraphs.length;
		if (!id || !onedit) return;
		tick().then(() => {
			const el = host?.querySelector(`.hv-rows [data-node="${CSS.escape(id)}"]`);
			if (!(el instanceof HTMLElement)) return;
			editHover.clear();
			gap.clear();
			if (el.hasAttribute('data-section')) {
				if (onrename) titleEditId = id; // a section: its title
			} else {
				editCaret = pendingCaret;
				pendingCaret = 0;
				editing = id;
			}
			el.scrollIntoView({ block: 'center', inline: 'center' });
			onstartedit?.();
		});
	});

	/** Focus the cursor's bubble; in editing mode show the menu that hovering it would. */
	function focusCursor() {
		const c = cursor;
		const el = c && host?.querySelector(`.hv-rows [data-node="${CSS.escape(c.id)}"]`);
		if (!c || !(el instanceof HTMLElement)) return;
		editHover.clear();
		gap.clear();
		el.focus();
		centreSoon(el); // (a gap and its bubble share an element, so focus alone may not fire)
		// focusing may scroll, and a scroll drops the menus: show them once it has settled
		setTimeout(() => {
			if (cursor !== c) return;
			if (c.type === 'gap') {
				if (!oninject) return;
				const r = el.getBoundingClientRect();
				const y = c.axis === 'y';
				gap.show(
					{ id: c.id, place: c.place ?? 'before', axis: c.axis ?? 'x' },
					y ? r.left + 24 : c.place === 'after' ? r.right : r.left,
					y ? r.top : r.top + 24
				);
			} else if (ondelete) {
				editHover.enter({ id: c.id, kind: c.type, el });
			}
		}, 80);
	}

	/**
	 * Move the cursor to a stop, opening the sections around it first if its row is not on screen.
	 * @param {{ row: import('#lib/utilities/readerNav.js').NavRow, stop: Stop } | null} to
	 */
	async function goTo(to) {
		if (!to) return;
		if ((rows[to.row.depth]?.parent?.id ?? null) !== to.row.parentId) selected = to.row.path;
		cursor = to.stop;
		await tick();
		focusCursor();
	}

	/** @param {KeyboardEvent} e */
	function onKeydown(e) {
		if (e.metaKey || e.ctrlKey || e.altKey || e.shiftKey || !(e.target instanceof Element)) return;
		if (e.target.closest('[contenteditable]')) return;
		const el = e.target.closest('.hv-rows [data-node]');
		if (!(el instanceof HTMLElement)) return;
		const id = el.dataset.node ?? '';
		const type = el.hasAttribute('data-section') ? 'section' : 'paragraph';
		/** @type {Stop} */
		const cur = cursor?.id === id ? cursor : { type, id };

		if (e.key === 'Enter' || e.key === ' ') {
			if (cur.type === 'gap') {
				// on an interstice, Enter opens its menu rather than the bubble it sits before
				e.preventDefault();
				if (oninject) gap.open = true;
			} else if (e.key === 'Enter' && oncomment && type === 'paragraph' && e.target === el) {
				e.preventDefault();
				pickParagraph(id, el);
			} else if (e.key === 'Enter' && type === 'paragraph' && e.target === el) {
				closeBeside(el);
				if (!onedit) return;
				e.preventDefault();
				editCaret = paragraphs.find((p) => p.id === id)?.text.length ?? 0;
				editHover.clear();
				gap.clear();
				editing = id;
			}
			return;
		}

		// Down on a closed section that has contents opens it, as Enter does
		if (
			e.key === 'ArrowDown' &&
			cur.type === 'section' &&
			!selected.includes(id) &&
			navRows.find((r) => r.parentId === id)?.nodes.length
		) {
			e.preventDefault();
			el.click();
			return;
		}

		// Left and Right leave a stack of paragraphs for the next bubble in the row; on a paragraph
		// bubble, Up and Down instead step to the previous and next bubble (within a stack, the
		// previous and next paragraph)
		const step = cur.type === 'paragraph';
		const to =
			e.key === 'ArrowLeft'
				? moveOut(navRows, cur, -1, !!oninject)
				: e.key === 'ArrowRight'
					? moveOut(navRows, cur, 1, !!oninject)
					: e.key === 'ArrowUp'
						? step
							? moveAlong(navRows, cur, -1, !!oninject)
							: moveAcross(navRows, cur, -1, selected)
						: e.key === 'ArrowDown'
							? step
								? moveAlong(navRows, cur, 1, !!oninject)
								: moveAcross(navRows, cur, 1, selected)
							: undefined;
		if (to === undefined) return;
		e.preventDefault(); // the arrows are ours: no scrolling
		goTo(to);
	}

	/** An arrow key with nothing focused starts from the topmost bubble in view.
	 * @param {KeyboardEvent} e */
	function onWindowKeydown(e) {
		if (e.metaKey || e.ctrlKey || e.altKey || e.shiftKey || e.target !== document.body || !host) return;
		if (!['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown'].includes(e.key)) return;
		const el = topmostInView(Array.from(host.querySelectorAll('.hv-rows [data-node]')).filter((n) => n instanceof HTMLElement), host);
		if (!el) return;
		e.preventDefault();
		cursor = { type: el.hasAttribute('data-section') ? 'section' : 'paragraph', id: el.dataset.node ?? '' };
		focusCursor();
	}

	/** leaving the bubbles for somewhere else drops the menus the cursor opened
	 * @param {FocusEvent} e */
	function onFocusout(e) {
		const to = e.relatedTarget;
		if (to instanceof Element && !to.closest('[role="toolbar"]') && !host?.contains(to)) {
			editHover.clear();
			gap.clear();
		}
	}

	/**
	 * Forced perspective for the bubbles' drop shadows: each shadow falls away from the
	 * centre line of the pane, further the further the bubble is from it (straight down on
	 * the line itself). Set as --sx on the bubble, and recalculated whenever the rows
	 * scroll, the pane resizes or the bubbles change.
	 */
	const SHADOW_SPREAD = 4; // sideways offset (px) of a shadow for a bubble at the edge of the pane
	let shadowFrame = 0;
	function castShadows() {
		if (!host) return;
		const pane = host.getBoundingClientRect();
		const mid = pane.left + pane.width / 2;
		for (const el of host.querySelectorAll('.hv-rows [data-node]')) {
			if (!(el instanceof HTMLElement)) continue;
			const r = el.getBoundingClientRect();
			if (r.right < pane.left - 300 || r.left > pane.right + 300) continue;
			const t = Math.max(-1, Math.min(1, (r.left + r.width / 2 - mid) / (pane.width / 2)));
			el.style.setProperty('--sx', `${(t * SHADOW_SPREAD).toFixed(1)}px`);
		}
	}
	function scheduleShadows() {
		cancelAnimationFrame(shadowFrame);
		shadowFrame = requestAnimationFrame(castShadows);
	}
	$effect(() => {
		if (!host) return;
		const mo = new MutationObserver(scheduleShadows);
		mo.observe(host, { childList: true, subtree: true });
		scheduleShadows();
		return () => mo.disconnect();
	});

	/**
	 * Scroll a container to the middle of its row (the row's own scroller).
	 * @param {Element} el
	 */
	function centreInRow(el) {
		const scroller = el.closest('.overflow-auto');
		if (!scroller) return;
		const box = el.getBoundingClientRect();
		const view = scroller.getBoundingClientRect();
		// the level marker is pinned over the left of the row: centre in the space beside it
		const pinned = scroller.querySelector('[data-gutter]')?.getBoundingClientRect().width ?? 0;
		scroller.scrollBy({ left: box.left + box.width / 2 - (view.left + pinned + (view.width - pinned) / 2), behavior: 'smooth' });
	}

	/**
	 * Open the section in row `d`, or close it if it is already open (which also
	 * removes every row beneath it).
	 * @param {number} d
	 * @param {string} id
	 * @param {HTMLElement} el the clicked container
	 */
	async function toggle(d, id, el) {
		selected = selected[d] === id ? selected.slice(0, d) : [...selected.slice(0, d), id];
		// once the container has resized (open ones widen), centre it in its row
		await tick();
		centreInRow(el);
	}

	/**
	 * Where a focused paragraph bubble is widened (reading), taking its focus at a press on a section bubble would narrow
	 * it, slide the bubble out from under the pointer and lose the click: the focus stays until the click moves it.
	 * @param {MouseEvent} e
	 */
	function keepWide(e) {
		if (!ondelete && !comments && document.activeElement?.closest('.hv-rows [data-node]:not([data-section])')) e.preventDefault();
	}

	/**
	 * Close the section open in the row holding `el` (a paragraph bubble), and with it every row beneath.
	 * @param {Element} el
	 */
	function closeBeside(el) {
		const d = Number(el.closest('[data-row]')?.getAttribute('data-row') ?? rows.length);
		if (selected.length > d) selected = selected.slice(0, d);
	}

	/**
	 * A paragraph bubble was clicked: the section beside it closes, and in commenting mode the comment is begun.
	 * @param {string} id
	 * @param {HTMLElement} el
	 */
	async function pickParagraph(id, el) {
		closeBeside(el);
		if (!oncomment) return;
		// (once the rows have gone: a comment placed in one of them opens it again)
		await tick();
		oncomment(id);
	}

	/**
	 * Open a section and every section around it (`ids`, outermost first), as if each
	 * had been clicked in turn, and bring the opened containers into view. Used by the
	 * minimap.
	 * @param {string[]} ids
	 */
	export async function openPath(ids) {
		selected = ids;
		await tick();
		ids.forEach((id, d) => {
			const el = host?.querySelector(`[data-row="${d}"] [data-node="${id}"]`);
			if (el) centreInRow(el);
		});
		// the section the minimap went to becomes the focused one
		const last = ids[ids.length - 1];
		if (last) {
			cursor = { type: 'section', id: last };
			focusCursor();
		}
	}

	/**
	 * Split a section title at its first colon: the title keeps the colon, and
	 * everything after it is the subtitle.
	 * @param {string} text
	 */
	function splitTitle(text) {
		const i = text.indexOf(':');
		if (i === -1) return { title: text, subtitle: '' };
		return { title: text.slice(0, i + 1), subtitle: text.slice(i + 1).trim() };
	}

	/**
	 * The header level a row contains (for the "#" marks in its gutter).
	 * @param {{ nodes: SectionChild[], parent: import('#lib/utilities/buildSections.js').Section | null }} row
	 */
	function rowLevel(row) {
		const sec = row.nodes.find((n) => n.kind === 'section');
		return sec && sec.kind === 'section' ? sec.level : row.parent ? row.parent.level + 1 : 0;
	}
</script>

<!-- commenting: the button on a bubble's corner, shown while the bubble is pointed at or has focus -->
{#snippet commentButton(/** @type {string} */ id, /** @type {string} */ label, /** @type {string} */ side)}
	<button type="button" aria-label={label} use:tip={label} onclick={() => oncomment?.(id)} class="raised absolute top-0 {side} z-10 inline-flex items-center justify-center rounded-full p-1 text-dark opacity-0 shadow-md group-focus-within:opacity-100 group-hover:opacity-100 hover:bg-taupe2!"><QuoteRightAlt width={16} height={16} /></button>
{/snippet}

<!-- commenting: the comments on a bubble, hanging beneath it one under another -->
{#snippet hanging(/** @type {string} */ id, /** @type {string} */ width)}
	<!-- `width` makes this as wide as the bubble: "w-0 min-w-full" takes the width of a column the bubble alone has sized -->
	{@const own = notesOn.get(id)}
	{#if own}
		<div role="complementary" aria-label="Comments" data-comments-for={id} class="flex shrink-0 flex-col gap-2 pt-1 pb-2 {width}">
			{#each own as c (c.id)}<CommentBubble comment={c} onlit={(x) => (pointed = x)} compact class="relative shrink-0" />{/each}
		</div>
	{/if}
{/snippet}

<!-- A paragraph bubble. In the front-matter column it keeps its natural height (the column
     scrolls); elsewhere it is a fixed-width box that scrolls on its own. -->
{#snippet paragraphBubble(/** @type {import('#lib/utilities/buildSections.js').ParagraphNode} */ node, /** @type {boolean} */ stacked)}
	<!-- commenting: the bubble with its comments under it. In a row that is a column of its own, which scrolls; in the
	     front-matter column they take their places in that one -->
	<div data-column={comments && !stacked ? '' : undefined} class={comments && !stacked ? '-mx-1 flex h-full min-h-0 shrink-0 flex-col items-start overflow-y-auto px-2' : 'contents'}>
	<!-- commenting: the bubble and its comment button, side by side in the page (the bubble scrolls, the button must not) -->
	<div class={oncomment ? `group relative flex shrink-0 ${stacked ? 'flex-col' : ''}` : 'contents'}>
	<!-- svelte-ignore a11y_no_static_element_interactions -->
	<div
		data-node={node.paragraph.id}
		tabindex={isCursor(node.paragraph.id) ? 0 : -1}
		onfocus={(e) => {
			if (cursor?.id !== node.paragraph.id) setCursor(node.paragraph.id, 'paragraph');
			centreSoon(e.currentTarget);
		}}
		onclick={(e) => {
			setCursor(node.paragraph.id, 'paragraph');
			// (not for a link or footnote mark in it, a selection of its words, or a click in its editor)
			if (editing !== node.paragraph.id && isCommentClick(e)) pickParagraph(node.paragraph.id, e.currentTarget);
		}}
		{...(editing === node.paragraph.id ? {} : dragAttrs(node.paragraph.id, 'paragraph', stacked ? 'y' : 'x'))}
		ondblclick={onedit || onwrite
			? (e) => {
					const caret = caretOffsetAt(e.currentTarget, e.clientX, e.clientY, node.paragraph.text);
					if (!onedit) {
						// reading: ask the page for writing mode, which then opens this paragraph for editing
						pendingCaret = caret;
						return onwrite?.(node.paragraph.id);
					}
					editCaret = caret;
					editHover.clear();
					gap.clear();
					editing = node.paragraph.id;
				}
			: undefined}
		onpointerenter={ondelete && !editing ? (e) => pointerMoved(e) && editHover.enter({ id: node.paragraph.id, kind: 'paragraph', el: e.currentTarget }) : undefined}
		onpointerleave={ondelete ? (e) => pointerMoved(e) && editHover.leave() : undefined}
		class="{stacked ? 'mx-2 my-3' : comments ? 'my-2' : 'mx-1 my-2'} flex w-80 shrink-0 flex-col gap-0.5 rounded-md border border-taupe2 bg-taupe1 px-[calc(0.25rem_+_var(--ta-mx,0rem))] py-0.5 [box-shadow:var(--sx,0px)_3px_3px_var(--color-taupe4)] {ondelete ? 'text-sm' : 'text-base'} {ondelete ? '' : 'hover:outline-2 hover:outline-taupe3'} {ondelete || comments ? '' : 'focus:w-160'} {cursor?.type === 'gap' ? 'focus:outline-0' : 'focus:outline-2 focus:outline-accent'} {stacked ? '' : 'overflow-y-auto'} {dd.dragId === node.paragraph.id ? 'opacity-40' : ''} {dd.classes(node.paragraph.id, stacked ? 'y' : 'x') || (ondelete && !dd.dragId && editHover.is(node.paragraph.id) ? 'outline-2 outline-taupe3' : '')} {picked?.has(node.paragraph.id) ? 'outline-4! outline-accent! bg-[color-mix(in_srgb,var(--color-accent)_18%,var(--color-taupe1))]!' : marked.has(node.paragraph.id) ? 'outline-4 outline-accent/60' : ''} {oncomment ? 'cursor-pointer' : ''}"
	>
		<span class="text-xs text-gray-500">{node.paragraphIndex}</span>
		{#if editing === node.paragraph.id}
			<p
				use:editable={{ text: node.paragraph.text, caret: editCaret, onfinish: (t) => finishEdit(node.paragraph.id, t), onenter: (r) => onnewitem?.(node.paragraph.id, r) }}
				class="para-text flex-1 whitespace-pre-wrap outline-none"
			></p>
		{:else}
			{@const withNotes = node.paragraph.text ? renderFootnoteMarks(node.paragraph.text, defs, node.paragraph.id) : null}
			<p class="md para-text flex-1 whitespace-pre-wrap">{#if withNotes}{@html ondelete ? withNotes : emphasizeFirst(withNotes)}{:else if node.paragraph.text}{#if ondelete}{node.paragraph.text}{:else}{@html plainFirst(node.paragraph.text)}{/if}{:else}<span class="italic text-grey3">empty paragraph</span>{/if}</p>
		{/if}
	</div>
	{#if oncomment}{@render commentButton(node.paragraph.id, 'Comment on this paragraph', stacked ? 'right-0' : '-right-2')}{/if}
	</div>
	{@render hanging(node.paragraph.id, stacked ? 'mx-2 -mt-1 w-80' : 'w-0 min-w-full')}
	</div>
{/snippet}

<!-- An interstice: the space between two bubbles (or before the first, after the last) is an element of its own. It is where hovering
     offers the inject menu and where a drop lands, it draws its own straight line, and it is the spacing between the bubbles. -->
{#snippet gapEl(/** @type {string} */ id, /** @type {'before' | 'after'} */ place, /** @type {'x' | 'y'} */ axis)}
	<div
		data-gap
		role="presentation"
		onpointerenter={(e) => {
			if (!oninject || dd.dragId || editing || !pointerMoved(e)) return;
			editHover.clear();
			// the menu is tethered to the line: it slides along it with the pointer
			gap.set({ id, place, axis, at: gap.tether(e.currentTarget, e, axis) }, e);
		}}
		onpointermove={(e) => {
			if (gap.target?.id !== id || gap.target.place !== place) return;
			const { x, y } = gap.tether(e.currentTarget, e, axis);
			gap.x = x;
			gap.y = y;
		}}
		onpointerleave={(e) => oninject && pointerMoved(e) && gap.leave()}
		class="relative shrink-0 {axis === 'x' ? 'w-6 self-stretch' : 'h-4 w-full'}"
	>
		{#if gapLit(id, place)}
			<div class="pointer-events-none absolute rounded-full bg-taupe3 {axis === 'x' ? 'inset-y-0 left-1/2 w-1.5 -translate-x-1/2' : 'inset-x-0 top-1/2 h-1.5 -translate-y-1/2'}"></div>
		{/if}
	</div>
{/snippet}

{#snippet row(/** @type {number} */ d)}
	{@const r = rows[d]}
	{@const tint = r.parent ? colors.get(r.parent.id) : null}
	{@const lvl = rowLevel(r)}
	<!-- Front matter: the paragraphs before the first section. In every row, open beneath
	     or not, they collapse into a single vertical column that clips at the bottom of the row
	     and scrolls. -->
	{@const firstSection = r.nodes.findIndex((n) => n.kind === 'section')}
	{@const front = firstSection === -1 ? [] : r.nodes.slice(0, firstSection)}
	<div
		data-row={d}
		style={tint ? `--c: ${tint}` : ''}
		class="flex h-full min-w-full w-max items-stretch gap-2 {tint ? 'border-t-2 border-(--c) bg-[color-mix(in_srgb,var(--c)_8%,transparent)]' : ''}"
	>
		<!-- level marker: small grey pound signs, pinned to the left while scrolling -->
		<!-- opaque, with a divider on its right, so the row's contents scroll out of sight behind it rather than showing through -->
		<div
			data-gutter
			class="sticky left-0 z-10 flex w-8 shrink-0 items-start justify-center border-r border-taupe2 pt-3 text-xs font-semibold text-grey1 select-none {tint ? 'bg-[color-mix(in_srgb,var(--c)_8%,var(--color-taupe1))]' : 'bg-taupe1'}"
			use:tip={`Level ${lvl}`}
		>
			{'#'.repeat(lvl)}
		</div>

		<!-- the row's bubbles -->
		<div bind:this={rowItems[d]} class="flex h-full items-stretch gap-4 py-2 pr-2">
			<!-- front matter: small bubbles, first in the top row -->
			{#if d === 0 && matter}{#each matter.front as s (s.id)}<MatterBubble section={s} />{/each}{/if}
			{#if front.length}
				<div data-front class="mx-2 flex h-full min-h-0 w-86 shrink-0 {ondelete || comments ? '' : 'has-[[data-node]:focus]:w-166 [&:has([data-node]:focus)_[data-node]]:w-160'} flex-col gap-0 overflow-y-auto px-1">
					{#each front as node (node.kind === 'paragraph' ? node.paragraph.id : '')}
						{#if node.kind === 'paragraph'}
							{#if oninject}{@render gapEl(node.paragraph.id, 'before', 'y')}{/if}
							{@render paragraphBubble(node, true)}
						{/if}
					{/each}
					{#if oninject}{@const last = front[front.length - 1]}{#if last.kind === 'paragraph'}{@render gapEl(last.paragraph.id, 'after', 'y')}{/if}{/if}
				</div>
			{/if}
			{#each r.nodes.slice(front.length) as node (node.kind === 'section' ? node.id : node.paragraph.id)}
				{#if oninject}{@render gapEl(node.kind === 'section' ? node.id : node.paragraph.id, 'before', 'x')}{/if}
				{#if node.kind === 'section'}
					{@const isOpen = selected[d] === node.id}
					{@const t = splitTitle(node.title)}
					<!-- commenting: a column of the bubble and, under it, its comments -->
					<div data-column={comments ? '' : undefined} class={comments ? '-mx-2 flex h-full min-h-0 shrink-0 flex-col items-start overflow-y-auto px-2' : 'contents'}>
					<!-- commenting: the bubble and its comment button, side by side in the page (a button can't hold another) -->
					<div class={oncomment ? 'group relative flex shrink-0 items-start' : 'contents'}>
					<svelte:element
						this={titleEditId === node.id ? 'div' : 'button'}
						role={titleEditId === node.id ? 'button' : undefined}
						data-section
						data-node={node.id}
						tabindex={isCursor(node.id) ? 0 : -1}
						onfocus={(e) => {
							if (cursor?.id !== node.id) setCursor(node.id, 'section');
							centreSoon(e.currentTarget);
						}}
						{...titleEditId === node.id ? {} : dragAttrs(node.id, 'section', 'x')}
						data-level={node.level}
						data-open={isOpen}
						onmousedown={keepWide}
						onclick={(/** @type {MouseEvent & { currentTarget: HTMLElement }} */ e) => {
							if (titleEditId === node.id) return;
							setCursor(node.id, 'section');
							// opening or closing rebuilds the rows beneath, so take focus back afterwards
							toggle(d, node.id, e.currentTarget).then(() => {
								if (cursor?.id === node.id) focusCursor();
							});
						}}
						onpointerenter={ondelete ? (e) => pointerMoved(e) && editHover.enter({ id: node.id, kind: 'section', el: e.currentTarget }) : undefined}
						onpointerleave={ondelete ? (e) => pointerMoved(e) && editHover.leave() : undefined}
						aria-expanded={isOpen}
						style="--c: {colors.get(node.id)}"
						class="my-2 {isOpen ? 'flex' : 'flow-root'} max-h-[calc(100%-1rem)] shrink-0 items-start self-start gap-3 overflow-hidden rounded-md border-2 border-(--c) px-4 py-3 text-left [box-shadow:var(--sx,0px)_3px_3px_var(--color-taupe4)] {cursor?.type === 'gap' ? '' : 'focus:outline-2 focus:outline-offset-2 focus:outline-accent'} {isOpen ? 'font-semibold' : 'text-sm font-normal'} {dd.dragId === node.id ? 'opacity-40' : ''} {dd.classes(node.id, 'x') || (ondelete && !dd.dragId && editHover.is(node.id) ? 'outline-2 outline-offset-2 outline-taupe3' : '')} {picked?.has(node.id) ? 'outline-4 outline-offset-2 outline-accent' : marked.has(node.id) ? 'outline-4 outline-offset-2 outline-accent/60' : ''} {isOpen ? 'w-max bg-(--c) text-on-hue' : 'w-56 bg-taupe1 text-dark hover:bg-taupe2'} {ondelete ? 'pr-9' : ''} {notesOn.has(node.id) ? 'min-w-56' : ''}"
					>
						<!-- section label stacked above the caret, so the title starts at the very top; in a closed bubble the pair floats,
						     and a long title wraps on into the space beneath it -->
						<span class="flex shrink-0 flex-col items-center gap-0.5 {isOpen ? '' : 'float-left mr-3'}">
							<span class="text-xs font-normal text-taupe4">§{node.hierarchicalIndex}</span>
							<!-- the caret shows the open state, so only a section with something in it has one -->
							{#if node.children.length}
								<span class="flex items-center gap-0.5">
									<svg class="h-5 w-5 transition-transform {isOpen ? 'rotate-90' : ''}" viewBox="0 0 20 20" fill="currentColor">
										<path d="M7.2 4.8a.75.75 0 011.06 0l4.5 4.5a.75.75 0 010 1.06l-4.5 4.5a.75.75 0 01-1.06-1.06L11.17 9.8 7.2 5.86a.75.75 0 010-1.06z" />
									</svg>
									<span class="text-xs font-normal text-taupe4" aria-label="{countParagraphs(node)} paragraphs">{countParagraphs(node)}¶</span>
								</span>
							{/if}
						</span>
						<!-- wraps inside the container and clips at the bottom; an open container
						     grows wide enough to show the whole title and subtitle -->
						<span class={isOpen ? 'min-w-0 flex-1 whitespace-nowrap' : 'break-words'}>
							{#if titleEditId === node.id}
								<!-- a section just added: its title is edited in place; Enter saves and adds a new section after it (a sibling), which opens for editing; leaving saves, Esc cancels -->
								<span data-placeholder="Untitled section" use:editable={{ text: node.title, onfinish: (v) => finishTitle(node.id, v), onenter: onnewitem ? (r) => onnewitem(node.id, r) : undefined }} class="flow-root min-w-8 cursor-text rounded-md bg-taupe1/70 px-2 py-0.5 break-words text-dark outline-2 outline-(--c)"></span>
							{:else}
								{#if t.title}{t.title}{:else}<span class="font-normal italic opacity-60">Untitled section</span>{/if}
								{#if t.subtitle}
									<span class="mt-0.5 block text-xs font-normal {isOpen ? 'text-on-hue/70' : 'text-grey2'}">{t.subtitle}</span>
								{/if}
							{/if}
						</span>
					</svelte:element>
					{#if oncomment}{@render commentButton(node.id, 'Comment on this section', '-right-2')}{/if}
					</div>
					{@render hanging(node.id, 'w-0 min-w-full')}
					</div>
				{:else}
					{@render paragraphBubble(node, false)}
				{/if}
			{:else}
				{#if !front.length}<p class="self-center text-sm text-gray-500">{r.parent ? 'This section is empty.' : empty}</p>{/if}
			{/each}
			{#if oninject && r.nodes.length > front.length}{@const last = r.nodes[r.nodes.length - 1]}{@render gapEl(last.kind === 'section' ? last.id : last.paragraph.id, 'after', 'x')}{/if}
			<!-- back matter: small bubbles, last in the top row -->
			{#if d === 0 && matter}{#each matter.back as s (s.id)}<MatterBubble section={s} />{/each}{/if}
		</div>
	</div>
{/snippet}

<!-- Rows are stacked split panes: each deeper row appears (with its divider) only
     while a section in the row above is open. -->
{#snippet stack(/** @type {number} */ d)}
	<!-- the last row is alone in its pane, and stays drawn as it is when a row opens or closes beneath it -->
	<SplitPane direction="vertical" sized="first" alone={d >= rows.length - 1} initial={heights[d] ?? ROW_H} min={48} max={Math.max(600, rowsHeight)}>
		{#snippet first()}{@render row(d)}{/snippet}
		{#snippet second()}{@render stack(d + 1)}{/snippet}
	</SplitPane>
{/snippet}

<svelte:window onkeydown={onWindowKeydown} onresize={scheduleShadows} onpointerup={() => pointer(false)} onpointercancel={() => pointer(false)} ondragend={() => pointer(false)} />

<FootnoteTip />

{#if ondelete}<EditMenu hover={editHover} {ondelete} {onexpand} />{/if}
<DropTip {dd} />
{#if oninject}<GapMenu {gap} {oninject} />{/if}

<!-- svelte-ignore a11y_no_static_element_interactions -->
<div
	bind:this={host}
	onpointermove={hoverMove}
	onpointerleave={(e) => pointerMoved(e) && gap.leave()}
	onkeydown={onKeydown}
	onpointerdown={() => pointer(true)}
	onfocusout={(e) => {
		onFocusout(e);
		// a bubble that loses focus narrows, and so grows taller
		if (!isDivider(e.target) && !isDivider(e.relatedTarget)) scheduleFit();
	}}
	onfocusin={(e) => {
		scheduleShadows();
		if (!isDivider(e.target)) scheduleFit();
	}}
	onscrollcapture={scheduleShadows}
	ontransitionend={(e) => {
		// a row has finished changing height: the edit menu follows its bubble
		if (e.propertyName === 'height' && editHover.target) editHover.enter({ ...editHover.target });
	}}
	ondragover={dragOver}
	ondrop={drop}
	ondragleave={(e) => {
		if (!e.currentTarget.contains(/** @type {Node | null} */ (e.relatedTarget))) dd.drop = null;
	}}
	class="flex h-full min-h-0 flex-col"
>
	<div class="hv-rows min-h-0 flex-1" bind:clientHeight={rowsHeight}>
		{@render stack(0)}
	</div>

	<!-- Global Hierarchical Minimap: the whole text along the bottom of the pane -->
	<HierarchyMinimap
		{paragraphs}
		{tree}
		{colors}
		{selected}
		onopen={openPath}
		onjump={(id) => {
			cursor = { type: 'section', id };
			onfocusitem?.(id);
		}}
		layoutKey={selected.join('/')}
		getHost={() => host ?? null}
	/>
</div>

<style>
	/* for the moment a row is being measured, every box in it is as tall as its contents */
	:global(.hv-measure) {
		align-self: flex-start;
	}
	:global(.hv-measure),
	:global(.hv-measure :is([data-front], [data-column], [data-node])) {
		height: auto !important;
		max-height: none !important;
	}
</style>
