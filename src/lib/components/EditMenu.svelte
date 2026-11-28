<script>
	import { tick } from 'svelte';
	import { tip } from '#lib/utilities/menuTip.svelte.js';
	import { ArrowInDownRightSquare, TrashX } from '@boxicons/svelte';

	/**
	 * The editor menu of the paragraph or section under the pointer: small circles, one under another, inside the item's
	 * top right corner. It is positioned from the target's on-screen box (fixed), so scrolling panes cannot clip it. The
	 * first button, Expand, opens the item in the editor modal (`onexpand`, given the item's current on-screen box so the
	 * modal can grow out of it). The last is Delete: for a paragraph it asks to delete it; for a section it opens a
	 * drop-down offering "this section only" or "this section and all its descendants". Choosing either calls
	 * `ondelete`, and the caller then asks for confirmation.
	 *
	 * @type {{
	 *   hover: import('#lib/utilities/editHover.svelte.js').EditHover,
	 *   ondelete: (req: { id: string, kind: 'paragraph' | 'section', scope?: 'only' | 'tree' }) => void,
	 *   onexpand?: (req: { id: string, kind: 'paragraph' | 'section', from: DOMRect }) => void
	 * }}
	 */
	let { hover, ondelete, onexpand = undefined } = $props();

	/** how far in from the item's edges the menu sits */
	const INSET = 4;
	// a circle sits on the item's own background, so under the pointer it takes the theme's accent, faded
	const button = 'inline-flex h-5 w-5 items-center justify-center rounded-full border border-taupe3 bg-taupe1 shadow-sm transition-colors hover:border-accent [[data-theme=dark]_&]:hover:text-dark hover:bg-[color-mix(in_srgb,var(--color-accent)_var(--accent-fade,30%),var(--color-taupe1))]';
	/** the delete button while its drop-down is open: shaded as under the pointer */
	const held = 'border-accent! [[data-theme=dark]_&]:text-dark! bg-[color-mix(in_srgb,var(--color-accent)_var(--accent-fade,30%),var(--color-taupe1))]!';

	function expand() {
		if (!target) return;
		const { id, kind, el } = target;
		const from = el.getBoundingClientRect();
		hover.clear();
		onexpand?.({ id, kind, from });
	}

	const target = $derived(hover.target);
	let menuOpen = $state(false);
	/** @type {HTMLDivElement | undefined} */
	let menuEl = $state();
	let pos = $state({ top: 0, left: 0 });

	/** Put the menu in the corner of what shows of its item, which may run out of the box it scrolls in. @param {HTMLElement} el */
	function place(el) {
		const r = el.getBoundingClientRect();
		const clip = el.parentElement?.closest('.overflow-auto, .overflow-y-auto')?.getBoundingClientRect();
		const top = Math.max(r.top, clip?.top ?? 0);
		const right = Math.min(r.right, clip?.right ?? window.innerWidth);
		pos = { top: top + INSET, left: right - (menuEl?.offsetWidth ?? 20) - INSET };
	}

	// Follow the target, keeping to its corner as it changes size (a section opening, a paragraph being typed into);
	// close the drop-down when the target changes. The item is measured once the page has settled.
	$effect(() => {
		if (!target) return;
		menuOpen = false;
		const t = target;
		tick().then(() => {
			if (hover.target === t) place(t.el);
		});
		const sizes = new ResizeObserver(() => place(t.el));
		sizes.observe(t.el);
		return () => sizes.disconnect();
	});

	/** @param {'only' | 'tree' | undefined} scope */
	function choose(scope) {
		if (!target) return;
		const { id, kind } = target;
		menuOpen = false;
		hover.clear();
		ondelete({ id, kind, scope });
	}
</script>

<!-- Any scroll moves the items out from under a fixed menu, so drop it -->
<svelte:window onscrollcapture={() => hover.clear()} />

{#if target}
	<div
		bind:this={menuEl}
		role="toolbar"
		aria-label={target.kind === 'section' ? 'Section editor' : 'Paragraph editor'}
		tabindex="-1"
		onpointerenter={() => hover.hold()}
		onpointerleave={() => hover.leave()}
		class="fixed z-40 flex flex-col items-center gap-0.5"
		style="top: {pos.top}px; left: {pos.left}px"
	>
		{#if onexpand}
			<button
				type="button"
				aria-label={target.kind === 'section' ? 'Expand section' : 'Expand paragraph'}
				use:tip={'Expand'}
				onclick={expand}
				class="{button} text-dark"
			>
				<ArrowInDownRightSquare width={13} height={13} />
			</button>
		{/if}
		<div class="relative flex">
			<button
				type="button"
				aria-label={target.kind === 'section' ? 'Delete section' : 'Delete paragraph'}
				use:tip={'Delete'}
				aria-haspopup={target.kind === 'section' ? 'menu' : undefined}
				aria-expanded={target.kind === 'section' ? menuOpen : undefined}
				onclick={() => (target.kind === 'section' ? (menuOpen = !menuOpen) : choose(undefined))}
				class="{button} text-red {menuOpen ? held : ''}"
			>
				<TrashX width={13} height={13} />
			</button>

			{#if menuOpen && target.kind === 'section'}
				<div
					role="menu"
					class="absolute right-0 top-full z-50 mt-1 w-max raised rounded-md py-1 shadow-lg"
				>
					<button role="menuitem" onclick={() => choose('only')} class="block w-full px-4 py-2 text-left text-sm text-dark hover:bg-taupe2">
						Delete just this section
					</button>
					<button role="menuitem" onclick={() => choose('tree')} class="block w-full px-4 py-2 text-left text-sm text-dark hover:bg-taupe2">
						Delete this section and all its descendants
					</button>
				</div>
			{/if}
		</div>
	</div>
{/if}
