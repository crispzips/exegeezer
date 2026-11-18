<script>
	import { untrack } from 'svelte';

	/**
	 * Global Hierarchical Minimap: the horizontal counterpart of the Global Linear
	 * Minimap. A bar along the bottom of the hierarchical view shows the whole text
	 * at once as coloured blips, one per section at every header level. Each level
	 * gets its own lane (a thin horizontal strip, shallowest at the top), and a
	 * section's blip spans its header and everything inside it, so a top-level blip
	 * covers all the blips of its subsections. Blips use the section colours of the
	 * containers. Text before the first header is a lighter blip.
	 *
	 * The bar follows the first row of containers (the top-level sections): a violet
	 * marker shows the part of the text that row currently displays, and clicking or
	 * dragging in the bar scrolls that row. Hovering a top-level section's part of the
	 * bar (its whole area, not just the blips) shades it in taupe2 and shows its title.
	 *
	 * A blip's width is proportional to the amount of text in its section.
	 *
	 * @type {{
	 *   paragraphs: { id: string, text: string }[],
	 *   tree: import('#lib/utilities/buildSections.js').SectionChild[],
	 *   colors: Map<string, string>,
	 *   getScroller: () => HTMLElement | null,
	 *   layoutKey: string
	 * }}
	 *
	 * `getScroller` returns the scrolling element that holds the first row; the row
	 * is rebuilt when a second row opens or closes, so `layoutKey` changes then and
	 * the bar re-attaches.
	 */
	let { paragraphs, tree, colors, getScroller, layoutKey } = $props();

	// Geometry (px): blip thickness, gap between lanes, padding around the lanes,
	// and the gap left between neighbouring blips in a lane
	const LANE_H = 8;
	const LANE_GAP = 5;
	const PAD = 4;
	const BLIP_GAP = 3;

	/** A paragraph's share of the bar follows the length of its text (with a floor). */
	/** @param {string} text */
	const weight = (text) => Math.max(text.length, 30);

	/**
	 * Everything the bar draws, in % of the whole text: blips, the top-level
	 * section areas, and where each top-level node starts (for the marker maths).
	 */
	let layout = $derived.by(() => {
		/** @type {{ start: number, end: number, lane: number, minor: boolean, id: string | null }[]} */
		const blips = [];
		/** @type {{ id: string, start: number }[]} */
		const tops = [];
		const hasSections = tree.some((n) => n.kind === 'section');
		let cursor = 0;
		let lanes = 1;

		/** @param {import('#lib/utilities/buildSections.js').SectionChild[]} list @param {number} depth */
		function walk(list, depth) {
			for (const node of list) {
				const start = cursor;
				if (depth === 0) tops.push({ id: node.kind === 'section' ? node.id : node.paragraph.id, start });
				if (node.kind === 'paragraph') {
					cursor += weight(node.paragraph.text);
					// text before the first header is lighter; with no headers at all every paragraph is a blip
					if (depth === 0) blips.push({ start, end: cursor, lane: 0, minor: hasSections, id: null });
				} else {
					cursor += weight(node.header.text);
					walk(node.children, depth + 1);
					blips.push({ start, end: cursor, lane: depth, minor: false, id: node.id });
					lanes = Math.max(lanes, depth + 1);
				}
			}
		}
		walk(tree, 0);

		const total = Math.max(cursor, 1);
		const pct = (/** @type {number} */ v) => (v / total) * 100;

		/** top-level section areas tile the bar: each runs to the next one's start */
		const regions = tops
			.map((t, i) => ({ ...t, node: tree[i] }))
			.filter((t) => t.node.kind === 'section')
			.map((t) => {
				const at = tops.findIndex((x) => x.id === t.id);
				const next = tops[at + 1];
				return {
					id: t.id,
					title: t.node.kind === 'section' ? t.node.title : '',
					left: pct(t.start),
					w: pct(next ? next.start : total) - pct(t.start)
				};
			});

		return {
			lanes,
			blips: blips.map((b) => ({ ...b, left: pct(b.start), w: pct(b.end) - pct(b.start) })),
			regions,
			/** start of each top-level node as a fraction of the whole text, then 1 */
			fractions: [...tops.map((t) => t.start / total), 1]
		};
	});

	let barH = $derived(PAD * 2 + layout.lanes * LANE_H + (layout.lanes - 1) * LANE_GAP);

	// View state, in % of the bar
	let view = $state({ left: 0, w: 100 });
	/** pixel left edge of each top-level node in the scroller, then the right edge of the last */
	/** @type {number[]} */
	let pxB = [0, 1];

	/**
	 * Piecewise-linear map of `x` from boundary list `from` to boundary list `to`
	 * (the same idea as the linear minimap: positions are mapped node by node,
	 * because containers are a fixed width however much text they hold).
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

	/** @type {HTMLDivElement | undefined} */
	let barEl = $state();
	/** @type {HTMLElement | null} */
	let scroller = null;

	function update() {
		const s = getScroller();
		if (!s) return;
		scroller = s;
		const row = s.querySelector('[data-row="0"]');
		const els = row ? Array.from(row.querySelectorAll('[data-node]')).filter((el) => el.closest('[data-row]') === row) : [];
		const fr = layout.fractions;
		const sRect = s.getBoundingClientRect();
		if (els.length === fr.length - 1 && els.length > 0) {
			pxB = [...els.map((el) => el.getBoundingClientRect().left - sRect.left + s.scrollLeft), els[els.length - 1].getBoundingClientRect().right - sRect.left + s.scrollLeft];
		} else {
			pxB = [0, Math.max(s.scrollWidth, 1)];
		}
		const frB = els.length === fr.length - 1 && els.length > 0 ? fr : [0, 1];
		const l = mapPos(s.scrollLeft, pxB, frB);
		const r = mapPos(s.scrollLeft + s.clientWidth, pxB, frB);
		view = { left: l * 100, w: (r - l) * 100 };
	}

	// Re-measure whenever the row is rebuilt, resized or scrolled
	$effect(() => {
		// dependencies: the text, the section tree and the row layout
		void tree;
		void layoutKey;
		void layout;
		const s = getScroller();
		if (!s) return;
		const row = s.querySelector('[data-row="0"]');
		const ro = new ResizeObserver(() => untrack(update));
		ro.observe(s);
		if (row) ro.observe(row);
		s.addEventListener('scroll', update);
		untrack(update);
		return () => {
			ro.disconnect();
			s.removeEventListener('scroll', update);
		};
	});

	/** fraction of the text under the pointer (0..1) */
	/** @param {PointerEvent} e */
	function fracAt(e) {
		if (!barEl) return 0;
		const r = barEl.getBoundingClientRect();
		return Math.min(1, Math.max(0, (e.clientX - r.left) / Math.max(r.width, 1)));
	}

	/** Scroll the first row so the clicked/dragged point is centred */
	/** @param {PointerEvent} e */
	function jumpTo(e) {
		if (!scroller) return;
		const frB = layout.fractions.length - 1 === pxB.length - 1 ? layout.fractions : [0, 1];
		scroller.scrollLeft = mapPos(fracAt(e), frB, pxB) - scroller.clientWidth / 2;
	}

	let dragging = false;
	let hover = $state(null);
	let tipX = $state(0); // tooltip position along the bar (px)

	/** @param {PointerEvent & { currentTarget: HTMLElement }} e */
	function down(e) {
		dragging = true;
		e.currentTarget.setPointerCapture(e.pointerId);
		jumpTo(e);
	}

	/** @param {PointerEvent} e */
	function move(e) {
		trackTip(e);
		if (dragging) jumpTo(e);
	}

	/** Keep the tooltip above the pointer (clamped so it stays inside the bar) */
	/** @param {PointerEvent} e */
	function trackTip(e) {
		if (!barEl) return;
		const r = barEl.getBoundingClientRect();
		const half = Math.min(128, r.width / 2);
		tipX = Math.min(Math.max(e.clientX - r.left, half), Math.max(r.width - half, half));
	}
