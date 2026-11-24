<script>
	import { untrack } from 'svelte';
	import MinimapTooltip from '#lib/components/MinimapTooltip.svelte';

	/**
	 * Global Hierarchical Minimap: the horizontal counterpart of the Global Linear
	 * Minimap. A bar along the bottom of the hierarchical view shows the whole text
	 * at once as coloured blips, one per section at every header level. Each level
	 * gets its own lane (a thin horizontal strip, shallowest at the top), and a
	 * section's blip spans its header and everything inside it, so a top-level blip
	 * covers all the blips of its subsections. Blips use the section colours of the
	 * containers. Text before the first header is a lighter blip. A blip's width is
	 * proportional to the amount of text in its section.
	 *
	 * Clicking a blip opens that section (and the sections around it), revealing its
	 * children, and brings the opened containers into view.
	 *
	 * Two violet markers show where you are:
	 *  - a box around the whole area currently in view: the span of text visible
	 *    across all the rows of containers
	 *  - a line, drawn as a double line like the marker of the vertical Global Linear
	 *    Minimap, at the start of the deepest section that is open
	 *
	 * Hovering a top-level section's part of the bar (its whole area, not just the
	 * blips) shades it in taupe2 and shows its title. Clicking that background
	 * (anywhere but on a blip) scrolls the first row to the beginning of the top-level
	 * section. Hovering a blip shows the section's name preceded by its ancestors'
	 * names, one per line (as in the Global Linear Minimap).
	 *
	 * @type {{
	 *   paragraphs: { id: string, text: string }[],
	 *   tree: import('#lib/utilities/buildSections.js').SectionChild[],
	 *   colors: Map<string, string>,
	 *   selected: string[],
	 *   onopen: (ids: string[]) => void,
	 *   onjump?: (id: string) => void,
	 *   getHost: () => HTMLElement | null,
	 *   layoutKey: string
	 * }}
	 *
	 * `selected` is the open section at each level (outermost first). `onopen` is called
	 * with the ids of a clicked section and its ancestors, outermost first. `getHost`
	 * returns the element holding the rows of containers; rows are rebuilt as sections
	 * open and close, so `layoutKey` changes then and the bar re-attaches.
	 */
	let { paragraphs, tree, colors, selected, onopen, onjump = undefined, getHost, layoutKey } = $props();

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
	 * Everything the bar draws, in % of the whole text: blips and the top-level
	 * section areas; plus where every node starts and ends (as a fraction 0..1) for
	 * the marker maths.
	 */
	let layout = $derived.by(() => {
		/** @type {{ start: number, end: number, lane: number, minor: boolean, id: string | null, path: string[], ids: string[] }[]} */
		const blips = [];
		/** @type {{ id: string, start: number }[]} */
		const tops = [];
		/** @type {Map<string, number>} */
		const starts = new Map();
		/** @type {Map<string, number>} */
		const ends = new Map();
		const hasSections = tree.some((n) => n.kind === 'section');
		let cursor = 0;
		let lanes = 1;

		/**
		 * @param {import('#lib/utilities/buildSections.js').SectionChild[]} list
		 * @param {number} depth
		 * @param {string[]} trail titles of the enclosing sections, outermost first
		 * @param {string[]} idTrail their ids
		 */
		function walk(list, depth, trail, idTrail) {
			let n = 0; // position among paragraphs, for the names of unstructured text
			for (const node of list) {
				const start = cursor;
				const id = node.kind === 'section' ? node.id : node.paragraph.id;
				if (depth === 0) tops.push({ id, start });
				starts.set(id, start);
				if (node.kind === 'paragraph') {
					cursor += weight(node.paragraph.text);
					// text before the first header is lighter; with no headers at all every paragraph is a blip
					n++;
					if (depth === 0) {
						const name = hasSections ? 'Text before the first section' : `Paragraph ${n}`;
						blips.push({ start, end: cursor, lane: 0, minor: hasSections, id: null, path: [name], ids: [] });
					}
				} else {
					cursor += weight(node.header.text);
					walk(node.children, depth + 1, [...trail, node.title], [...idTrail, node.id]);
					blips.push({ start, end: cursor, lane: depth, minor: false, id: node.id, path: [...trail, node.title], ids: [...idTrail, node.id] });
					lanes = Math.max(lanes, depth + 1);
				}
				ends.set(id, cursor);
			}
		}
		walk(tree, 0, [], []);

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
			/** node id -> where it starts / ends, as a fraction of the whole text */
			starts: new Map([...starts].map(([k, v]) => [k, v / total])),
			ends: new Map([...ends].map(([k, v]) => [k, v / total]))
		};
	});

	let barH = $derived(PAD * 2 + layout.lanes * LANE_H + (layout.lanes - 1) * LANE_GAP);

	// The box: the area in view across all rows, in % of the bar
	let view = $state({ left: 0, w: 100 });

	/** The line: the start of the deepest open section, in % of the bar (null when none is open) */
	let linePos = $derived.by(() => {
		const id = [...selected].reverse().find((x) => layout.starts.has(x));
		return id === undefined ? null : /** @type {number} */ (layout.starts.get(id)) * 100;
	});

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

	/** The rows of containers currently on screen, with the element that scrolls each. */
	function rowsOnScreen() {
		const host = getHost();
		if (!host) return [];
		return Array.from(host.querySelectorAll('[data-row]')).flatMap((row) => {
			const scroller = row.closest('.overflow-auto');
			return scroller instanceof HTMLElement ? [{ row, scroller }] : [];
		});
	}

	function update() {
		let lo = Infinity;
		let hi = -Infinity;
		for (const { row, scroller: s } of rowsOnScreen()) {
			const els = Array.from(row.querySelectorAll('[data-node]')).filter((el) => el.closest('[data-row]') === row);
			if (els.length === 0) continue;
			const ids = els.map((el) => /** @type {HTMLElement} */ (el).dataset.node ?? '');
			const fr = [...ids.map((id) => layout.starts.get(id)), layout.ends.get(ids[ids.length - 1])];
			if (fr.some((v) => v === undefined)) continue;
			const sRect = s.getBoundingClientRect();
			const px = [...els.map((el) => el.getBoundingClientRect().left - sRect.left + s.scrollLeft), els[els.length - 1].getBoundingClientRect().right - sRect.left + s.scrollLeft];
			lo = Math.min(lo, mapPos(s.scrollLeft, px, /** @type {number[]} */ (fr)));
			hi = Math.max(hi, mapPos(s.scrollLeft + s.clientWidth, px, /** @type {number[]} */ (fr)));
		}
		view = lo === Infinity ? { left: 0, w: 100 } : { left: lo * 100, w: (hi - lo) * 100 };
	}

	// Re-measure whenever the rows are rebuilt, resized or scrolled
	$effect(() => {
		// dependencies: the text, the section tree and the row layout
		void tree;
		void layoutKey;
		void layout;
		const rows = rowsOnScreen();
		if (rows.length === 0) return;
		const ro = new ResizeObserver(() => untrack(update));
		const scrollers = new Set(rows.map((r) => r.scroller));
		for (const { row } of rows) ro.observe(row);
		for (const s of scrollers) {
			ro.observe(s);
			s.addEventListener('scroll', update);
		}
		untrack(update);
		return () => {
			ro.disconnect();
			for (const s of scrollers) s.removeEventListener('scroll', update);
		};
	});

	/**
	 * Scroll the first row so the container of the top-level section `id` sits at the
	 * left, just after the pinned level marker.
	 * @param {string} id
	 */
	function goToSection(id) {
		const first = rowsOnScreen()[0];
		const el = first?.row.querySelector(`[data-node="${id}"]`);
		if (!first || !el) return;
		const s = first.scroller;
		const left = el.getBoundingClientRect().left - s.getBoundingClientRect().left + s.scrollLeft;
		s.scrollLeft = left - 40; // 32px level marker + 8px gap
		onjump?.(id);
	}

	/** Scroll the first row to the very start or end of the text
	 * @param {'start' | 'end'} where */
	function jumpTo(where) {
		const s = rowsOnScreen()[0]?.scroller;
		if (s) s.scrollTo({ left: where === 'start' ? 0 : s.scrollWidth });
	}

	let hover = $state(null);
	/** the blip currently under the pointer (null when none) */
	let hoverBlip = $state(null);
	/** tooltip lines: a hovered blip's section and its ancestors, else the hovered area's top-level title */
	let tipLines = $derived(hoverBlip ? hoverBlip.path : hover ? [hover.title] : []);
	let tipX = $state(0); // tooltip position along the bar (px)

	/** Keep the tooltip above the pointer (clamped so it stays inside the bar) */
	/** @param {PointerEvent} e */
	function trackTip(e) {
		if (!barEl) return;
		const r = barEl.getBoundingClientRect();
		const half = Math.min(128, r.width / 2);
		tipX = Math.min(Math.max(e.clientX - r.left, half), Math.max(r.width - half, half));
	}
