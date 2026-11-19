<script>
	import MinimapTooltip from '#lib/components/MinimapTooltip.svelte';
	import { sectionColor } from '#lib/utilities/sectionColor.js';
	import EditMenu from '#lib/components/EditMenu.svelte';
	import { EditHover } from '#lib/utilities/editHover.svelte.js';
	import { caretOffsetAt, editable } from '#lib/utilities/editable.js';
	import GapMenu from '#lib/components/GapMenu.svelte';
	import { GapHover } from '#lib/utilities/gapHover.svelte.js';
	import DropTip from '#lib/components/DropTip.svelte';
	import { DragDrop, locateGap } from '#lib/utilities/dragDrop.svelte.js';
	import { dropAllowed } from '#lib/utilities/editText.js';
	import { gapLineClass } from '#lib/utilities/dragDrop.svelte.js';
	import { linearStops, moveLinear, topmostInView } from '#lib/utilities/readerNav.js';
	import { definitionsOf, isDefinition, renderMarkdown } from '#lib/utilities/renderMarkdown.js';

	/**
	 * A scrolling list of paragraphs with a minimap-style overview column.
	 * The overview appears only when there is text, shows a tiny copy of the whole
	 * text, and keeps a violet marker (centred where possible) on the visible part.
	 * Clicking or dragging in the overview scrolls the main area.
	 *
	 * @type {{
	 *   paragraphs: { id: string, originalIndex: number, text: string, level?: number }[],
	 *   empty?: string,
	 *   synopsis?: boolean,
	 *   ondelete?: (req: { id: string, kind: 'paragraph' | 'section', scope?: 'only' | 'tree' }) => void,
	 *   onexpand?: (req: { id: string, kind: 'paragraph' | 'section', from: DOMRect }) => void
	 * }}
	 *
	 * With `synopsis`, a far-right column also shows the whole text at once, with
	 * no scrolling, as gray blips whose heights follow each paragraph's real height,
	 * plus a violet marker on the visible part. Each blip is a button: clicking it scrolls
	 * the main area to the top of that blip. The empty space between blips is not clickable.
	 * For hierarchical text (paragraphs with a header `level`), every section at
	 * every header level is a blip. Each header level gets its own lane (a thin
	 * vertical strip, shallowest on the left), and a section's blip spans from its
	 * header to the next header of the same or a higher level, so a ## blip covers
	 * all the ### blips inside it. Text before the first header is a lighter blip.
	 * Each top-level section gets the next Solarized accent colour from the theme
	 * (cycling when they run out); its subsections use progressively darker shades
	 * of that colour. Hovering anywhere in a top-level section's part of the column (its
	 * whole bounding area, not just the blips) shows its title in a tooltip and
	 * shades that area in taupe2; clicking that background (anywhere but on a blip)
	 * scrolls to the beginning of the top-level section. Hovering a blip itself instead shows the tooltip
	 * as the section's name preceded by its ancestors' names, one per line, each level
	 * tabbed in further and led by a turn-right icon.
	 * The overview column's marker takes the colour of the top-level section the
	 * visible text is currently in (taupe2 at 50% opacity when outside any section).
	 *
	 * With `ondelete`, the main text is editable: hovering a paragraph (or a header, which
	 * is a section) outlines it in violet and floats an editor menu above it. The request
	 * goes to `ondelete`, which asks for confirmation.
	 *
	 * With `onmove`, rows can be dragged: onto the space between rows (a violet line) to move
	 * them there, or onto the first or second half of a row of the same kind to prepend or
	 * append (merge) it. A header row drags its whole section.
	 */
	let { paragraphs, empty = 'No text yet.', synopsis = false, ondelete = undefined, onexpand = undefined, onmove = undefined, oninject = undefined, onedit = undefined, markdown = false } = $props();

	/** reference definitions ("[image1]: url") shared by every paragraph */
	let defs = $derived(markdown ? definitionsOf(paragraphs) : undefined);

	/** id of the paragraph being edited in place (double-click), or null */
	/** @type {string | null} */
	let editing = $state(null);
	/** where the caret goes when editing starts: the character nearest the double-click */
	let editCaret = $state(0);

	// Leaving editing mode (the edit props go away) drops any open editor, menu or highlight
	$effect(() => {
		if (!onedit) editing = null;
		if (!ondelete) editHover.clear();
		if (!oninject) {
			gap.clear();
			if (cursor?.type === 'gap') cursor = null; // interstices exist only in editing mode
		}
		if (!onmove) dd.end();
	});

	/** @param {string} id @param {string | null} text */
	function finishEdit(id, text) {
		if (editing === id) editing = null;
		if (text !== null) onedit?.({ id, text });
	}

	// Footnote tooltip: hovering (or focusing) an in-text note mark shows the note's text.
	// It stays open while the pointer is on it, so links inside the note can be clicked.
	/** @type {{ html: string, x: number, y: number, above: boolean } | null} */
	let note = $state(null);
	/** @type {ReturnType<typeof setTimeout> | undefined} */
	let noteTimer;
	function closeNote() {
		clearTimeout(noteTimer);
		noteTimer = setTimeout(() => (note = null), 150);
	}
	/** @param {Event} e */
	function noteOver(e) {
		const mark = e.target instanceof Element ? e.target.closest('.footnote-ref') : null;
		if (!(mark instanceof HTMLElement)) return;
		clearTimeout(noteTimer);
		const r = mark.getBoundingClientRect();
		const above = r.bottom + 280 > window.innerHeight;
		note = { html: mark.dataset.note ?? '', x: r.left + r.width / 2, y: above ? r.top : r.bottom, above };
	}
	/** @param {Event} e */
	function noteOut(e) {
		if (e.target instanceof Element && e.target.closest('.footnote-ref')) closeNote();
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
	const gap = new GapHover();

	/**
	 * Hovering a gap between rows (the space or the padding at a row's edge) lights it
	 * magenta and offers the inject menu; anywhere else on a row shows its own edit menu.
	 * @param {PointerEvent} e
	 */
	function hoverMove(e) {
		// a layout shift under a resting pointer fires a pointer move with the same coordinates:
		// not the pointer's doing, so it must not undo a menu the keyboard opened
		if (e.clientX === lastX && e.clientY === lastY) return;
		lastX = e.clientX;
		lastY = e.clientY;
		if (!oninject || dd.dragId || editing) return;
		const zone = locateGap(e);
		gap.set(zone, e);
		if (zone) editHover.clear();
		else if (ondelete && !editHover.target && e.target instanceof Element) {
			const el = e.target.closest('[data-drop]');
			if (el instanceof HTMLElement) editHover.enter({ id: el.dataset.drop ?? '', kind: el.dataset.kind === 'section' ? 'section' : 'paragraph', el });
		}
	}

	/** @param {DragEvent} e */
	function dragOver(e) {
		if (!onmove) return;
		if (dd.over(e, (id, target, place) => dropAllowed(paragraphs, id, target, place, true))) {
			e.preventDefault();
			if (e.dataTransfer) e.dataTransfer.dropEffect = 'move';
		}
		// scroll when dragging near the top or bottom of the text
		if (mainEl) {
			const r = mainEl.getBoundingClientRect();
			if (e.clientY < r.top + 40) mainEl.scrollTop -= 12;
			else if (e.clientY > r.bottom - 40) mainEl.scrollTop += 12;
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

	// ---- Keyboard navigation ----
	// The cursor rests on one row or interstice (an interstice is named by the row it sits
	// before). Clicking a row puts the cursor on it; the up and down arrows move it.
	/** @type {import('#lib/utilities/readerNav.js').Stop | null} */
	let cursor = $state(null);
	let stops = $derived(linearStops(paragraphs, !!oninject));
	/** the row that is tabbable when the cursor is nowhere */
	let firstId = $derived(paragraphs[0]?.id ?? '');
	/** @param {string} id */
	const isCursor = (id) => (cursor ? cursor.id === id : id === firstId);
	/** the line of the interstice the cursor is on, drawn on the row it sits before
	 * @param {string} id */
	const cursorLine = (id) =>
		cursor?.type === 'gap' && cursor.id === id ? gapLineClass(cursor.place ?? 'before', 'y') : '';

	/** Focus the cursor's row; in editing mode show the menu that hovering it would. */
	function focusCursor() {
		const c = cursor;
		const el = c && mainContent?.querySelector(`[data-para="${CSS.escape(c.id)}"]`);
		if (!c || !(el instanceof HTMLElement)) return;
		editHover.clear();
		gap.clear();
		el.focus();
		// focusing may scroll, and a scroll drops the menus: show them once it has settled
		setTimeout(() => {
			if (cursor !== c) return;
			if (c.type === 'gap') {
				if (!oninject) return;
				const r = el.getBoundingClientRect();
				gap.show({ id: c.id, place: c.place ?? 'before', axis: 'y' }, r.left + 24, c.place === 'after' ? r.bottom : r.top);
			} else if (ondelete) {
				editHover.enter({ id: c.id, kind: c.type, el });
			}
		}, 80);
	}

	/** @param {KeyboardEvent} e */
	function onKeydown(e) {
		if (e.metaKey || e.ctrlKey || e.altKey || e.shiftKey || !(e.target instanceof Element)) return;
		if (e.target.closest('[contenteditable]')) return;
		const el = e.target.closest('[data-para]');
		if (!(el instanceof HTMLElement)) return;
		const id = el.dataset.para ?? '';
		const para = paragraphs.find((p) => p.id === id);
		if (!para) return;
		/** @type {import('#lib/utilities/readerNav.js').Stop} */
		const cur =
			cursor?.id === id ? cursor : { type: (para.level ?? 0) > 0 ? 'section' : 'paragraph', id };

		if (e.key === 'Enter') {
			if (cur.type === 'gap') {
				// on an interstice, Enter opens its menu
				e.preventDefault();
				if (oninject) gap.open = true;
			} else if (onedit && cur.type === 'paragraph' && e.target === el) {
				e.preventDefault();
				editCaret = para.text.length;
				editHover.clear();
				gap.clear();
				editing = id;
			}
			return;
		}
		if (e.key !== 'ArrowUp' && e.key !== 'ArrowDown') return;
		e.preventDefault(); // the arrows are ours: no scrolling
		const next = moveLinear(stops, cur, e.key === 'ArrowUp' ? -1 : 1);
		if (!next) return;
		cursor = next;
		focusCursor();
	}

	/** An arrow key with nothing focused starts from the topmost row in view (the main text only,
	 * not the load preview).
	 * @param {KeyboardEvent} e */
	function onWindowKeydown(e) {
		if (!synopsis || e.metaKey || e.ctrlKey || e.altKey || e.shiftKey || e.target !== document.body) return;
		if (!['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown'].includes(e.key) || !mainEl || !mainContent) return;
		const el = topmostInView(Array.from(mainContent.querySelectorAll('[data-para]')).filter((n) => n instanceof HTMLElement), mainEl);
		if (!el) return;
		e.preventDefault();
		const para = paragraphs.find((p) => p.id === el.dataset.para);
		cursor = { type: (para?.level ?? 0) > 0 ? 'section' : 'paragraph', id: el.dataset.para ?? '' };
		focusCursor();
	}

	/** leaving the rows for somewhere else drops the menus the cursor opened
	 * @param {FocusEvent} e */
	function onFocusout(e) {
		const to = e.relatedTarget;
		if (to instanceof Element && !to.closest('[role="toolbar"]') && !mainContent?.contains(to)) {
			editHover.clear();
			gap.clear();
		}
	}

	/** @type {HTMLDivElement | undefined} */
	let mainEl = $state(); // scrolling paragraph area
	/** @type {HTMLDivElement | undefined} */
	let mainContent = $state(); // its content wrapper (measured for changes)
	/** @type {HTMLDivElement | undefined} */
	let miniEl = $state(); // scrolling overview column
	/** @type {HTMLDivElement | undefined} */
	let miniContent = $state(); // overview content, at its real (scaled-down) size
	/** @type {HTMLDivElement | undefined} */
	let miniInner = $state(); // full-size copy of the text, scaled down to fit the overview

	let m = $state({ top: 0, sh: 1, ch: 1, mmH: 1, mTop: 0, mH: 0, w: 1, k: 1 });

	// Paragraph boundaries (px) in the main text and in the overview, same count.
	// The overview wraps its tiny text differently, so positions are mapped
	// paragraph by paragraph instead of by one overall ratio.
	/** @type {number[]} */
	let mainB = [0, 1];
	/** @type {number[]} */
	let miniB = [0, 1];

	/**
	 * Piecewise-linear map of `x` from boundary list `from` to boundary list `to`.
	 * @param {number} x
	 * @param {number[]} from
	 * @param {number[]} to
	 */
	function mapPos(x, from, to) {
		const last = from.length - 1;
		if (x <= from[0]) return to[0];
		if (x >= from[last]) return to[last];
		let i = 0;
		while (i + 1 < last && from[i + 1] <= x) i++;
		const span = from[i + 1] - from[i];
		return to[i] + (span > 0 ? (x - from[i]) / span : 0) * (to[i + 1] - to[i]);
	}
	/**
	 * Blip positions/heights as % of the whole text. `title`, `bandTop` and `bandH`
	 * describe the top-level section the blip belongs to (for the hover tooltip/band).
	 * `y` is the blip's top in px within the text (where a click scrolls to) and
	 * `label` names it for assistive tech.
	 * @type {{ top: number, h: number, lane: number, minor: boolean, color: string | null,
	 *          title: string | null, bandTop: number, bandH: number, bandY: number, y: number, label: string, path: string[] }[]}
	 */
	let blips = $state([]);
	let laneCount = $state(1);
	/** colour of the top-level section at the middle of the view (null = default taupe2) */
	let markerColor = $state(null);
	/**
	 * The top-level section areas of the column (one per top-level section). They
	 * tile the column without gaps: each runs from its section's start to the next
	 * section's start (the last one to the bottom).
	 */
	let regions = $derived.by(() => {
		/** @type {Map<number, { title: string, top: number, h: number, y: number }>} */
		const seen = new Map();
		for (const b of blips) {
			if (b.title && !seen.has(b.bandTop)) seen.set(b.bandTop, { title: b.title, top: b.bandTop, h: b.bandH, y: b.bandY });
		}
		const list = [...seen.values()].sort((a, b) => a.top - b.top);
		return list.map((r, i) => ({ ...r, h: (list[i + 1]?.top ?? 100) - r.top }));
	});
	/** the section area currently hovered (null when none) */
	let hover = $state(null);
	/** the blip currently under the pointer (null when none) */
	let hoverBlip = $state(null);
	let tipY = $state(0); // tooltip height inside the synopsis column (px)
	/** tooltip lines: a hovered blip's section and its ancestors, else the hovered area's top-level title */
	let tipLines = $derived(hoverBlip ? hoverBlip.path : hover ? [hover.title] : []);

	/**
	 * Colour of the top-level section that contains the point `y` (px from the top
	 * of the text), or null when the text has no headers or `y` is above the first
	 * top-level header.
	 * @param {number} y
	 * @returns {string | null}
	 */
	function sectionColorAt(y) {
		const rows = /** @type {HTMLElement[]} */ (Array.from(mainContent?.children ?? []));
		if (rows.length === 0 || rows.length !== paragraphs.length) return null;

		let topLevel = Infinity;
		for (const p of paragraphs) if ((p.level ?? 0) > 0 && (p.level ?? 0) < topLevel) topLevel = p.level ?? 0;
		if (topLevel === Infinity) return null;

		// last paragraph starting at or above y
		let at = 0;
		while (at + 1 < rows.length && rows[at + 1].offsetTop <= y) at++;

		let topIndex = -1;
		for (let k = 0; k <= at; k++) if ((paragraphs[k].level ?? 0) === topLevel) topIndex++;
		return topIndex < 0 ? null : sectionColor(topIndex, 0);
	}

	// Space around the text (of the pane's width): above/below the scrolling area, and left/right inside it
	const PAGE_PAD_Y = '5cqw'; // above and below the scrolling text, always visible
	const PAGE_PAD_X = '15%'; // left and right, inside the text
	const PAGE_PAD_TOP = '4px'; // above and below the first and last rows, so their focus outline is not clipped

	// Synopsis column geometry (px): blip width, gap between lanes, side padding
	const LANE_W = 8;
	const LANE_GAP = 5;
	// Vertical gap between neighbouring blips in a lane (px, taken off each blip's height)
	const BLIP_GAP = 3;
	const PAD = 4;
	let draggingMini = false;
	/** @type {HTMLDivElement | undefined} */
	let synEl = $state(); // synopsis column (whole text, no scrolling)

	function update() {
		if (!mainEl || !miniEl || !miniContent || !miniInner) return;
		// Read from the DOM into locals (never read `m` here: this runs inside an
		// $effect, and reading state it also writes causes an infinite loop)
		const top = mainEl.scrollTop;
		const sh = Math.max(mainEl.scrollHeight, 1);
		const ch = mainEl.clientHeight;
		// The overview lays the text out at the main text's own width (same fonts,
		// same line breaks) and is then scaled down by k to fit the narrow column.
		const w = Math.max(mainContent?.offsetWidth ?? 1, 1);
		const k = miniEl.clientWidth / w;
		const mmH = Math.max(miniInner.offsetHeight * k, 1);

		// Boundaries: each paragraph's top (the first starts at 0), then the very end
		const rowEls = /** @type {HTMLElement[]} */ (Array.from(mainContent?.children ?? []));
		const miniEls = /** @type {HTMLElement[]} */ (Array.from(miniInner.children));
		if (rowEls.length === miniEls.length && rowEls.length > 0) {
			mainB = [0, ...rowEls.slice(1).map((r) => r.offsetTop), sh];
			miniB = [0, ...miniEls.slice(1).map((r) => r.offsetTop * k), mmH];
		} else {
			mainB = [0, sh];
			miniB = [0, mmH];
		}
		const mTop = mapPos(top, mainB, miniB);
		const mBottom = mapPos(top + ch, mainB, miniB);
		m = { top, sh, ch, mmH, mTop, mH: mBottom - mTop, w, k };
		markerColor = sectionColorAt(top + ch / 2);

		// Synoptic blips: one per paragraph row, sized by its real rendered height
		if (synopsis) {
			const total = Math.max(mainContent?.offsetHeight ?? 1, 1);
			const rows = /** @type {HTMLElement[]} */ (Array.from(mainContent?.children ?? []));
			const levels = paragraphs.map((p) => p.level ?? 0);
			const deepest = Math.max(0, ...levels);

			if (deepest > 0 && rows.length === levels.length) {
				// Hierarchical text: one lane per header level present (shallowest first).
				const present = [...new Set(levels.filter((lv) => lv > 0))].sort((x, y) => x - y);
				const laneOf = new Map(present.map((lv, i) => [lv, i]));
				/** @type {typeof blips} */
				const next = [];

				// Text before the first header (lighter blip in the first lane)
				const firstHeader = levels.findIndex((lv) => lv > 0);
				if (firstHeader > 0) {
					const top = rows[0].offsetTop;
					const bottom = rows[firstHeader - 1].offsetTop + rows[firstHeader - 1].offsetHeight;
					next.push({ top: (top / total) * 100, h: ((bottom - top) / total) * 100, lane: 0, minor: true, color: null, title: null, bandTop: 0, bandH: 0, bandY: 0, y: top, label: 'Text before the first section', path: ['Text before the first section'] });
				}

				// A section runs from its header to the next header of the same or higher level
				const topLevel = present[0];
				let topIndex = -1; // which top-level section we are inside
				/** @type {{ title: string, top: number, h: number, y: number } | null} */
				let currentTop = null; // that top-level section's title and extent (%)
				/** @type {{ level: number, title: string }[]} the section and its ancestors, outermost first */
				const trail = [];
				levels.forEach((lv, i) => {
					if (lv === 0) return;
					if (lv === topLevel) topIndex++;
					while (trail.length && trail[trail.length - 1].level >= lv) trail.pop();
					trail.push({ level: lv, title: paragraphs[i].text.replace(/^#{1,6}\s+/, '') });
					let end = i + 1;
					while (end < levels.length && (levels[end] === 0 || levels[end] > lv)) end++;
					const top = rows[i].offsetTop;
					const bottom = rows[end - 1].offsetTop + rows[end - 1].offsetHeight;
					const topPct = (top / total) * 100;
					const hPct = ((bottom - top) / total) * 100;
					const title = paragraphs[i].text.replace(/^#{1,6}\s+/, '');
					if (lv === topLevel) currentTop = { title, top: topPct, h: hPct, y: top };
					// headers above the first top-level header have no top-level parent: use themselves
					const band = currentTop ?? { title, top: topPct, h: hPct, y: top };
					next.push({
						top: topPct,
						h: hPct,
						lane: laneOf.get(lv) ?? 0,
						minor: false,
						color: sectionColor(Math.max(topIndex, 0), laneOf.get(lv) ?? 0),
						title: band.title,
						bandTop: band.top,
						bandH: band.h,
						bandY: band.y,
						y: top,
						label: title,
						path: trail.map((t) => t.title)
					});
				});
				blips = next;
				laneCount = present.length;
			} else {
				// Flat text: one blip per paragraph, sized by its real rendered height
				blips = rows.map((row, i) => ({
					top: (row.offsetTop / total) * 100,
					h: (row.offsetHeight / total) * 100,
					lane: 0,
					minor: false,
					color: null,
					title: null,
					bandTop: 0,
					bandH: 0,
					bandY: 0,
					y: row.offsetTop,
					label: `Paragraph ${i + 1}`,
					path: [`Paragraph ${i + 1}`]
				}));
				laneCount = 1;
			}
		}

		// Keep the viewport marker centred in the overview (the browser clamps
		// scrollTop at the top and bottom, where centring isn't possible)
		const markerCentre = mTop + (mBottom - mTop) / 2;
		miniEl.scrollTop = markerCentre - miniEl.clientHeight / 2;
	}

	// Re-measure whenever sizes change (new text, window or pane resize)
	$effect(() => {
		if (!mainEl || !mainContent || !miniContent || !miniInner) return;
		const ro = new ResizeObserver(update);
		ro.observe(mainEl);
		ro.observe(mainContent);
		if (miniInner) ro.observe(miniInner);
		update();
		return () => ro.disconnect();
	});

	/** Scroll the main area so the clicked/dragged point in the overview is centred */
	/** @param {PointerEvent} e */
	function jumpTo(e) {
		if (!mainEl || !miniContent) return;
		const y = e.clientY - miniContent.getBoundingClientRect().top;
		mainEl.scrollTop = mapPos(y, miniB, mainB) - m.ch / 2;
	}

	/** @param {PointerEvent & { currentTarget: HTMLElement }} e */
	function miniDown(e) {
		draggingMini = true;
		e.currentTarget.setPointerCapture(e.pointerId);
		jumpTo(e);
	}

	/** @param {PointerEvent} e */
	function miniMove(e) {
		if (draggingMini) jumpTo(e);
	}

	/** Scroll the main area so the top of a blip is at the top of the view */
	/** @param {number} y the blip's top in px within the text */
	function goToBlip(y) {
		if (!mainEl) return;
		// keep the text's top padding above the paragraph
		const pad = mainContent ? parseFloat(getComputedStyle(mainContent).paddingTop) : 0;
		mainEl.scrollTop = Math.max(0, y - pad);
	}

	/** @param {PointerEvent} e */
	function synMove(e) {
		trackTip(e);
	}

	/** Keep the tooltip level with the pointer (clamped so it stays inside the column) */
	/** @param {PointerEvent} e */
	function trackTip(e) {
		if (!synEl) return;
		const r = synEl.getBoundingClientRect();
		tipY = e.clientY - r.top; // clamped where it is drawn, since its height depends on its line count
	}
</script>

{#snippet body(/** @type {{ id: string, text: string }} */ para, /** @type {string} */ scope)}
	{#if !para.text}
		<p class="flex-1 whitespace-pre-wrap"><span class="italic text-grey3">empty paragraph</span></p>
	{:else if markdown && isDefinition(para.text)}
		<!-- a reference or footnote definition: shown as plain text; its content appears where it is used -->
		<p class="flex-1 whitespace-pre-wrap text-xs text-grey3">{para.text}</p>
	{:else if markdown}
		<div class="md min-w-0 flex-1">{@html renderMarkdown(para.text, defs, scope + para.id)}</div>
	{:else}
		<p class="flex-1 whitespace-pre-wrap">{para.text}</p>
	{/if}
{/snippet}

<svelte:window onkeydown={onWindowKeydown} />

{#if note}
	<!-- Footnote tooltip: taupe1 with taupe5 text, under (or over) the note mark -->
	<div
		role="tooltip"
		onpointerenter={() => clearTimeout(noteTimer)}
		onpointerleave={closeNote}
		class="md fixed z-40 w-max max-w-sm rounded-2xl border border-taupe3 bg-taupe1 text-sm text-taupe5 shadow-lg"
		style="padding: 2rem; left: clamp(8px, calc({note.x}px - 12rem), calc(100vw - 24.5rem)); {note.above ? `bottom: ${window.innerHeight - note.y + 4}px` : `top: ${note.y + 4}px`}"
	>
		{@html note.html}
	</div>
{/if}

{#if ondelete}<EditMenu hover={editHover} {ondelete} {onexpand} />{/if}
<DropTip {dd} />
{#if oninject}<GapMenu {gap} {oninject} />{/if}

<div class="flex h-full min-h-0">
	<!-- Main paragraph area (scrolls independently) -->
	<!-- The text frame: a buffer of space above and below the scrolling text (cqw = the frame's width) -->
	<div class="min-w-0 flex-1 [container-type:inline-size]">
	<div class="h-full" style="padding-block: {PAGE_PAD_Y}">
	<div bind:this={mainEl} onscroll={update} class="h-full overflow-x-hidden overflow-y-auto">
		<!-- svelte-ignore a11y_no_static_element_interactions -->
			<div
				bind:this={mainContent}
				onpointermove={hoverMove}
				onpointerover={noteOver}
				onpointerout={noteOut}
				onfocusin={noteOver}
				onfocusout={(e) => {
					noteOut(e);
					onFocusout(e);
				}}
				onkeydown={onKeydown}
				onpointerleave={(e) => pointerMoved(e) && gap.leave()}
				ondragover={dragOver}
				ondrop={drop}
				ondragleave={(e) => {
					if (!e.currentTarget.contains(/** @type {Node | null} */ (e.relatedTarget))) dd.drop = null;
				}}
				class="relative"
				style="padding: {PAGE_PAD_TOP} {PAGE_PAD_X}"
			>
			{#each paragraphs as para (para.id)}
				<!-- svelte-ignore a11y_no_static_element_interactions -->
				<div
					data-para={para.id}
					tabindex={isCursor(para.id) ? 0 : -1}
					onfocus={() => {
						if (cursor?.id !== para.id) cursor = { type: (para.level ?? 0) > 0 ? 'section' : 'paragraph', id: para.id };
					}}
					onclick={() => (cursor = { type: (para.level ?? 0) > 0 ? 'section' : 'paragraph', id: para.id })}
					data-drop={onmove ? para.id : undefined}
					data-kind={(para.level ?? 0) > 0 ? 'section' : 'paragraph'}
					data-axis="y"
					draggable={onmove && editing !== para.id ? 'true' : undefined}
					ondragstart={onmove
						? (e) => {
								editHover.clear();
								dd.start(para.id, (para.level ?? 0) > 0 ? 'section' : 'paragraph', e);
							}
						: undefined}
					ondragend={onmove ? () => dd.end() : undefined}
					ondblclick={onedit && (para.level ?? 0) === 0
						? (e) => {
								editCaret = caretOffsetAt(e.currentTarget, e.clientX, e.clientY, para.text);
								editHover.clear();
								gap.clear();
								editing = para.id;
							}
						: undefined}
					onpointerenter={ondelete && !editing
						? (e) => pointerMoved(e) && editHover.enter({ id: para.id, kind: (para.level ?? 0) > 0 ? 'section' : 'paragraph', el: e.currentTarget })
						: undefined}
					onpointerleave={ondelete ? (e) => pointerMoved(e) && editHover.leave() : undefined}
					class="flex gap-2 rounded px-1 py-1.5 {cursor?.type === 'gap' ? 'focus:outline-0' : 'focus:outline-2 focus:outline-violet'} {cursorLine(para.id)} {dd.dragId === para.id ? 'opacity-40' : ''} {dd.classes(para.id, 'y') || gap.classes(para.id) || (ondelete && !dd.dragId && editHover.is(para.id) ? 'bg-grey2/15 outline-2 outline-taupe3' : '')}"
				>
					<span class="text-xs text-gray-500">{para.originalIndex}</span>
					{#if editing === para.id}
						<p
							use:editable={{ text: para.text, caret: editCaret, onfinish: (t) => finishEdit(para.id, t) }}
							class="flex-1 whitespace-pre-wrap outline-none"
						></p>
					{:else}
						{@render body(para, 'main-')}
					{/if}
				</div>
			{:else}
				<p class="text-sm text-gray-500">{empty}</p>
			{/each}
		</div>
		</div>
		</div>
	</div>

	<!-- Overview column: tiny copy of the whole text, scrolls in response -->
	{#if paragraphs.length > 0}
		<div
			bind:this={miniEl}
			role="presentation"
			data-minimap="Regional Linear Minimap"
			aria-label="Regional Linear Minimap"
			onpointerdown={miniDown}
			onpointermove={miniMove}
			onpointerup={() => (draggingMini = false)}
			onpointercancel={() => (draggingMini = false)}
			class="w-24 shrink-0 cursor-pointer touch-none select-none overflow-hidden border-l border-taupe2 bg-taupe1"
		>
			<div bind:this={miniContent} class="relative overflow-hidden" style="height: {m.mmH}px">
				<!-- Same markup and width as the main text, so every line wraps identically,
				     then shrunk to fit the column -->
				<div
					bind:this={miniInner}
					class="absolute top-0 left-0 origin-top-left"
					style="width: {m.w}px; padding: {PAGE_PAD_TOP} {PAGE_PAD_X}; transform: scale({m.k})"
				>
					{#each paragraphs as para (para.id)}
						<div class="flex gap-2 px-1 py-1.5">
							<span class="text-xs text-gray-500">{para.originalIndex}</span>
							{@render body(para, 'mini-')}
						</div>
					{/each}
				</div>

				<!-- Marker showing what the main area currently displays -->
				<div
					class="pointer-events-none absolute inset-x-0 border-y"
					style="--c: {markerColor ?? 'var(--color-taupe2)'}; --edge: {markerColor ? 100 : 50}%; --fill: {markerColor ? 20 : 50}%; border-color: color-mix(in srgb, var(--c) var(--edge), transparent); background-color: color-mix(in srgb, var(--c) var(--fill), transparent); top: {m.mTop}px; height: {m.mH}px"
				></div>
			</div>
		</div>
	{/if}

	<!-- Synopsis column: the whole text at once, no scrolling, as gray blips -->
	{#if synopsis && paragraphs.length > 0}
		<div
			bind:this={synEl}
			role="presentation"
			data-synopsis
			data-minimap="Global Linear Minimap"
			aria-label="Global Linear Minimap"
			onpointermove={synMove}
			class="relative shrink-0 select-none border-l border-taupe2 bg-taupe1"
			style="width: {PAD * 2 + laneCount * LANE_W + (laneCount - 1) * LANE_GAP}px"
		>
			<!-- Hover areas: one per top-level section, the whole part of the column it covers -->
			{#each regions as region (region.top)}
				<div
					role="presentation"
					onpointerenter={(e) => {
						hover = region;
						trackTip(e);
					}}
					onpointerleave={() => (hover = null)}
					onclick={() => goToBlip(region.y)}
					class="absolute inset-x-0 cursor-pointer {hover && hover.top === region.top ? 'bg-taupe2' : ''}"
					style="top: {region.top}%; height: {region.h}%"
				></div>
			{/each}

			{#each blips as blip}
				<button
					type="button"
					aria-label="Go to {blip.label}"
					onclick={() => goToBlip(blip.y)}
					onpointerenter={() => (hoverBlip = blip)}
					onpointerleave={() => (hoverBlip = null)}
					class="absolute cursor-pointer rounded-[1px] {blip.color ? '' : blip.minor ? 'bg-gray-200' : 'bg-gray-500'}"
					style="{blip.color ? `background-color: ${blip.color}; ` : ''}left: {PAD + blip.lane * (LANE_W + LANE_GAP)}px; width: {LANE_W}px; top: {blip.top}%; height: max(calc({blip.h}% - {BLIP_GAP}px), 1px)"
				></button>
			{/each}

			<!-- Marker showing what the main area currently displays -->
			<div
				class="pointer-events-none absolute inset-x-0 border-y border-violet bg-violet/20"
				style="top: {(m.top / m.sh) * 100}%; height: {(m.ch / m.sh) * 100}%"
			></div>

			<!-- Tooltip, to the left of the column. Over a blip: the section and its ancestors,
			     one per line, outermost first. Elsewhere in a top-level section's area: its title. -->
			{#if tipLines.length > 0}
				{@const half = tipLines.length * 11 + 6}
				<div
					role="tooltip"
					class="pointer-events-none absolute right-full z-30 mr-2 w-max max-w-64 -translate-y-1/2 rounded-2xl border border-taupe3 bg-taupe1 px-3 py-1.5 text-xs text-taupe5 shadow-lg"
					style="top: clamp({half}px, {tipY}px, calc(100% - {half}px))"
				>
					<MinimapTooltip lines={tipLines} />
				</div>
			{/if}
		</div>
	{/if}
</div>
