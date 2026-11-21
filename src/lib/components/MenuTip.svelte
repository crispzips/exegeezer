<script>
	import MinimapTooltip from '#lib/components/MinimapTooltip.svelte';
	import { menuTip } from '#lib/utilities/menuTip.svelte.js';

	let innerWidth = $state(0);
</script>

<svelte:window bind:innerWidth />

<!-- Same bubble as the minimap tooltips (see ParagraphViewer), placed left of the hovered button, or below it for `data-tip-place="below"` (the header menu) -->
{#if menuTip.text}
	<div
		role="tooltip"
		class="pointer-events-none fixed z-50 w-max max-w-64 rounded-2xl border border-taupe3 bg-taupe1 px-3 py-1.5 text-xs text-taupe5 shadow-lg {menuTip.place === 'below' ? '-translate-x-1/2' : '-translate-y-1/2'}"
		style={menuTip.place === 'below'
			? `left: clamp(8px, ${menuTip.cx}px, ${innerWidth - 8}px); top: ${menuTip.bottom + 8}px`
			: `right: ${innerWidth - menuTip.x + 8}px; top: clamp(14px, ${menuTip.y}px, calc(100vh - 14px))`}
	>
		<MinimapTooltip lines={[menuTip.text]} />
	</div>
{/if}
