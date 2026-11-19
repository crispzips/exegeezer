<script>
	/**
	 * One source for loading a text: an icon-only button (a taupe1 square with a taupe3
	 * border and the standard drop shadow) whose name shows in the standard tooltip,
	 * centred directly below it. The tooltip is drawn here, not by the page-level one,
	 * which a modal dialog would cover. `name` is the button's name, never a visible label.
	 * Pass the icon as the content; `below` (optional) is shown in the tooltip's place,
	 * e.g. a search bar, while `showBelow` is true.
	 *
	 * @type {{
	 *   name: string,
	 *   onclick?: () => void,
	 *   children: import('svelte').Snippet,
	 *   below?: import('svelte').Snippet,
	 *   showBelow?: boolean,
	 *   belowAlign?: 'center' | 'right'
	 * }}
	 */
	let { name, onclick, children, below, showBelow = false, belowAlign = 'center' } = $props();
</script>

<span class="group relative inline-flex">
	<button
		type="button"
		{onclick}
		aria-label={name}
		aria-expanded={below ? showBelow : undefined}
		class="inline-flex items-center justify-center rounded-md border border-taupe3 bg-taupe1 p-4 text-dark [box-shadow:0_3px_3px_var(--color-taupe4)] hover:bg-taupe2"
	>
		{@render children()}
	</button>
	{#if showBelow && below}
		<div
			class="absolute top-full z-50 mt-3 w-max rounded-2xl border border-taupe3 bg-taupe1 px-3 py-1.5 text-xs text-taupe5 shadow-lg {belowAlign === 'right' ? 'right-0' : 'left-1/2 -translate-x-1/2'}"
		>
			{@render below()}
		</div>
	{:else}
		<span
			role="tooltip"
			class="pointer-events-none absolute top-full left-1/2 z-50 mt-3 hidden w-max -translate-x-1/2 rounded-2xl border border-taupe3 bg-taupe1 px-3 py-1.5 text-xs text-taupe5 shadow-lg group-hover:block group-has-[:focus-visible]:block"
		>
			{name}
		</span>
	{/if}
</span>
