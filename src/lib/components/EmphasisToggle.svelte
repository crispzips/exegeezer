<script>
	import { tip } from '#lib/utilities/menuTip.svelte.js';
	import { emphasis, toggleEmphasis } from '#lib/emphasis.svelte.js';

	/** how heavy the "Aa" is drawn: light when emphasis is off, heavy when on (an outline thickens the letters; the font has only two weights) */
	const label = $derived(emphasis.first ? 'First sentence emphasized (click to turn off)' : 'No emphasis (click to emphasize the first sentence)');
</script>

<!-- An on/off toggle for emphasising a paragraph's first sentence. Its icon is a capital A and a lowercase a, drawn heavier when it is on. -->
<button
	onclick={toggleEmphasis}
	aria-label={label}
	aria-pressed={emphasis.first}
	use:tip={label}
	class="inline-flex items-center justify-center rounded-md p-1 text-dark hover:bg-taupe3"
>
	<span aria-hidden="true" class="flex h-6 w-6 items-center justify-center text-[15px] leading-none select-none" style="-webkit-text-stroke: {emphasis.first ? 1.4 : 0}px currentColor">Aa</span>
</button>
