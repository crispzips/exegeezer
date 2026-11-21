<script>
	import { tick } from 'svelte';
	import { tip } from '#lib/utilities/menuTip.svelte.js';
	import { ArrowInDownRightSquare, FileCog, TrashX } from '@boxicons/svelte';

	/**
	 * The editor menu that floats above the paragraph or section under the pointer.
	 * It is positioned from the target's on-screen box (fixed), so scrolling panes
	 * cannot clip it. Its first button is Delete: for a paragraph it asks to delete
	 * it; for a section it opens a drop-down offering "this section only" or "this
	 * section and all its descendants". Choosing either calls `ondelete`, and the
	 * caller then asks for confirmation. The button before it, Expand, opens the item in
	 * the editor modal (`onexpand`, given the item's current on-screen box so the modal
	 * can grow out of it).
	 *
	 * @type {{
	 *   hover: import('#lib/utilities/editHover.svelte.js').EditHover,
	 *   inside?: boolean,
	 *   ondelete: (req: { id: string, kind: 'paragraph' | 'section', scope?: 'only' | 'tree' }) => void,
	 *   onexpand?: (req: { id: string, kind: 'paragraph' | 'section', from: DOMRect }) => void
	 * }}
	 */
	let { hover, ondelete, onexpand = undefined, inside = false } = $props();

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

	// Follow the target; close the drop-down when the target changes. The item may grow to make room
	// for the menu (`inside`), so it is measured once the page has settled.
	$effect(() => {
		if (!target) return;
		menuOpen = false;
		const t = target;
		tick().then(() => {
			if (hover.target !== t) return;
			const r = t.el.getBoundingClientRect();
			const h = menuEl?.offsetHeight ?? 32;
			const w = menuEl?.offsetWidth ?? 40;
			// `inside`: stacked down the item's right-hand side, within its outline, so the pointer reaches it without leaving the item;
			// otherwise above the item, aligned to its left edge (if there is no room above, overlapping its top edge)
			pos = inside
				? { top: Math.max(r.top + 4, 4), left: Math.max(4, Math.min(r.right - w - 4, window.innerWidth - w - 4)) }
				: { top: Math.max(4, r.top - h), left: Math.max(4, Math.min(r.left, window.innerWidth - w - 4)) };
		});
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
		class="fixed z-40 flex {inside ? 'flex-col' : ''} items-center gap-1 rounded-md border border-taupe2 bg-taupe1 p-1 shadow-lg"
		style="top: {pos.top}px; left: {pos.left}px"
	>
		{#if onexpand}
			<button
				type="button"
				aria-label={inside ? (target.kind === 'section' ? 'Section settings' : 'Paragraph settings') : target.kind === 'section' ? 'Expand section' : 'Expand paragraph'}
				use:tip={inside ? 'Settings' : 'Expand'}
				onclick={expand}
				class="inline-flex items-center justify-center rounded-md p-1 text-dark hover:bg-taupe2"
			>
				{#if inside}<FileCog />{:else}<ArrowInDownRightSquare />{/if}
			</button>
		{/if}
		<div class="relative">
			<button
				type="button"
				aria-label={target.kind === 'section' ? 'Delete section' : 'Delete paragraph'}
				use:tip={'Delete'}
				aria-haspopup={target.kind === 'section' ? 'menu' : undefined}
				aria-expanded={target.kind === 'section' ? menuOpen : undefined}
				onclick={() => (target.kind === 'section' ? (menuOpen = !menuOpen) : choose(undefined))}
				class="inline-flex items-center justify-center rounded-md p-1 text-red hover:bg-taupe2 {menuOpen ? 'bg-taupe2' : ''}"
			>
				<TrashX />
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
