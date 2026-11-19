<script>
	/**
	 * A small tooltip that follows the pointer, left of the drag icon (bottom-aligned with it) while something is dragged over a landing
	 * zone ("Interject", "Prepend" or "Append").
	 * @type {{ dd: import('#lib/utilities/dragDrop.svelte.js').DragDrop }}
	 */
	let { dd } = $props();
	let innerWidth = $state(0);
	let innerHeight = $state(0);
	let width = $state(0);
	// left of the icon (which spans 50px left of the pointer to 6px right of it); on the right when there is no room
	const flip = $derived(dd.x - 50 - 8 - width < 4);
</script>

<svelte:window bind:innerWidth bind:innerHeight />

{#if dd.drop && dd.label}
	<div
		bind:clientWidth={width}
		role="tooltip"
		class="pointer-events-none fixed z-50 rounded-2xl border border-taupe3 bg-taupe1 px-3 py-1.5 text-xs text-taupe5 shadow-lg"
		style="{flip ? `left: ${dd.x + 14}px` : `right: ${innerWidth - dd.x + 58}px`}; bottom: {innerHeight - dd.y - 6}px"
	>
		{dd.label}
	</div>
{/if}
