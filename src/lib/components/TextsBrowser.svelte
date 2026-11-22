<script>
	import { Scroll, MessageCircleReply } from '@boxicons/svelte';

	/**
	 * A user's texts as a list (title, author, status, visibility, created) or as icons.
	 * Shared by the profile's Texts tab and the import modal's "From Your Texts".
	 * `view` is 'list' or 'icons'. `onselect(text)` runs when a row is clicked, and
	 * `oniconselect(text)` (default: `onselect`) when an icon is. `actions` (optional) draws
	 * extra buttons at the end of each list row, shown on hover or keyboard focus.
	 *
	 * @type {{
	 *   texts: { id: string, title: string, type: string, author?: string | null, productionStatus: string, visibility: string, createdAt: string }[],
	 *   view?: 'list' | 'icons',
	 *   onselect?: (t: any) => void,
	 *   oniconselect?: (t: any) => void,
	 *   actions?: import('svelte').Snippet<[any]>
	 * }}
	 */
	let { texts, view = 'list', onselect, oniconselect, actions } = $props();

	const day = (/** @type {string} */ iso) => new Date(iso).toLocaleDateString(undefined, { dateStyle: 'medium' });
	/** @type {Record<string, string>} */
	const typeLabel = { original: 'Original text', commentary: 'Commentary' };
	const cols = actions
		? 'grid-cols-[1.25rem_minmax(0,1fr)_6.5rem_5.5rem_4rem_5rem_3.5rem]'
		: 'grid-cols-[1.25rem_minmax(0,1fr)_6.5rem_5.5rem_4rem_5rem]';
</script>

{#if view === 'list'}
	<div class="grid {cols} items-center gap-x-2 border-b border-taupe3 px-1 pb-1 text-xs text-grey3">
		<span></span><span>Title</span><span>Author</span><span>Status</span><span>Visibility</span><span class="text-right">Created</span>{#if actions}<span></span>{/if}
	</div>
	<ul class="divide-y divide-taupe3 text-sm">
		{#each texts as t (t.id)}
			{@const Icon = t.type === 'commentary' ? MessageCircleReply : Scroll}
			<!-- svelte-ignore a11y_click_events_have_key_events, a11y_no_noninteractive_element_interactions -->
			<li onclick={() => onselect?.(t)} class="group grid {cols} cursor-pointer items-center gap-x-2 rounded-md px-1 hover:bg-taupe2">
				<span title={typeLabel[t.type] ?? t.type}><Icon size="sm" /></span>
				<!-- the title selects the text (the whole row does too, for the mouse) -->
				<button type="button" onclick={(e) => { e.stopPropagation(); onselect?.(t); }} class="min-w-0 truncate py-2 text-left font-medium text-dark">{t.title}</button>
				<span class="truncate text-xs text-dark" title={t.author ?? ''}>{t.author ?? '—'}</span>
				<span class="truncate text-xs text-grey3">{t.productionStatus}</span>
				<span class="truncate text-xs text-grey3">{t.visibility}</span>
				<span class="text-right text-xs text-grey3">{day(t.createdAt)}</span>
				{#if actions}
					<span class="flex justify-end gap-0.5 opacity-0 group-focus-within:opacity-100 group-hover:opacity-100">{@render actions(t)}</span>
				{/if}
			</li>
		{/each}
	</ul>
{:else}
	<ul class="flex flex-wrap gap-5">
		{#each texts as t (t.id)}
			{@const Icon = t.type === 'commentary' ? MessageCircleReply : Scroll}
			<li class="w-16">
				<button type="button" onclick={() => (oniconselect ?? onselect)?.(t)} class="group relative flex w-full flex-col items-center gap-1.5">
					<span class="flex size-16 items-center justify-center rounded-bubble border-4 border-taupe3 bg-taupe2 shadow-sm group-hover:bg-taupe3">
						<Icon size="lg" />
					</span>
					<span class="w-full truncate rounded-2xl border border-taupe3 bg-taupe1 px-2 py-1 text-center text-xs text-taupe5 shadow-lg">{t.title}</span>
					<span role="tooltip" class="pointer-events-none absolute bottom-full left-1/2 z-10 mb-2 -translate-x-1/2 rounded-md border border-taupe3 bg-taupe1 px-2 py-1 text-xs whitespace-nowrap text-taupe5 opacity-0 shadow-md group-hover:opacity-100 group-focus-visible:opacity-100">{t.title} ({typeLabel[t.type] ?? t.type})</span>
				</button>
			</li>
		{/each}
	</ul>
{/if}