</script>

{#snippet jump(/** @type {'start' | 'end'} */ where)}
	<button
		type="button"
		aria-label="Jump to {where}"
		onclick={() => jumpTo(where)}
		class="group relative flex shrink-0 items-center justify-center text-taupe5 hover:bg-taupe2"
		style="width: {barH}px; height: {barH}px"
	>
		<svg viewBox="0 0 20 20" fill="currentColor" class="h-3/5 w-3/5"><path d={where === 'start' ? 'M13 4l1.4 1.4L9.8 10l4.6 4.6L13 16l-6-6z' : 'M7 4L5.6 5.4 10.2 10l-4.6 4.6L7 16l6-6z'} /></svg>
		<span role="tooltip" class="pointer-events-none absolute bottom-full z-30 mb-2 hidden w-max rounded-2xl border border-taupe3 bg-taupe1 px-3 py-1.5 text-xs text-taupe5 shadow-lg group-hover:block {where === 'start' ? 'left-0' : 'right-0'}">Jump to {where}</span>
	</button>
{/snippet}

{#if paragraphs.length > 0}
	<div class="flex w-full shrink-0 border-t border-taupe2 bg-taupe1" style="height: {barH}px">
	<!-- jump to the start: a small square caret spanning the bar's height -->
	{@render jump('start')}
	<div
		bind:this={barEl}
		role="presentation"
		data-minimap="Global Hierarchical Minimap"
		aria-label="Global Hierarchical Minimap"
		onpointermove={trackTip}
		class="relative h-full min-w-0 flex-1 select-none"
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
				onclick={() => goToSection(region.id)}
				class="absolute inset-y-0 cursor-pointer {hover && hover.id === region.id ? 'bg-taupe2' : ''}"
				style="left: {region.left}%; width: {region.w}%"
			></div>
		{/each}

		{#each layout.blips as blip}
			{@const color = blip.id ? colors.get(blip.id) : null}
			<!-- svelte-ignore a11y_click_events_have_key_events -->
			<div
				role="presentation"
				onpointerenter={() => (hoverBlip = blip)}
				onpointerleave={() => (hoverBlip = null)}
				onclick={(e) => {
					e.stopPropagation(); // not a click on the section's background
					if (blip.id) onopen(blip.ids);
				}}
				class="absolute rounded-[1px] {blip.id ? 'cursor-pointer' : ''} {color ? '' : blip.minor ? 'bg-gray-200' : 'bg-gray-500'}"
				style="{color ? `background-color: ${color}; ` : ''}top: {PAD + blip.lane * (LANE_H + LANE_GAP)}px; height: {LANE_H}px; left: {blip.left}%; width: max(calc({blip.w}% - {BLIP_GAP}px), 1px)"
			></div>
		{/each}

		<!-- Marker 1, the box: the whole area currently in view, across all rows -->
		<div
			class="pointer-events-none absolute inset-y-0 border-x border-accent bg-accent/20"
			style="left: {view.left}%; width: {view.w}%"
		></div>

		<!-- Marker 2, the line (a double line): the start of the deepest open section -->
		{#if linePos !== null}
			<div
				class="pointer-events-none absolute inset-y-0 w-[5px] -translate-x-1/2 border-x border-accent bg-accent/20"
				style="left: {linePos}%"
			></div>
		{/if}

		<!-- Tooltip, above the bar. Over a blip: the section and its ancestors, one per line,
		     outermost first. Elsewhere in a top-level section's area: its title. -->
		{#if tipLines.length > 0}
			<div
				role="tooltip"
				class="pointer-events-none absolute bottom-full z-30 mb-2 w-max max-w-64 -translate-x-1/2 rounded-2xl border border-taupe3 bg-taupe1 px-3 py-1.5 text-xs text-taupe5 shadow-lg"
				style="left: {tipX}px"
			>
				<MinimapTooltip lines={tipLines} />
			</div>
		{/if}
	</div>
	{@render jump('end')}
	</div>
{/if}
