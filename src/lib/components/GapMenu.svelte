<script>
	import { tick } from 'svelte';
	import { tip } from '#lib/utilities/menuTip.svelte.js';
	import { gapBox } from '#lib/utilities/dragDrop.svelte.js';
	import { BetweenHorizontalEnd, BetweenVerticalEnd } from '@boxicons/svelte';

	/**
	 * The menu beside the pointer when it hovers an interstitial landing zone. For now it
	 * holds one dropdown button, whose icon matches the stack the zone is in (items
	 * stacked vertically, or side by side): "inject empty" adds an empty paragraph at the
	 * zone; "inject from load" opens the Load Text modal to inject a loaded text there.
	 *
	 * @type {{
	 *   gap: import('#lib/utilities/gapHover.svelte.js').GapHover,
	 *   oninject: (req: { targetId: string, place: 'before' | 'after', mode: 'empty' | 'load' }) => void
	 * }}
	 */
	let { gap, oninject } = $props();

	const target = $derived(gap.target);
	let innerWidth = $state(0);
	/** nudging mode: the opened-up gap on screen, measured once the layout has made room for it
	 * @type {{ left: number, top: number, width: number, height: number } | null} */
	let box = $state(null);
	let measure = 0;
	$effect(() => {
		const t = target;
		const id = ++measure;
		box = null;
		if (!gap.nudge || !t) return;
		tick().then(() => requestAnimationFrame(() => {
			if (id === measure) box = gapBox(t);
		}));
	});

	// a new zone starts with the dropdown closed
	$effect(() => {
		void target?.id;
		void target?.place;
		gap.open = false;
	});

	/** @param {'empty' | 'load'} mode */
	function choose(mode) {
		if (!target) return;
		const { id, place } = target;
		gap.clear();
		oninject({ targetId: id, place, mode });
	}
</script>

<svelte:window bind:innerWidth onscrollcapture={() => gap.clear()} />

{#snippet control(/** @type {NonNullable<typeof target>} */ target)}
	<button
		type="button"
		aria-label="Inject"
		use:tip={'Inject'}
		aria-haspopup="menu"
		aria-expanded={gap.open}
		onclick={() => (gap.open = !gap.open)}
		class="inline-flex items-center justify-center rounded-md p-1 text-dark hover:bg-taupe2 {gap.open ? 'bg-taupe2' : ''}"
	>
		{#if target.axis === 'y'}<BetweenHorizontalEnd />{:else}<BetweenVerticalEnd />{/if}
	</button>

	{#if gap.open}
		<div role="menu" class="absolute left-0 top-full z-50 mt-1 w-max rounded-md border border-taupe2 bg-taupe1 py-1 shadow-lg">
			<button role="menuitem" onclick={() => choose('empty')} class="block w-full px-4 py-2 text-left text-sm text-dark hover:bg-taupe2">
				inject empty
			</button>
			<button role="menuitem" onclick={() => choose('load')} class="block w-full px-4 py-2 text-left text-sm text-dark hover:bg-taupe2">
				inject from load
			</button>
		</div>
	{/if}
{/snippet}

{#if target && gap.nudge}
	{#if box}
		<!-- the whole opened-up gap holds the menu open; a taupe3 bar fills it, as in the cascading view -->
		<div
			role="toolbar"
			aria-label="Interstice editor"
			tabindex="-1"
			onpointerenter={() => gap.hold()}
			onpointerleave={() => gap.leave()}
			class="fixed z-40"
			style="left: {box.left}px; top: {box.top}px; width: {box.width}px; height: {box.height}px"
		>
			<div class="pointer-events-none absolute rounded-full bg-taupe3 {target.axis === 'y' ? 'inset-x-0 top-1/2 h-1.5 -translate-y-1/2' : 'inset-y-0 left-1/2 w-1.5 -translate-x-1/2'}"></div>
			<div class="absolute top-1/2 left-1/2 flex -translate-x-1/2 -translate-y-1/2 flex-col rounded-md border border-taupe2 bg-taupe1 p-1 shadow-lg">
				{@render control(target)}
			</div>
		</div>
	{/if}
{:else if target}
	<div
		role="toolbar"
		aria-label="Interstice editor"
		tabindex="-1"
		onpointerenter={() => gap.hold()}
		onpointerleave={() => gap.leave()}
		class="fixed z-40 flex flex-col rounded-md border border-taupe2 bg-taupe1 p-1 shadow-lg"
		style={gap.centred
			? `left: ${Math.max(20, Math.min(gap.x, innerWidth - 20))}px; top: ${Math.max(20, gap.y)}px; transform: translate(-50%, -50%)`
			: `left: ${Math.max(4, Math.min(gap.x + 14, innerWidth - 176))}px; top: ${Math.max(4, gap.y - 16)}px`}
	>
		{@render control(target)}
	</div>
{/if}
