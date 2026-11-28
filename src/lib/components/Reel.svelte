<script>
	import { ChevronLeft, ChevronRight } from '@boxicons/svelte';
	import { tip } from '#lib/utilities/menuTip.svelte.js';

	/**
	 * A horizontally scrolling reel of list items. Besides the usual scrolling, it can be dragged with the mouse and
	 * stepped with arrow buttons; whatever an edge clips fades out. An arrow and its edge's fade appear only while
	 * there is more to scroll to on that side.
	 *
	 * @type {{ label: string, children: import('svelte').Snippet }}
	 *   `label` names the reel for its arrow buttons; `children` are its `<li>` items
	 */
	let { label, children } = $props();

	/** the widest an edge's fade gets, in pixels */
	const FADE = 80;
	/** how far the mouse moves, in pixels, before a press becomes a drag rather than a click */
	const SLOP = 5;

	/** @type {HTMLUListElement | undefined} */
	let reel = $state();
	/** pixels hidden past the left and right edges */
	let before = $state(0);
	let after = $state(0);
	let dragging = $state(false);
	const scrollable = $derived(before > 1 || after > 1);

	/** @param {HTMLUListElement} node */
	function scrolling(node) {
		const measure = () => {
			before = Math.max(0, node.scrollLeft);
			after = Math.max(0, node.scrollWidth - node.clientWidth - node.scrollLeft);
		};

		/** where a mouse press began, while the button stays down @type {{ x: number, left: number } | null} */
		let press = null;
		/** the press that just ended was a drag, so the click it ends in is not meant */
		let dragged = false;
		const down = (/** @type {PointerEvent} */ e) => {
			// touch and pens scroll by themselves
			if (e.pointerType !== 'mouse' || e.button !== 0 || node.scrollWidth <= node.clientWidth) return;
			press = { x: e.clientX, left: node.scrollLeft };
		};
		const up = () => {
			if (dragging) {
				dragged = true;
				setTimeout(() => (dragged = false)); // the click, if any, comes first
			}
			press = null;
			dragging = false;
		};
		const move = (/** @type {PointerEvent} */ e) => {
			if (!press) return;
			if (!(e.buttons & 1)) return up(); // released outside the reel, before it became a drag
			const dx = e.clientX - press.x;
			if (!dragging) {
				if (Math.abs(dx) < SLOP) return;
				dragging = true;
				node.setPointerCapture(e.pointerId);
			}
			node.scrollLeft = press.left - dx;
		};
		const click = (/** @type {MouseEvent} */ e) => {
			if (!dragged) return;
			e.preventDefault();
			e.stopPropagation();
		};
		// a picture dragged by itself would take over from the reel
		const noNativeDrag = (/** @type {Event} */ e) => e.preventDefault();

		node.addEventListener('scroll', measure, { passive: true });
		node.addEventListener('pointerdown', down);
		node.addEventListener('pointermove', move);
		node.addEventListener('pointerup', up);
		node.addEventListener('pointercancel', up);
		node.addEventListener('click', click, true);
		node.addEventListener('dragstart', noNativeDrag);
		// the reel changes width, or its items change
		const resized = new ResizeObserver(measure);
		resized.observe(node);
		const changed = new MutationObserver(measure);
		changed.observe(node, { childList: true, subtree: true });
		measure();

		return {
			destroy() {
				node.removeEventListener('scroll', measure);
				node.removeEventListener('pointerdown', down);
				node.removeEventListener('pointermove', move);
				node.removeEventListener('pointerup', up);
				node.removeEventListener('pointercancel', up);
				node.removeEventListener('click', click, true);
				node.removeEventListener('dragstart', noNativeDrag);
				resized.disconnect();
				changed.disconnect();
			}
		};
	}

	/** Scroll one arrowful: as many whole items as fit, and at least one. @param {1 | -1} direction */
	function step(direction) {
		if (!reel) return;
		const [first, second] = /** @type {HTMLElement[]} */ ([...reel.children]);
		const pitch = second ? second.offsetLeft - first.offsetLeft : reel.clientWidth;
		const distance = Math.max(1, Math.floor(reel.clientWidth / pitch)) * pitch;
		const calm = matchMedia('(prefers-reduced-motion: reduce)').matches;
		reel.scrollBy({ left: direction * distance, behavior: calm ? 'auto' : 'smooth' });
	}
</script>

{#snippet arrow(/** @type {1 | -1} */ direction)}
	{@const way = direction < 0 ? 'left' : 'right'}
	<button
		type="button"
		onclick={() => step(direction)}
		aria-label="Scroll {label} {way}"
		use:tip={`Scroll ${way}`}
		data-tip-place="below"
		class="absolute top-[calc(50%-0.25rem)] z-10 -translate-y-1/2 rounded-full border border-taupe3 bg-taupe1 p-1 shadow-md hover:bg-taupe2 {direction < 0 ? '-left-3' : '-right-3'}"
	>
		{#if direction < 0}<ChevronLeft />{:else}<ChevronRight />{/if}
	</button>
{/snippet}

<div class="relative">
	<ul
		bind:this={reel}
		use:scrolling
		style:mask-image="linear-gradient(to right, transparent, black {Math.min(FADE, before)}px, black calc(100% - {Math.min(FADE, after)}px), transparent)"
		class="flex gap-3 overflow-x-auto pb-2 {scrollable ? 'select-none' : ''} {dragging ? 'cursor-grabbing' : scrollable ? 'cursor-grab' : ''}"
	>
		{@render children()}
	</ul>
	{#if before > 1}{@render arrow(-1)}{/if}
	{#if after > 1}{@render arrow(1)}{/if}
</div>
