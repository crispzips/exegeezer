<script>
	import { tick } from 'svelte';
	import { buildSections } from '#lib/utilities/buildSections.js';
	import SplitPane from '#lib/components/SplitPane.svelte';
	import HierarchyMinimap from '#lib/components/HierarchyMinimap.svelte';
	import { sectionColor } from '#lib/utilities/sectionColor.js';
	import EditMenu from '#lib/components/EditMenu.svelte';
	import { EditHover } from '#lib/utilities/editHover.svelte.js';
	import { caretOffsetAt, editable } from '#lib/utilities/editable.js';
	import GapMenu from '#lib/components/GapMenu.svelte';
	import { GapHover } from '#lib/utilities/gapHover.svelte.js';
	import DropTip from '#lib/components/DropTip.svelte';
	import { DragDrop, locateGap } from '#lib/utilities/dragDrop.svelte.js';
	import { dropAllowed } from '#lib/utilities/editText.js';

	/**
	 * Hierarchical view: every header becomes a container (a large button labelled
	 * with the section title). Containers sit side by side in a row. Clicking one
	 * opens it: the container fills with its section's colour (the same colour the
	 * minimaps use) and its content appears in a panel beneath the row, outlined in
	 * that colour. Sub-sections appear as another row of containers inside the panel.
	 *
	 * @type {{
	 *   paragraphs: { id: string, originalIndex: number, text: string, level?: number }[],
	 *   empty?: string,
	 *   ondelete?: (req: { id: string, kind: 'paragraph' | 'section', scope?: 'only' | 'tree' }) => void,
	 *   onexpand?: (req: { id: string, kind: 'paragraph' | 'section', from: DOMRect }) => void
	 * }}
	 *
	 * With `ondelete`, every bubble is editable: hovering a paragraph or section bubble
	 * outlines it and floats an editor menu above it.
	 *
	 * With `onmove`, bubbles can be dragged: onto the edge of a bubble or the space between
	 * bubbles (a violet line) to move them there, or onto the first or second half of a
	 * bubble of the same kind to prepend or append (merge) it. A section drags with its contents.
	 */
	let { paragraphs, empty = 'No text yet.', ondelete = undefined, onexpand = undefined, onmove = undefined, oninject = undefined, onedit = undefined } = $props();

	/** id of the paragraph being edited in place (double-click), or null */
	/** @type {string | null} */
	let editing = $state(null);
	/** where the caret goes when editing starts: the character nearest the double-click */
	let editCaret = $state(0);

	// Leaving editing mode (the edit props go away) drops any open editor, menu or highlight
	$effect(() => {
		if (!onedit) editing = null;
		if (!ondelete) editHover.clear();
		if (!oninject) gap.clear();
		if (!onmove) dd.end();
	});

	/** @param {string} id @param {string | null} text */
	function finishEdit(id, text) {
		if (editing === id) editing = null;
		if (text !== null) onedit?.({ id, text });
	}

	const editHover = new EditHover();
	const dd = new DragDrop();
	const gap = new GapHover();

	/**
	 * Hovering the space between bubbles (or a bubble's thin edge) lights it magenta and
	 * offers the inject menu; anywhere else on a bubble shows its own edit menu.
	 * @param {PointerEvent} e
	 */
	function hoverMove(e) {
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

<!-- A paragraph bubble. In the front-matter column it keeps its natural height (the column
     scrolls); elsewhere it is a fixed-width box that scrolls on its own. -->
{#snippet paragraphBubble(/** @type {import('#lib/utilities/buildSections.js').ParagraphNode} */ node, /** @type {boolean} */ stacked)}
	<!-- svelte-ignore a11y_no_static_element_interactions -->
	<div
		data-node={node.paragraph.id}
		{...(editing === node.paragraph.id ? {} : dragAttrs(node.paragraph.id, 'paragraph', stacked ? 'y' : 'x'))}
		ondblclick={onedit
			? (e) => {
					editCaret = caretOffsetAt(e.currentTarget, e.clientX, e.clientY, node.paragraph.text);
					editHover.clear();
					gap.clear();
					editing = node.paragraph.id;
				}
			: undefined}
		onpointerenter={ondelete && !editing ? (e) => editHover.enter({ id: node.paragraph.id, kind: 'paragraph', el: e.currentTarget }) : undefined}
		onpointerleave={ondelete ? () => editHover.leave() : undefined}
		class="flex w-80 shrink-0 gap-2 rounded-md border border-taupe2 bg-taupe1 p-2 text-sm {stacked ? '' : 'overflow-y-auto'} {dd.dragId === node.paragraph.id ? 'opacity-40' : ''} {dd.classes(node.paragraph.id, stacked ? 'y' : 'x') || gap.classes(node.paragraph.id) || (ondelete && !dd.dragId && editHover.is(node.paragraph.id) ? 'outline-2 outline-grey2' : '')}"
	>
		<span class="text-xs text-gray-500">{node.paragraphIndex}</span>
		{#if editing === node.paragraph.id}
			<p
				use:editable={{ text: node.paragraph.text, caret: editCaret, onfinish: (t) => finishEdit(node.paragraph.id, t) }}
				class="flex-1 whitespace-pre-wrap outline-none"
			></p>
		{:else}
			<p class="flex-1 whitespace-pre-wrap">{#if node.paragraph.text}{node.paragraph.text}{:else}<span class="italic text-grey3">empty paragraph</span>{/if}</p>
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
		<div class="sticky left-0 z-10 flex w-8 shrink-0 items-start justify-center pt-3 text-xs font-semibold text-grey1 select-none" title="Level {lvl}">
			{'#'.repeat(lvl)}
		</div>

		<div class="flex h-full items-stretch gap-2 py-2 pr-2">
			{#if front.length}
				<div data-front class="flex h-full min-h-0 w-84 shrink-0 flex-col gap-2 overflow-y-auto p-1">
					{#each front as node (node.kind === 'paragraph' ? node.paragraph.id : '')}
						{#if node.kind === 'paragraph'}{@render paragraphBubble(node, true)}{/if}
					{/each}
				</div>
			{/if}
			{#each r.nodes.slice(front.length) as node (node.kind === 'section' ? node.id : node.paragraph.id)}
				{#if node.kind === 'section'}
					{@const isOpen = selected[d] === node.id}
					{@const t = splitTitle(node.title)}
					<button
						data-section
						data-node={node.id}
						{...dragAttrs(node.id, 'section', 'x')}
						data-level={node.level}
						data-open={isOpen}
						onclick={(e) => toggle(d, node.id, e.currentTarget)}
						onpointerenter={ondelete ? (e) => editHover.enter({ id: node.id, kind: 'section', el: e.currentTarget }) : undefined}
						onpointerleave={ondelete ? () => editHover.leave() : undefined}
						aria-expanded={isOpen}
						style="--c: {colors.get(node.id)}"
						class="m-2 flex max-h-[calc(100%-1rem)] shrink-0 items-start self-start gap-3 overflow-hidden rounded-md border-2 border-(--c) px-4 py-3 text-left {isOpen ? 'font-semibold' : 'text-sm font-normal'} {dd.dragId === node.id ? 'opacity-40' : ''} {dd.classes(node.id, 'x') || gap.classes(node.id) || (ondelete && !dd.dragId && editHover.is(node.id) ? 'outline-2 outline-offset-2 outline-grey2' : '')} {isOpen ? 'w-max bg-(--c) text-white' : 'w-56 bg-taupe2 text-dark hover:bg-grey1/30'}"
					>
						<!-- section label stacked above the caret, so the title starts at the very top -->
						<span class="flex shrink-0 flex-col items-center gap-0.5">
							<span class="text-xs font-normal {isOpen ? 'text-white/70' : 'text-grey2'}">§{node.hierarchicalIndex}</span>
							<svg class="h-5 w-5 transition-transform {isOpen ? 'rotate-90' : ''}" viewBox="0 0 20 20" fill="currentColor">
								<path d="M7.2 4.8a.75.75 0 011.06 0l4.5 4.5a.75.75 0 010 1.06l-4.5 4.5a.75.75 0 01-1.06-1.06L11.17 9.8 7.2 5.86a.75.75 0 010-1.06z" />
							</svg>
						</span>
						<!-- wraps inside the container and clips at the bottom; an open container
						     grows wide enough to show the whole title and subtitle -->
						<span class="min-w-0 flex-1 {isOpen ? 'whitespace-nowrap' : 'break-words'}">
							{t.title}
							{#if t.subtitle}
								<span class="mt-0.5 block text-xs font-normal {isOpen ? 'text-white/70' : 'text-grey2'}">{t.subtitle}</span>
							{/if}
						</span>
					</button>
				{:else}
					{@render paragraphBubble(node, false)}
				{/if}
			{:else}
				{#if !front.length}<p class="self-center text-sm text-gray-500">{r.parent ? 'This section is empty.' : empty}</p>{/if}
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

{#if ondelete}<EditMenu hover={editHover} {ondelete} {onexpand} />{/if}
<DropTip {dd} />
{#if oninject}<GapMenu {gap} {oninject} />{/if}

<!-- svelte-ignore a11y_no_static_element_interactions -->
<div
	bind:this={host}
	onpointermove={hoverMove}
	onpointerleave={() => gap.leave()}
	ondragover={dragOver}
	ondrop={drop}
	ondragleave={(e) => {
		if (!e.currentTarget.contains(/** @type {Node | null} */ (e.relatedTarget))) dd.drop = null;
	}}
	class="flex h-full min-h-0 flex-col"
>
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
