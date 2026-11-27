<script>
	import { Scroll, MessageCircleReply, BookLibrary } from '@boxicons/svelte';
	import { tip } from '#lib/utilities/menuTip.svelte.js';

	/**
	 * A user's texts as a list (title, author, status, visibility, created) or as icons.
	 * Shared by the profile's Texts and Commentaries tabs and the import modal's "From Your Texts".
	 * Texts that say whether they are `commented` get a column marking those with a commentary.
	 * With `glosses`, the texts are commentaries: each row names what it glosses (its `referent`, with the icon for its
	 * kind) and counts its `comments`, in place of the author. A commentary with a commentary of its own is marked too.
	 * `view` is 'list' or 'icons'. `onselect(text)` runs when a row is clicked, and
	 * `oniconselect(text)` (default: `onselect`) when an icon is. `actions` (optional) draws
	 * extra buttons at the end of each list row, shown on hover or keyboard focus.
	 *
	 * @type {{
	 *   texts: { id: string, title: string, type: string, author?: string | null, productionStatus: string, visibility: string, createdAt: string, commented?: boolean, referent?: { kind: 'text' | 'commentary' | 'anthology', title: string | null }, comments?: number }[],
	 *   view?: 'list' | 'icons',
	 *   glosses?: boolean,
	 *   onselect?: (t: any) => void,
	 *   oniconselect?: (t: any) => void,
	 *   actions?: import('svelte').Snippet<[any]>
	 * }}
	 */
	let { texts, view = 'list', glosses = false, onselect, oniconselect, actions } = $props();

	const day = (/** @type {string} */ iso) => new Date(iso).toLocaleDateString(undefined, { dateStyle: 'medium' });
	/** @type {Record<string, string>} */
	const typeLabel = { original: 'Original text', commentary: 'Commentary' };
	// what a commentary can gloss (there are no anthologies yet)
	const referentKinds = {
		text: { Icon: Scroll, label: 'text' },
		commentary: { Icon: MessageCircleReply, label: 'commentary' },
		anthology: { Icon: BookLibrary, label: 'anthology' }
	};
	const named = (/** @type {string | null} */ title) => title ?? 'A private text';
	const count = (/** @type {number} */ n) => `${n} ${n === 1 ? 'comment' : 'comments'}`;

	let marks = $derived(glosses || texts.some((t) => t.commented !== undefined));
	let cols = $derived(
		glosses
			? actions
				? 'grid-cols-[1.25rem_minmax(0,1fr)_2.25rem_4.5rem_5rem_4rem_5rem_3.5rem]'
				: 'grid-cols-[1.25rem_minmax(0,1fr)_2.25rem_4.5rem_5rem_4rem_5rem]'
			: marks
				? actions
					? 'grid-cols-[1.25rem_minmax(0,1fr)_2.25rem_5.5rem_5rem_4rem_5rem_3.5rem]'
					: 'grid-cols-[1.25rem_minmax(0,1fr)_2.25rem_5.5rem_5rem_4rem_5rem]'
				: actions
					? 'grid-cols-[1.25rem_minmax(0,1fr)_6.5rem_5.5rem_4rem_5rem_3.5rem]'
					: 'grid-cols-[1.25rem_minmax(0,1fr)_6.5rem_5.5rem_4rem_5rem]'
	);
</script>

{#if view === 'list'}
	<div class="grid {cols} items-center gap-x-2 border-b border-taupe3 px-1 pb-1 text-xs text-grey3">
		<span></span><span>{glosses ? 'Title and what it glosses' : 'Title'}</span>{#if marks}<span><span class="sr-only">Commentary</span></span>{/if}<span class={glosses ? 'text-center' : ''}>{glosses ? 'Comments' : 'Author'}</span><span>Status</span><span>Visibility</span><span class="text-right">Created</span>{#if actions}<span></span>{/if}
	</div>
	<ul class="divide-y divide-taupe3 text-sm">
		{#each texts as t (t.id)}
			{@const Icon = t.type === 'commentary' ? MessageCircleReply : Scroll}
			<!-- svelte-ignore a11y_click_events_have_key_events, a11y_no_noninteractive_element_interactions -->
			<li onclick={() => onselect?.(t)} class="group grid {cols} cursor-pointer items-center gap-x-2 rounded-md px-1 hover:bg-taupe2">
				<span title={typeLabel[t.type] ?? t.type}><Icon size="sm" /></span>
				<!-- the title selects the text (the whole row does too, for the mouse) -->
				<button type="button" onclick={(e) => { e.stopPropagation(); onselect?.(t); }} class="min-w-0 py-2 text-left">
					<span class="block truncate font-medium text-dark">{t.title}</span>
					{#if glosses && t.referent}
						{@const kind = referentKinds[t.referent.kind]}
						<span class="flex min-w-0 items-center gap-1 text-xs text-grey3" use:tip={`On the ${kind.label}: ${named(t.referent.title)}`}>
							<kind.Icon width={14} height={14} class="shrink-0" aria-label="On the {kind.label}" />
							<span class="truncate">{named(t.referent.title)}</span>
						</span>
					{/if}
				</button>
				{#if marks}
					{#if t.commented}
						<span class="inline-flex items-center justify-center text-base text-taupe5" role="img" aria-label="Has a commentary" use:tip={'Has a commentary'}>[<MessageCircleReply size="sm" />]</span>
					{:else}
						<span></span>
					{/if}
				{/if}
				{#if glosses}
					<span class="text-center text-xs text-dark">{t.comments ?? 0}</span>
				{:else}
					<span class="truncate text-xs text-dark" title={t.author ?? ''}>{t.author ?? '—'}</span>
				{/if}
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
			{@const about = glosses && t.referent ? `${t.title}, on the ${referentKinds[t.referent.kind].label} “${named(t.referent.title)}”: ${count(t.comments ?? 0)}` : ''}
			<li class="w-16">
				<!-- a commentary's tooltip is long, so it takes the shared bubble, which wraps -->
				<button type="button" onclick={() => (oniconselect ?? onselect)?.(t)} use:tip={about} data-tip-place="below" aria-label={about || undefined} class="group relative flex w-full flex-col items-center gap-1.5">
					<span class="flex size-16 items-center justify-center rounded-bubble border-4 border-taupe3 bg-taupe2 shadow-sm group-hover:bg-taupe3">
						<Icon size="lg" />
					</span>
					<span class="w-full truncate rounded-2xl border border-taupe3 bg-taupe1 px-2 py-1 text-center text-xs text-taupe5 shadow-lg">{t.title}</span>
					{#if !about}
						<span role="tooltip" class="pointer-events-none absolute bottom-full left-1/2 z-10 mb-2 -translate-x-1/2 rounded-md border border-taupe3 bg-taupe1 px-2 py-1 text-xs whitespace-nowrap text-taupe5 opacity-0 shadow-md group-hover:opacity-100 group-focus-visible:opacity-100">{t.title} ({typeLabel[t.type] ?? t.type})</span>
					{/if}
				</button>
			</li>
		{/each}
	</ul>
{/if}
