<script>
	import { definitionsOf, isDefinition, renderMarkdown } from '#lib/utilities/renderMarkdown.js';

	/**
	 * Front or back matter, kept apart from the text (the views and minimaps leave it out, but
	 * it stays reachable). Each section is collapsed to its title; clicking one opens its text
	 * beneath. `tiny` draws small bubbles in a row (the hierarchical view); otherwise each
	 * section is a full-width collapsed heading (the linear view).
	 *
	 * @type {{
	 *   sections: { id: string, title: string, paragraphs: { id: string, text: string, level?: number }[] }[],
	 *   label: string,
	 *   tiny?: boolean,
	 *   markdown?: boolean,
	 *   edge: 'top' | 'bottom'
	 * }}
	 */
	let { sections, label, tiny = false, markdown = false, edge } = $props();

	/** @type {string | null} */
	let openId = $state(null);
	const open = $derived(sections.find((s) => s.id === openId) ?? null);
	const defs = $derived(definitionsOf(open?.paragraphs ?? []));
</script>

{#snippet content(/** @type {NonNullable<typeof open>} */ s)}
	<div class="max-h-[40vh] overflow-y-auto rounded-md border border-taupe2 bg-taupe1 px-4 py-3 text-sm text-dark">
		{#each s.paragraphs as p (p.id)}
			{#if (p.level ?? 0) > 0}
				<p class="mt-2 font-semibold">{p.text.replace(/^#+\s*/, '')}</p>
			{:else if markdown && !isDefinition(p.text)}
				<div class="md my-2">{@html renderMarkdown(p.text, defs, `matter-${p.id}`)}</div>
			{:else}
				<p class="my-2 whitespace-pre-wrap">{p.text}</p>
			{/if}
		{:else}
			<p class="italic text-grey3">empty</p>
		{/each}
	</div>
{/snippet}

{#if sections.length > 0}
	<div role="region" aria-label={label} class="flex shrink-0 flex-col gap-1 {tiny ? 'px-3 py-1' : 'px-[12%] py-2'} {edge === 'top' ? '' : 'flex-col-reverse'}">
		<div class="flex flex-wrap items-center gap-1 {tiny ? '' : 'flex-col items-stretch'}">
			{#each sections as s (s.id)}
				<button
					type="button"
					aria-expanded={openId === s.id}
					onclick={() => (openId = openId === s.id ? null : s.id)}
					title={s.title}
					class="flex items-center gap-1 border border-taupe3 text-left text-taupe5 hover:bg-taupe2 {openId === s.id ? 'bg-taupe2' : 'bg-taupe1'} {tiny ? 'max-w-40 rounded-full px-2 py-0.5 text-[10px]' : 'rounded-md px-3 py-1.5 text-sm'}"
				>
					<svg class="h-3 w-3 shrink-0 transition-transform {openId === s.id ? 'rotate-90' : ''}" viewBox="0 0 20 20" fill="currentColor"><path d="M7 4l7 6-7 6z" /></svg>
					<span class="truncate">{s.title}</span>
				</button>
			{/each}
		</div>
		{#if open}{@render content(open)}{/if}
	</div>
{/if}
