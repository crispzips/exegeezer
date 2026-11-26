<script>
	import { useCommentEditor, DRAFT_ID } from '#lib/utilities/commentEditor.svelte.js';

	/**
	 * One comment. Pointing at it (or focusing it) reports it to `onlit`, so the view can mark what it is about.
	 *
	 * A click (or Enter) on one of the user's own comments grows the bubble into its editor, where it stands; a comment being
	 * written for the first time is a bubble in that state from the start. Cmd/Ctrl+Enter posts or saves, Escape cancels.
	 *
	 * @type {{
	 *   comment: import('#lib/utilities/comments.js').AnchoredComment,
	 *   onlit?: (comment: import('#lib/utilities/comments.js').AnchoredComment | null) => void,
	 *   class?: string
	 * }}
	 */
	let { comment, onlit = undefined, class: extra = '' } = $props();

	const editor = useCommentEditor();
	const editing = $derived(!!editor?.is(comment.id));
	const editable = $derived(!!editor && !!comment.editable && !editing);
	const isNew = $derived(comment.id === DRAFT_ID);
	const names = $derived(comment.authors.join(', ') || 'Anonymous');

	/** @type {HTMLElement | undefined} */
	let bubble = $state();
	/** @type {HTMLTextAreaElement | undefined} */
	let field = $state();

	// a bubble that goes away while pointed at takes its mark with it
	$effect(() => () => onlit?.(null));

	// each call for the editor brings it into view, with the caret at the end of the words
	$effect(() => {
		if (!editing || !field) return;
		void editor?.called;
		const target = field;
		const show = () => bubble?.scrollIntoView({ block: 'nearest', inline: 'nearest' });
		// after the view has placed the bubble, and after whatever the click that opened it focused
		const turn = setTimeout(() => {
			show();
			target.focus({ preventScroll: true });
			target.setSelectionRange(target.value.length, target.value.length);
		}, 80);
		// and once more when a view that rearranges to make room (the cascade) has settled
		const settled = setTimeout(show, 400);
		return () => {
			clearTimeout(turn);
			clearTimeout(settled);
		};
	});

	/** @param {KeyboardEvent} e */
	function onFieldKey(e) {
		if (e.key === 'Escape') editor?.cancel();
		else if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) editor?.post();
		else return;
		e.preventDefault();
		e.stopPropagation(); // the Escape is the editor's: nothing around it is cleared too
	}
</script>

<!-- svelte-ignore a11y_no_noninteractive_tabindex, a11y_no_noninteractive_element_interactions, a11y_click_events_have_key_events -->
<article
	bind:this={bubble}
	data-comment={comment.id}
	data-editing={editing || undefined}
	tabindex={editing ? -1 : 0}
	aria-label={isNew ? 'New comment' : `Comment by ${names}`}
	onpointerenter={() => onlit?.(comment)}
	onpointerleave={() => onlit?.(null)}
	onfocus={() => onlit?.(comment)}
	onblur={() => onlit?.(null)}
	onclick={editable ? () => window.getSelection()?.type !== 'Range' && editor?.edit(comment) : undefined}
	onkeydown={editable
		? (e) => {
				if (e.key !== 'Enter' || e.target !== e.currentTarget) return;
				e.preventDefault();
				editor?.edit(comment);
			}
		: undefined}
	class="flex flex-col rounded-xl border bg-[color-mix(in_srgb,var(--color-accent)_8%,var(--color-taupe1))] text-left font-normal text-dark {editing ? 'gap-2 border-2 border-accent px-4 py-3 text-base shadow-xl' : 'gap-1 border-accent/50 px-3 py-2 text-sm shadow-md focus:outline-2 focus:outline-accent hover:border-accent'} {editable ? 'cursor-pointer' : ''} {extra}"
>
	<header class="flex flex-wrap items-baseline gap-x-2 text-xs text-taupe4">
		<span class="font-semibold text-taupe5">{names}</span>
		{#if comment.scope}<span>on {comment.scope === 'whole section' ? 'the whole section' : comment.scope}</span>{/if}
	</header>
	{#if editing && editor?.open}
		<textarea
			bind:this={field}
			bind:value={editor.open.body}
			onkeydown={onFieldKey}
			readonly={editor.busy}
			rows="6"
			aria-label={isNew ? 'Your comment' : 'Edit your comment'}
			placeholder="Write a comment"
			class="min-h-12 w-full flex-1 resize-none rounded-md px-2 py-1"
		></textarea>
		{#if editor.problem}<p role="alert" class="text-sm text-red">{editor.problem}</p>{/if}
		<div class="flex shrink-0 justify-end gap-2 text-sm">
			<button type="button" onclick={() => editor.cancel()} class="rounded-md px-3 py-1 hover:bg-taupe2">Cancel</button>
			<button type="button" onclick={() => editor.post()} disabled={editor.busy || !editor.open.body.trim()} class="rounded-md bg-accent px-3 py-1 font-medium text-on-accent hover:bg-accent/90 disabled:cursor-not-allowed disabled:opacity-50">{isNew ? 'Post' : 'Save'}</button>
		</div>
	{:else}
		<p class="break-words whitespace-pre-wrap">{comment.body}</p>
	{/if}
</article>
