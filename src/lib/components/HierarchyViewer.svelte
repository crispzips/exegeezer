<script>
	import { tick } from 'svelte';
	import { buildSections } from '#lib/utilities/buildSections.js';
	import SplitPane from '#lib/components/SplitPane.svelte';
	import HierarchyMinimap from '#lib/components/HierarchyMinimap.svelte';
	import { sectionColor } from '#lib/utilities/sectionColor.js';

	/**
	 * Hierarchical view: every header becomes a container (a large button labelled
	 * with the section title). Containers sit side by side in a row. Clicking one
	 * opens it: the container fills with its section's colour (the same colour the
	 * minimaps use) and its content appears in a panel beneath the row, outlined in
	 * that colour. Sub-sections appear as another row of containers inside the panel.
	 *
	 * @type {{
	 *   paragraphs: { id: string, originalIndex: number, text: string, level?: number }[],
	 *   empty?: string
	 * }}
	 */
	let { paragraphs, empty = 'No text yet.' } = $props();

	/** @typedef {import('#lib/utilities/buildSections.js').SectionChild} SectionChild */

	/** @type {HTMLDivElement | undefined} */
	let host = $state();

	let tree = $derived(buildSections(paragraphs));

	/** section id -> colour (top-level sections cycle the accents, deeper ones darken) */
	let colors = $derived.by(() => {
		/** @type {Map<string, string>} */
		const map = new Map();
		let top = 0;
		/** @param {SectionChild[]} list @param {number} topIdx @param {number} depth */
		function walk(list, topIdx, depth) {
			for (const node of list) {
				if (node.kind !== 'section') continue;
				const idx = depth === 0 ? top++ : topIdx;
				map.set(node.id, sectionColor(idx, depth));
				walk(node.children, idx, depth + 1);
			}
		}
		walk(tree, 0, 0);
		return map;
	});

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

	/**
	 * Scroll a container to the middle of its row (the row's own scroller).
	 * @param {Element} el
	 */
	function centreInRow(el) {
		const scroller = el.closest('.overflow-auto');
		if (!scroller) return;
		const box = el.getBoundingClientRect();
		const view = scroller.getBoundingClientRect();
		scroller.scrollBy({ left: box.left + box.width / 2 - (view.left + view.width / 2), behavior: 'smooth' });
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
	 * Open a section and every section around it (`ids`, outermost first), as if each
	 * had been clicked in turn, and bring the opened containers into view. Used by the
	 * minimap.
	 * @param {string[]} ids
	 */
	async function openPath(ids) {
		selected = ids;
		await tick();
		ids.forEach((id, d) => {
			const el = host?.querySelector(`[data-row="${d}"] [data-node="${id}"]`);
			if (el) centreInRow(el);
		});
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

{#snippet row(/** @type {number} */ d)}
	{@const r = rows[d]}
	{@const tint = r.parent ? colors.get(r.parent.id) : null}
	{@const lvl = rowLevel(r)}
	<div
		data-row={d}
		style={tint ? `--c: ${tint}` : ''}
		class="flex h-full min-w-full w-max items-stretch gap-2 {tint ? 'border-t-2 border-(--c) bg-[color-mix(in_srgb,var(--c)_8%,transparent)]' : ''}"
	>
		<!-- level marker: small grey pound signs, pinned to the left while scrolling -->
		<div class="sticky left-0 z-10 flex w-8 shrink-0 items-start justify-center bg-taupe1 pt-3 text-xs font-semibold text-grey1 select-none" title="Level {lvl}">
			{'#'.repeat(lvl)}
		</div>

		<div class="flex h-full items-stretch gap-2 py-2 pr-2">
			{#each r.nodes as node (node.kind === 'section' ? node.id : node.paragraph.id)}
				{#if node.kind === 'section'}
					{@const isOpen = selected[d] === node.id}
					{@const t = splitTitle(node.title)}
					<button
						data-section
						data-node={node.id}
						data-level={node.level}
						data-open={isOpen}
						onclick={(e) => toggle(d, node.id, e.currentTarget)}
						aria-expanded={isOpen}
						style="--c: {colors.get(node.id)}"
						class="m-2 flex max-h-[calc(100%-1rem)] shrink-0 items-start self-start gap-3 overflow-hidden rounded-md border-2 border-(--c) px-4 py-3 text-left font-semibold {isOpen ? 'w-max bg-(--c) text-white' : 'w-56 bg-taupe2 text-dark hover:bg-grey1/30'}"
					>
						<svg class="mt-1 h-5 w-5 shrink-0 transition-transform {isOpen ? 'rotate-90' : ''}" viewBox="0 0 20 20" fill="currentColor">
							<path d="M7.2 4.8a.75.75 0 011.06 0l4.5 4.5a.75.75 0 010 1.06l-4.5 4.5a.75.75 0 01-1.06-1.06L11.17 9.8 7.2 5.86a.75.75 0 010-1.06z" />
						</svg>
						<!-- wraps inside the container and clips at the bottom; an open container
						     grows wide enough to show the whole title and subtitle -->
						<span class="min-w-0 flex-1 {isOpen ? 'whitespace-nowrap' : 'break-words'}">
							{t.title}
							{#if t.subtitle}
								<span class="mt-0.5 block text-xs font-normal {isOpen ? 'text-white/70' : 'text-grey2'}">{t.subtitle}</span>
							{/if}
						</span>
						<span class="shrink-0 text-xs font-normal opacity-70">{node.children.length}</span>
					</button>
				{:else}
					<div data-node={node.paragraph.id} class="flex w-80 shrink-0 gap-2 overflow-y-auto rounded-md border border-taupe2 bg-taupe1 p-2">
						<span class="text-xs text-gray-500">{node.paragraph.originalIndex}</span>
						<p class="flex-1 whitespace-pre-wrap">{node.paragraph.text}</p>
					</div>
				{/if}
			{:else}
				<p class="self-center text-sm text-gray-500">{r.parent ? 'This section is empty.' : empty}</p>
			{/each}
		</div>
	</div>
{/snippet}

<!-- Rows are stacked split panes: each deeper row appears (with its divider) only
     while a section in the row above is open. -->
{#snippet stack(/** @type {number} */ d)}
	{#if d >= rows.length - 1}
		<!-- the last row has no split pane around it, so it needs its own scroller -->
		<div class="h-full overflow-auto">
			{@render row(d)}
		</div>
	{:else}
		<SplitPane direction="vertical" sized="first" initial={150} min={80} max={600}>
			{#snippet first()}{@render row(d)}{/snippet}
			{#snippet second()}{@render stack(d + 1)}{/snippet}
		</SplitPane>
	{/if}
{/snippet}

<div bind:this={host} class="flex h-full min-h-0 flex-col">
	<div class="min-h-0 flex-1">
		{@render stack(0)}
	</div>

	<!-- Global Hierarchical Minimap: the whole text along the bottom of the pane -->
	<HierarchyMinimap
		{paragraphs}
		{tree}
		{colors}
		{selected}
		onopen={openPath}
		layoutKey={selected.join('/')}
		getHost={() => host ?? null}
	/>
</div>