</script>

{#if paragraphs.length > 0}
	<div
		bind:this={barEl}
		role="presentation"
		data-minimap="Global Hierarchical Minimap"
		aria-label="Global Hierarchical Minimap"
		onpointerdown={down}
		onpointermove={move}
		onpointerup={() => (dragging = false)}
		onpointercancel={() => (dragging = false)}
		class="relative w-full shrink-0 cursor-pointer touch-none select-none border-t border-taupe2 bg-taupe1"
		style="height: {barH}px"
	>
		<!-- Hover areas: one per top-level section, the whole part of the bar it covers -->
		{#each layout.regions as region (region.id)}
			<div
				role="presentation"
				onpointerenter={(e) => {
					hover = region;
					trackTip(e);
				}}
				onpointerleave={() => (hover = null)}
				class="absolute inset-y-0 {hover && hover.id === region.id ? 'bg-taupe2' : ''}"
				style="left: {region.left}%; width: {region.w}%"
			></div>
		{/each}

		{#each layout.blips as blip}
			{@const color = blip.id ? colors.get(blip.id) : null}
			<div
				class="pointer-events-none absolute rounded-[1px] {color ? '' : blip.minor ? 'bg-gray-200' : 'bg-gray-500'}"
				style="{color ? `background-color: ${color}; ` : ''}top: {PAD + blip.lane * (LANE_H + LANE_GAP)}px; height: {LANE_H}px; left: {blip.left}%; width: max(calc({blip.w}% - {BLIP_GAP}px), 1px)"
			></div>
		{/each}

		<!-- Marker showing what the first row currently displays -->
		<div
			class="pointer-events-none absolute inset-y-0 border-x border-violet bg-violet/20"
			style="left: {view.left}%; width: {view.w}%"
		></div>

		<!-- Tooltip: the top-level section's title, above the bar -->
		{#if hover}
			<div
				role="tooltip"
				class="pointer-events-none absolute bottom-full z-30 mb-2 max-w-64 -translate-x-1/2 truncate rounded bg-dark px-2 py-1 text-xs text-taupe1 shadow-lg"
				style="left: {tipX}px"
			>
				{hover.title}
			</div>
		{/if}
	</div>
{/if}
