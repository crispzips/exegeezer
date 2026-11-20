<script>
	import { tick } from 'svelte';
	import { Minus, Plus } from '@boxicons/svelte';
	import { buildSections } from '#lib/utilities/buildSections.js';
	import { sectionColor } from '#lib/utilities/sectionColor.js';

	/**
	 * Cascading view: every bubble is the same size and sits in one grid, inside one container.
	 * The top level is a horizontal row. Opening a section lays its children out orthogonally to
	 * the section itself: a section in a horizontal row opens a vertical column beneath it; a
	 * section in a vertical column opens a horizontal row to its right. So the text cascades
	 * down and to the right. One section per level is open at a time.
	 *
	 * @type {{
	 *   paragraphs: { id: string, originalIndex: number, text: string, level?: number }[],
	 *   empty?: string,
	 *   exploded?: boolean
	 * }}
	 *
	 * Exploded: every section is open at once (children may land on the same cell), the view is
	 * zoomed all the way out, and the bubbles drop their contents and show only their section's
	 * colour.
	 */
	let { paragraphs, empty = 'No text yet.', exploded = false } = $props();

	// The grid is laid out in unscaled units and drawn with CSS `zoom`, so bubbles, gaps, borders
	// and text all scale together. A cell is PITCH wide; its bubble is SIZE, centred in it.
	const SIZE = 224;
	const PITCH = SIZE + 28;
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

	/** @typedef {import('#lib/utilities/buildSections.js').SectionChild} SectionChild */

	let tree = $derived(buildSections(paragraphs));
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
	 * @typedef {{ node: SectionChild, row: number, col: number, color: string | null, open: boolean, depth: number, parent: { row: number, col: number, id: string } | null }} Placed
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
				out.push({ node, row: r, col: c, color: node.kind === 'section' ? (colors.get(node.id) ?? null) : color, open, depth, parent });
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
		const smallest = Math.min(roomW / colCount, roomH / rowCount);
		/** @type {number[]} */
		const out = [];
		for (let n = 1; ; n++) {
			const c = Math.min(roomW / n, roomH);
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
		selected = selected[depth] === id ? selected.slice(0, depth) : [...selected.slice(0, depth), id];
		await tick();
		reveal(el);
	}

	/**
	 * Open a section and every section around it (`ids`, outermost first), and bring it into view.
	 * @param {string[]} ids
	 */
	export async function openPath(ids) {
		selected = ids;
		await tick();
		reveal(host?.querySelector(`[data-node="${CSS.escape(ids[ids.length - 1] ?? '')}"]`));
	}

	/** Split a section title at its first colon: the title keeps the colon, the rest is the subtitle. @param {string} text */
	function splitTitle(text) {
		const i = text.indexOf(':');
		return i === -1 ? { title: text, subtitle: '' } : { title: text.slice(0, i + 1), subtitle: text.slice(i + 1).trim() };
	}
</script>

<div class="relative flex h-full w-full items-center justify-center overflow-hidden bg-taupe1" bind:this={host} bind:clientWidth={paneW} bind:clientHeight={paneH} use:wheelZoom>
	{#if !tree.length}
		<p class="text-sm text-gray-500">{empty}</p>
	{:else}
		<div
			bind:this={stage}
			class="overflow-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
			style="width:{stageW}px;height:{stageH}px;scroll-snap-type:both mandatory"
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
								<path d={g.path} fill="none" stroke="white" stroke-width={TUBE + 2 * RIM} stroke-linecap="round" />
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
					<button
						data-node={node.id}
						data-section
						aria-expanded={p.open}
						{style}
						onclick={(e) => toggle(p.depth, node.id, e.currentTarget)}
						class="absolute flex flex-col items-center gap-1 overflow-hidden rounded-[5rem] border-8 border-(--c) px-6 py-4 text-center text-dark transition-[left,top] focus:outline-8 focus:-outline-offset-8 focus:outline-taupe0 {p.open
							? 'bg-[color-mix(in_srgb,var(--c)_28%,var(--color-taupe1))] font-semibold'
							: 'bg-[color-mix(in_srgb,var(--c)_10%,var(--color-taupe1))] hover:bg-[color-mix(in_srgb,var(--c)_20%,var(--color-taupe1))]'}"
					>
						<span class="mb-3 text-xs font-normal text-grey2">§{node.hierarchicalIndex}</span>
						<span class="flex min-h-0 min-w-0 flex-1 flex-col items-center justify-center break-words text-xl leading-snug">
							{t.title}
							{#if t.subtitle}<span class="mt-1 block text-sm font-normal text-grey2">{t.subtitle}</span>{/if}
						</span>
						<svg class="h-5 w-5 shrink-0 transition-transform {p.open ? 'rotate-90' : ''}" viewBox="0 0 20 20" fill="currentColor">
							<path d="M7.2 4.8a.75.75 0 011.06 0l4.5 4.5a.75.75 0 010 1.06l-4.5 4.5a.75.75 0 01-1.06-1.06L11.17 9.8 7.2 5.86a.75.75 0 010-1.06z" />
						</svg>
					</button>
				{:else}
					<div
						data-node={p.node.paragraph.id}
						tabindex="0"
						role="group"
						aria-label="Paragraph"
						{style}
						class="absolute flex flex-col gap-0.5 overflow-y-auto rounded-[5rem] border-8 border-(--c) bg-[color-mix(in_srgb,var(--c)_10%,var(--color-taupe1))] px-6 py-4 text-center text-sm focus:outline-8 focus:-outline-offset-8 focus:outline-taupe0"
					>
						<span class="mb-3 text-xs text-gray-500">{p.node.paragraphIndex}</span>
						<p class="whitespace-pre-wrap">{p.node.paragraph.text}</p>
					</div>
				{/if}
			{/each}
		</div>
		</div>

		<!-- zoom controls (Ctrl/⌘ + wheel also zooms) -->
		<div class="absolute right-3 bottom-3 flex {exploded ? 'hidden' : ''} gap-1 rounded-xl border border-taupe3 bg-taupe0 p-1">
			<button aria-label="Zoom out" disabled={levelIndex >= levels.length - 1} onclick={() => zoomBy(-1)} class="rounded-lg p-1 text-dark hover:bg-taupe2 disabled:opacity-30"><Minus /></button>
			<button aria-label="Zoom in" disabled={levelIndex <= 0} onclick={() => zoomBy(1)} class="rounded-lg p-1 text-dark hover:bg-taupe2 disabled:opacity-30"><Plus /></button>
		</div>
	{/if}
</div>
