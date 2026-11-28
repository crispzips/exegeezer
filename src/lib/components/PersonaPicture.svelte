<script>
	import { User } from '@boxicons/svelte';
	import { tintStyle } from '#lib/personaColors.js';

	/**
	 * A persona's (or user's) picture in a bubble tile; without one, a silhouette, tinted the persona's colour (a
	 * user's is that of their "self") when `colors` is given.
	 *
	 * @type {{ image: string | null, colors?: Record<string, string> | null, size: string }}
	 */
	let { image, colors = null, size } = $props();
	const tinted = $derived(!image && colors);
</script>

<!-- app.css `.persona-tint` sets the tile's fill and edge over the taupe ones -->
<span
	class="flex shrink-0 items-center justify-center overflow-hidden rounded-bubble border-2 border-taupe3 bg-taupe2 {size}"
	class:persona-tint={tinted}
	style={tinted ? tintStyle(colors) : undefined}
>
	{#if image}<img src={image} alt="" class="size-full object-cover" />{:else}<User />{/if}
</span>
