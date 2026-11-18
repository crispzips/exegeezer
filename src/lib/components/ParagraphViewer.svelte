<script>
	import { sectionColor } from '#lib/utilities/sectionColor.js';

	/**
	 * A scrolling list of paragraphs with a minimap-style overview column.
	 * The overview appears only when there is text, shows a tiny copy of the whole
	 * text, and keeps a violet marker (centred where possible) on the visible part.
	 * Clicking or dragging in the overview scrolls the main area.
	 *
	 * @type {{
	 *   paragraphs: { id: string, originalIndex: number, text: string, level?: number }[],
	 *   empty?: string,
	 *   synopsis?: boolean
	 * }}
	 *
	 * With `synopsis`, a far-right column also shows the whole text at once, with
	 * no scrolling, as gray blips whose heights follow each paragraph's real height,
	 * plus a violet marker on the visible part. Click or drag in it to jump.
	 * For hierarchical text (paragraphs with a header `level`), every section at
	 * every header level is a blip. Each header level gets its own lane (a thin
	 * vertical strip, shallowest on the left), and a section's blip spans from its
	 * header to the next header of the same or a higher level, so a ## blip covers
	 * all the ### blips inside it. Text before the first header is a lighter blip.
	 * Each top-level section gets the next Solarized accent colour from the theme
	 * (cycling when they run out); its subsections use progressively darker shades
	 * of that colour. Hovering anywhere in a top-level section's part of the column (its
	 * whole bounding area, not just the blips) shows its title in a tooltip and
	 * shades that area in taupe2.
	 * The overview column's marker takes the colour of the top-level section the
	 * visible text is currently in (taupe2 at 50% opacity when outside any section).
	 */
	let { paragraphs, empty = 'No text yet.', synopsis = false } = $props();

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
	 * @type {{ top: number, h: number, lane: number, minor: boolean, color: string | null,
	 *          title: string | null, bandTop: number, bandH: number }[]}
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
		/** @type {Map<number, { title: string, top: number, h: number }>} */
		const seen = new Map();
		for (const b of blips) {
			if (b.title && !seen.has(b.bandTop)) seen.set(b.bandTop, { title: b.title, top: b.bandTop, h: b.bandH });
		}
		const list = [...seen.values()].sort((a, b) => a.top - b.top);
		return list.map((r, i) => ({ ...r, h: (list[i + 1]?.top ?? 100) - r.top }));
	});
	/** the section area currently hovered (null when none) */
	let hover = $state(null);
	let tipY = $state(0); // tooltip height inside the synopsis column (px)

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

	// Synopsis column geometry (px): blip width, gap between lanes, side padding
	const LANE_W = 8;
	const LANE_GAP = 5;
	// Vertical gap between neighbouring blips in a lane (px, taken off each blip's height)
	const BLIP_GAP = 3;
	const PAD = 4;
	let draggingMini = false;
	/** @type {HTMLDivElement | undefined} */
	let synEl = $state(); // synopsis column (whole text, no scrolling)
	let draggingSyn = false;

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
					next.push({ top: (top / total) * 100, h: ((bottom - top) / total) * 100, lane: 0, minor: true, color: null, title: null, bandTop: 0, bandH: 0 });
				}

				// A section runs from its header to the next header of the same or higher level
				const topLevel = present[0];
				let topIndex = -1; // which top-level section we are inside
				/** @type {{ title: string, top: number, h: number } | null} */
				let currentTop = null; // that top-level section's title and extent (%)
				levels.forEach((lv, i) => {
					if (lv === 0) return;
					if (lv === topLevel) topIndex++;
					let end = i + 1;
					while (end < levels.length && (levels[end] === 0 || levels[end] > lv)) end++;
					const top = rows[i].offsetTop;
					const bottom = rows[end - 1].offsetTop + rows[end - 1].offsetHeight;
					const topPct = (top / total) * 100;
					const hPct = ((bottom - top) / total) * 100;
					const title = paragraphs[i].text.replace(/^#{1,6}\s+/, '');
					if (lv === topLevel) currentTop = { title, top: topPct, h: hPct };
					// headers above the first top-level header have no top-level parent: use themselves
					const band = currentTop ?? { title, top: topPct, h: hPct };
					next.push({
						top: topPct,
						h: hPct,
						lane: laneOf.get(lv) ?? 0,
						minor: false,
						color: sectionColor(Math.max(topIndex, 0), laneOf.get(lv) ?? 0),
						title: band.title,
						bandTop: band.top,
						bandH: band.h
					});
				});
				blips = next;
				laneCount = present.length;
			} else {
				// Flat text: one blip per paragraph, sized by its real rendered height
				blips = rows.map((row) => ({
					top: (row.offsetTop / total) * 100,
					h: (row.offsetHeight / total) * 100,
					lane: 0,
					minor: false,
					color: null,
					title: null,
					bandTop: 0,
					bandH: 0
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

	/** Scroll the main area so the clicked/dragged point in the synopsis is centred */
	/** @param {PointerEvent} e */
	function synJumpTo(e) {
		if (!mainEl || !synEl) return;
		const r = synEl.getBoundingClientRect();
		const frac = Math.min(1, Math.max(0, (e.clientY - r.top) / Math.max(r.height, 1)));
		mainEl.scrollTop = frac * m.sh - m.ch / 2;
	}

	/** @param {PointerEvent & { currentTarget: HTMLElement }} e */
	function synDown(e) {
		draggingSyn = true;
		e.currentTarget.setPointerCapture(e.pointerId);
		synJumpTo(e);
	}

	/** @param {PointerEvent} e */
	function synMove(e) {
		trackTip(e);
		if (draggingSyn) synJumpTo(e);
	}

	/** Keep the tooltip level with the pointer (clamped so it stays inside the column) */
	/** @param {PointerEvent} e */
	function trackTip(e) {
		if (!synEl) return;
		const r = synEl.getBoundingClientRect();
		tipY = Math.min(Math.max(e.clientY - r.top, 14), Math.max(r.height - 14, 14));
	}
</script>

<div class="flex h-full min-h-0">
	<!-- Main paragraph area (scrolls independently) -->
	<div bind:this={mainEl} onscroll={update} class="min-w-0 flex-1 overflow-y-auto">
		<div bind:this={mainContent} class="relative space-y-2 p-3">
			{#each paragraphs as para (para.id)}
				<div class="flex gap-2">
					<span class="text-xs text-gray-500">{para.originalIndex}</span>
					<p class="flex-1 whitespace-pre-wrap">{para.text}</p>
				</div>
			{:else}
				<p class="text-sm text-gray-500">{empty}</p>
			{/each}
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
					class="absolute top-0 left-0 origin-top-left space-y-2 p-3"
					style="width: {m.w}px; transform: scale({m.k})"
				>
					{#each paragraphs as para (para.id)}
						<div class="flex gap-2">
							<span class="text-xs text-gray-500">{para.originalIndex}</span>
							<p class="flex-1 whitespace-pre-wrap">{para.text}</p>
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
			onpointerdown={synDown}
			onpointermove={synMove}
			onpointerup={() => (draggingSyn = false)}
			onpointercancel={() => (draggingSyn = false)}
			class="relative shrink-0 cursor-pointer touch-none select-none border-l border-taupe2 bg-taupe1"
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
					class="absolute inset-x-0 {hover && hover.top === region.top ? 'bg-taupe2' : ''}"
					style="top: {region.top}%; height: {region.h}%"
				></div>
			{/each}

			{#each blips as blip}
				<div
					class="pointer-events-none absolute rounded-[1px] {blip.color ? '' : blip.minor ? 'bg-gray-200' : 'bg-gray-500'}"
					style="{blip.color ? `background-color: ${blip.color}; ` : ''}left: {PAD + blip.lane * (LANE_W + LANE_GAP)}px; width: {LANE_W}px; top: {blip.top}%; height: max(calc({blip.h}% - {BLIP_GAP}px), 1px)"
				></div>
			{/each}

			<!-- Marker showing what the main area currently displays -->
			<div
				class="pointer-events-none absolute inset-x-0 border-y border-violet bg-violet/20"
				style="top: {(m.top / m.sh) * 100}%; height: {(m.ch / m.sh) * 100}%"
			></div>

			<!-- Tooltip: the top-level section's title, to the left of the column -->
			{#if hover}
				<div
					role="tooltip"
					class="pointer-events-none absolute right-full z-30 mr-2 max-w-64 -translate-y-1/2 truncate rounded bg-dark px-2 py-1 text-xs text-taupe1 shadow-lg"
					style="top: {tipY}px"
				>
					{hover.title}
				</div>
			{/if}
		</div>
	{/if}
</div>
