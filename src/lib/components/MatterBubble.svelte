<script>
	/**
	 * A front or back matter section as a small bubble in the hierarchical view's top row.
	 * Clicking it opens the section's text in a panel beneath the bubble (which floats over
	 * the rows below, so the layout does not move); clicking it again, or anywhere else, closes it.
	 *
	 * @type {{ section: { id: string, title: string, paragraphs: { id: string, text: string, level?: number }[] } }}
	 */
	let { section } = $props();

	/** @type {HTMLButtonElement | undefined} */
	let button = $state();
	let open = $state(false);
	let at = $state({ left: 0, top: 0 });

	function toggle() {
		if (!button) return;
		const r = button.getBoundingClientRect();
		at = { left: Math.max(8, Math.min(r.left, window.innerWidth - 440)), top: r.bottom + 6 };
		open = !open;
	}
</script>

<svelte:window onclick={(e) => open && !(e.target instanceof Node && (button?.contains(e.target) || (e.target instanceof Element && e.target.closest('[data-matter-panel]')))) && (open = false)} onscrollcapture={() => (open = false)} />

<button
	bind:this={button}
	type="button"
	data-matter
	aria-expanded={open}
	title={section.title}
	onclick={toggle}
	class="m-2 flex w-28 shrink-0 items-start gap-1 self-start rounded-md border-2 border-taupe3 px-2 py-1.5 text-left text-xs text-taupe5 hover:bg-taupe2 {open ? 'bg-taupe2' : 'bg-taupe1'}"
>
	<svg class="mt-0.5 h-3 w-3 shrink-0 transition-transform {open ? 'rotate-90' : ''}" viewBox="0 0 20 20" fill="currentColor"><path d="M7 4l7 6-7 6z" /></svg>
	<span class="min-w-0 flex-1 break-words">{section.title}</span>
</button>

{#if open}
	<div
		data-matter-panel
		class="fixed z-30 max-h-[50vh] w-104 max-w-[calc(100vw-16px)] overflow-y-auto rounded-md border border-taupe3 bg-taupe1 px-4 py-3 text-sm text-dark shadow-lg"
		style="left: {at.left}px; top: {at.top}px"
	>
		{#each section.paragraphs as p (p.id)}
			{#if (p.level ?? 0) > 0}
				<p class="mt-2 font-semibold">{p.text.replace(/^#+\s*/, '')}</p>
			{:else}
				<p class="my-2 whitespace-pre-wrap">{p.text}</p>
			{/if}
		{:else}
			<p class="italic text-grey3">empty</p>
		{/each}
	</div>
{/if}
