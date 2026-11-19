<script>
	import MinimapTooltip from '#lib/components/MinimapTooltip.svelte';
	import { menuTip } from '#lib/utilities/menuTip.svelte.js';

	let innerWidth = $state(0);
</script>

<svelte:window bind:innerWidth />

<!-- Same bubble as the minimap tooltips (see ParagraphViewer), placed left of the hovered button -->
{#if menuTip.text}
	<div
		role="tooltip"
		class="pointer-events-none fixed z-50 w-max max-w-64 -translate-y-1/2 rounded bg-dark px-2 py-1 text-xs text-taupe1 shadow-lg"
		style="right: {innerWidth - menuTip.x + 8}px; top: clamp(14px, {menuTip.y}px, calc(100vh - 14px))"
	>
		<MinimapTooltip lines={[menuTip.text]} />
	</div>
{/if}
