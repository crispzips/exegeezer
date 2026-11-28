<script>
	import { untrack } from 'svelte';

	/**
	 * Two panes divided by a draggable handle.
	 *
	 * - `direction`: 'horizontal' puts the panes side by side (the handle is a
	 *   vertical bar); 'vertical' stacks them (the handle is a horizontal bar).
	 * - `sized`: which pane has the fixed, draggable size: 'second' (the default)
	 *   or 'first'. The other pane takes the remaining space.
	 * - `collapsed` hides the sized pane. Grabbing the handle (or pressing the arrow
	 *   key that grows the pane) expands it again.
	 * - `alone` (with `sized` 'first'): the first pane takes the whole of it, with no handle and no
	 *   second pane. The first pane's contents stay as they are when a second pane comes or goes.
	 *
	 * @type {{
	 *   first: import('svelte').Snippet,
	 *   second: import('svelte').Snippet,
	 *   direction?: 'horizontal' | 'vertical',
	 *   sized?: 'first' | 'second',
	 *   initial?: number,
	 *   min?: number,
	 *   max?: number,
	 *   collapsed?: boolean,
	 *   alone?: boolean
	 * }}
	 */
	let {
		first,
		second,
		direction = 'horizontal',
		sized = 'second',
		initial = 320,
		min = 160,
		max = 800,
		collapsed = $bindable(false),
		alone = false
	} = $props();

	const horizontal = $derived(direction === 'horizontal');
	let size = $state(initial);
	// a new `initial` (the pane's content now needs a different height) resizes the pane, as does a second pane coming
	// back; otherwise a dragged size stays
	let given = untrack(() => (alone ? undefined : initial));
	$effect.pre(() => {
		const next = alone ? undefined : initial;
		if (next === given) return;
		given = next;
		if (next !== undefined) untrack(() => (size = next));
	});
	let dragging = $state(false);
	/** @type {HTMLDivElement | undefined} */
	let container;

	/** @param {PointerEvent & { currentTarget: HTMLElement }} e */
	function onPointerDown(e) {
		collapsed = false;
		dragging = true;
		e.currentTarget.setPointerCapture(e.pointerId);
	}

	/** @param {PointerEvent} e */
	function onPointerMove(e) {
		if (!dragging || !container) return;
		const r = container.getBoundingClientRect();
		// distance from the pointer to the sized pane's outer edge
		let next;
		if (sized === 'second') next = horizontal ? r.right - e.clientX : r.bottom - e.clientY;
		else next = horizontal ? e.clientX - r.left : e.clientY - r.top;
		size = Math.min(max, Math.max(min, next));
	}

	function onPointerUp() {
		dragging = false;
	}

	/** @param {KeyboardEvent} e */
	function onKeydown(e) {
		// arrow keys move the handle; +1 grows the sized pane, -1 shrinks it
		const toward = horizontal ? { ArrowLeft: -1, ArrowRight: 1 } : { ArrowUp: -1, ArrowDown: 1 };
		const step = /** @type {Record<string, number>} */ (toward)[e.key];
		if (!step) return;
		e.preventDefault();
		const grow = sized === 'second' ? -step : step;
		if (collapsed) {
			if (grow > 0) collapsed = false;
			return;
		}
		size = Math.min(max, Math.max(min, size + grow * 16));
	}

	const sizedStyle = $derived(`${horizontal ? 'width' : 'height'}: ${collapsed ? 0 : size}px`);
</script>

{#snippet sizedPane(/** @type {import('svelte').Snippet} */ content)}
	<div
		class="{alone ? 'min-h-0 min-w-0 flex-1' : 'shrink-0'} {collapsed ? 'overflow-hidden' : 'overflow-auto'} {dragging || alone ? '' : horizontal ? 'transition-[width] duration-200' : 'transition-[height] duration-200'}"
		style={alone ? '' : sizedStyle}
		inert={collapsed}
	>
		{@render content()}
	</div>
{/snippet}

{#snippet flexPane(/** @type {import('svelte').Snippet} */ content)}
	<div class="min-h-0 min-w-0 flex-1 overflow-auto">
		{@render content()}
	</div>
{/snippet}

<div
	bind:this={container}
	class="flex h-full w-full overflow-hidden {horizontal ? '' : 'flex-col'} {dragging ? (horizontal ? 'cursor-col-resize' : 'cursor-row-resize') + ' select-none' : ''}"
>
	{#if sized === 'first'}
		{@render sizedPane(first)}
	{:else}
		{@render flexPane(first)}
	{/if}

	{#if !alone}
		<!-- Drag handle -->
		<div
			role="separator"
			aria-orientation={horizontal ? 'vertical' : 'horizontal'}
			aria-valuenow={collapsed ? 0 : size}
			aria-valuemin={min}
			aria-valuemax={max}
			tabindex="0"
			onpointerdown={onPointerDown}
			onpointermove={onPointerMove}
			onpointerup={onPointerUp}
			onpointercancel={onPointerUp}
			onkeydown={onKeydown}
			class="shrink-0 touch-none transition-colors hover:bg-accent {horizontal ? 'w-1 cursor-col-resize' : 'h-1 cursor-row-resize'} {dragging ? 'bg-accent' : 'bg-taupe2'}"
		></div>

		{#if sized === 'first'}
			{@render flexPane(second)}
		{:else}
			{@render sizedPane(second)}
		{/if}
	{/if}
</div>
