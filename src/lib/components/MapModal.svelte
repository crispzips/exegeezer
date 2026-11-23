<script>
	import { tick } from 'svelte';
	import { buildSections } from '#lib/utilities/buildSections.js';
	import { colorSections } from '#lib/utilities/sectionColor.js';
	import MinimapTooltip from '#lib/components/MinimapTooltip.svelte';

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
	 *   onchoose?: (choice: { front: string[], back: string[] }) => void,
	 *   onhover?: (id: string | null) => void
	 * }}
	 */
	let { open = $bindable(false), title = '', paragraphs, onnavigate, mode = 'navigate', onchoose, onhover } = $props();
	const picking = $derived(mode === 'matter');

	/** the root's label: the text's title, or a placeholder when it has none */
	let rootTitle = $derived(title.trim() && title.trim() !== 'Untitled' ? title.trim() : 'Unnamed text');

	// Geometry (px, before zoom)
	const LEVEL_H = 130; // distance between levels (room for labels beneath the bubbles)
	const SLOT_W = 56;
	const SLOT_W_TOP = 2 * 56 + 30; // with only the top-level row shown, the largest bubbles must not touch
	const R_MIN = 5; // radius of the smallest bubble in a row of subsections
	const R_MIN_TOP = 14; // the same for the top-level sections, which are drawn larger
	const CURVE = 0.7; // below 1 lifts mid-size bubbles so one huge section does not flatten its row
	const PCT_PX = (8 * 4) / 3; // 8 pt, kept the same on screen however far the map is zoomed
	const R_MAX = 24; // radius of the largest bubble in a row of subsections
	const R_MAX_TOP = 56; // the same for the top-level sections
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

	/**
	 * @typedef {{ id: string | null, title: string, depth: number, x: number, y: number, r: number, trail: string[], ids: string[], own: number, size: number, frontmatter: boolean, backmatter: boolean }} MapNode
	 */

	/** The tree laid out: nodes, and the links between a node and its parent. */
	let graph = $derived.by(() => {
		/** @type {MapNode[]} */
		const nodes = [];
		/** @type {{ from: MapNode, to: MapNode }[]} */
		const links = [];
		/** all the text there is, headers included: what the percentages are shares of */
		const total = Math.max(1, paragraphs.reduce((n, p) => n + p.text.length, 0));
		let row = 0;

		/**
		 * @param {import('#lib/utilities/buildSections.js').Section} sec
		 * @param {number} depth
		 * @param {MapNode} parent
		 */
		function place(sec, depth, parent) {
			const own = sec.children.reduce((n, c) => n + (c.kind === 'paragraph' ? c.paragraph.text.length : 0), 0);
			// the whole section's text, descendants included (what its percentage is of)
			/** @param {import('#lib/utilities/buildSections.js').Section} x @returns {number} */
			const whole = (x) => x.header.text.length + x.children.reduce((n, c) => n + (c.kind === 'paragraph' ? c.paragraph.text.length : whole(c)), 0);
			/** @type {MapNode} */
			const node = {
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
				trail: [...parent.trail, sec.title],
				ids: [...parent.ids, sec.id]
			};
			node.size = whole(sec);
			nodes.push(node);
			links.push({ from: parent, to: node });
			const subs = picking ? [] : sec.children.filter((c) => c.kind === 'section');
			if (subs.length === 0) node.x = row++ * (picking ? SLOT_W_TOP : SLOT_W);
			else {
				const xs = subs.map((s) => place(s, depth + 1, node).x);
				node.x = (xs[0] + xs[xs.length - 1]) / 2;
			}
			return node;
		}

		/** @type {MapNode} */
		const root = { id: null, title: rootTitle, depth: 0, x: 0, y: 0, r: 8, trail: [], ids: [], own: 0, size: 0, frontmatter: false, backmatter: false };
		const tops = tree.filter((n) => n.kind === 'section');
		if (tops.length > 0) {
			const xs = tops.map((s) => place(s, 1, root).x);
			root.x = (xs[0] + xs[xs.length - 1]) / 2;
		}
		// Size each bubble against the others in its row: the radius grows with the text
		// in the section (as a power of its share of the row's largest, see CURVE), from the row's minimum (none) to its maximum (the row's largest); top-level rows are larger.
		// Back matter is left out of the sums and drawn at the minimum size.
		/** @type {Map<number, number>} */
		const rowMax = new Map();
		for (const n of nodes) if (!n.backmatter) rowMax.set(n.depth, Math.max(rowMax.get(n.depth) ?? 0, n.own));
		for (const n of nodes) if (n.backmatter) n.own = 0;
		for (const n of nodes) {
			const [lo, hi] = n.depth === 1 ? [R_MIN_TOP, R_MAX_TOP] : [R_MIN, R_MAX];
			n.r = lo + (hi - lo) * Math.pow(n.own / (rowMax.get(n.depth) || 1), CURVE);
		}
		// the top-level bubbles hang from one line: their bottoms (and so their labels) are level
		const topR = Math.max(0, ...nodes.filter((n) => n.depth === 1).map((n) => n.r));
		for (const n of nodes) if (n.depth === 1) n.y += topR - n.r;
		// percentages are shares of the text without the back matter
		const margin = nodes.filter((n) => n.depth === 1 && n.backmatter).reduce((n, x) => n + x.size, 0);
		const counted = Math.max(1, total - margin);
		root.size = counted;
		return { total: counted, root, nodes, links, empty: tops.length === 0 };
	});

	/** A smooth link: leaves the parent heading down and enters the child heading down (a vertical S). */
	/** @param {MapNode} a @param {MapNode} b */
	function curve(a, b) {
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
	let labelRoom = $derived.by(() => {
		/** @type {Map<number, number[]>} */
		const rows = new Map();
		for (const n of graph.nodes) rows.set(n.depth, [...(rows.get(n.depth) ?? []), n.x]);
		for (const xs of rows.values()) xs.sort((a, b) => a - b);
		return new Map(
			graph.nodes.map((n) => {
				const xs = rows.get(n.depth) ?? [];
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
		if (!box.w || !box.h || graph.empty) return;
		const xs = graph.nodes.map((n) => n.x);
		const ys = graph.nodes.map((n) => n.y);
		const pad = 60;
		const minX = Math.min(...xs, graph.root.x) - 40;
		const maxX = Math.max(...xs, graph.root.x) + 40;
		const minY = -50; // room for the root's label
		const maxY = Math.max(...ys) + 150; // room for the deepest labels
		const k = Math.min((box.w - pad) / (maxX - minX), (box.h - pad) / (maxY - minY), 1.5);
		view = { k, x: (box.w - (maxX - minX) * k) / 2 - minX * k, y: (box.h - (maxY - minY) * k) / 2 - minY * k };
	}

	// Fit whenever the map opens (or its text or size changes)
	let layoutKey = $derived(graph.nodes.map((n) => `${n.id}:${n.x}:${n.y}`).join('|'));
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

	/** A click on a bubble that was not the end of a drag goes to that section (or, when choosing front or back matter, selects it). */
	/** @param {MapNode} node */
	function pick(node) {
		if (drag?.moved || !node.id) return;
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

	/** @param {MouseEvent} e */
	function onBackdrop(e) {
		if (e.target === dialogEl) dialogEl?.close();
	}
</script>

{#snippet stageView()}
	<div
		bind:this={stage}
		bind:clientWidth={box.w}
		bind:clientHeight={box.h}
		use:wheelZoom
		role="presentation"
		onpointerdown={down}
		onpointermove={move}
		onpointerup={up}
		onpointercancel={up}
		class="relative {picking ? 'mt-2' : 'mt-3'} min-h-0 flex-1 cursor-grab touch-none select-none overflow-hidden rounded-md border border-taupe2 bg-taupe1 active:cursor-grabbing"
	>
		{#if graph.empty}
			<p class="absolute inset-0 flex items-center justify-center text-sm text-grey3">No sections to map yet.</p>
		{:else}
			<svg class="absolute inset-0 h-full w-full" role="img" aria-label="Map of the text's sections">
				<g transform="translate({view.x} {view.y}) scale({view.k})">
					<!-- links, under the bubbles -->
					{#each graph.links as l (l.to.id)}
						<path d={curve(l.from, l.to)} fill="none" stroke="currentColor" class="text-grey3" stroke-opacity="0.55" stroke-width="1" vector-effect="non-scaling-stroke" />
					{/each}

					<!-- the root: the text as a whole -->
					<rect x={graph.root.x - graph.root.r} y={graph.root.y - graph.root.r} width={graph.root.r * 2} height={graph.root.r * 2} rx={graph.root.r * 0.7} class="fill-dark" style="filter: {shadow(graph.root.x)}" />
					{#if fits('100', graph.root.r)}
						<text x={graph.root.x} y={graph.root.y} text-anchor="middle" dominant-baseline="central" font-size={PCT_PX / view.k} class="pointer-events-none fill-white">100</text>
					{/if}
					<text x={graph.root.x} y={graph.root.y - graph.root.r - 8 / view.k} text-anchor="middle" font-size={LABEL_PX_TOP / view.k} style="filter: {labelShadow(graph.root.x)}" class="pointer-events-none fill-taupe5 font-semibold">{clip(graph.root.title)}</text>

					{#each graph.nodes as n (n.id)}
						{@const rows = n.depth <= 1 ? labelLines(n) : []}
						<!-- svelte-ignore a11y_click_events_have_key_events, a11y_no_noninteractive_element_interactions -->
						<g
							role="presentation"
							onpointerenter={() => (hover = n)}
							onpointerleave={() => (hover = null)}
							onclick={() => pick(n)}
							class="cursor-pointer"
						>
							<rect x={n.x - n.r} y={n.y - n.r} width={n.r * 2} height={n.r * 2} rx={n.r * 0.7} style="fill: {colors.get(n.id ?? '')}; filter: {shadow(n.x)}" class={hover === n || (picking && (n.frontmatter || n.backmatter)) ? 'stroke-violet' : 'stroke-taupe1'} stroke-width={picking && (n.frontmatter || n.backmatter) ? 4 : hover === n ? 2.5 : 1.5} />
							{#if !n.backmatter && fits(percent(n.size, graph.total), n.r)}
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
							{:else if n.depth > 1 && view.k >= 1}
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
							{#if picking && (n.backmatter || n.frontmatter) && n.depth <= 1}
								<text x={n.x} y={n.y + n.r + (6 + Math.max(1, labelLines(n).length) * LABEL_PX_TOP * LABEL_LEADING + 4) / view.k} text-anchor="middle" dominant-baseline="hanging" font-size={LABEL_PX / view.k} font-style="italic" style="filter: {labelShadow(n.x)}" class="pointer-events-none fill-taupe5">{n.backmatter ? 'back matter' : 'front matter'}</text>
							{/if}
						</g>
					{/each}
				</g>
			</svg>

			{#if hover}
				<div
					role="tooltip"
					class="pointer-events-none absolute z-10 w-max max-w-64 rounded-2xl border border-taupe3 bg-taupe1 px-3 py-1.5 text-xs text-taupe5 shadow-lg"
					style="left: {Math.min(tip.x + 14, Math.max(box.w - 270, 0))}px; top: {tip.y + 14}px"
				>
					<MinimapTooltip lines={hover.trail} />
				</div>
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
	}}
	class="m-auto h-[85vh] w-[min(94vw,80rem)] overflow-hidden rounded-lg border border-taupe2 bg-taupe1 p-4 text-dark backdrop:bg-black/40 open:flex open:flex-col"
>
	<div class="flex shrink-0 items-center justify-between">
		<h2 class="text-base font-semibold">Map of {rootTitle}</h2>
		<div class="flex items-center gap-1">
			<button onclick={() => dialogEl?.close()} aria-label="Close" class="rounded-md px-2 py-1 text-lg leading-none hover:bg-taupe2">×</button>
		</div>
	</div>


	{@render stageView()}
</dialog>
{/if}
