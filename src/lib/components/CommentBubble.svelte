<script>
	import { TrashX } from '@boxicons/svelte';
	import { tip } from '#lib/utilities/menuTip.svelte.js';
	import { useCommentEditor, DRAFT_ID } from '#lib/utilities/commentEditor.svelte.js';

	/**
	 * One comment. Pointing at it (or focusing it) reports it to `onlit`, so the view can mark what it is about.
	 *
	 * A click (or Enter) on one of the user's own comments grows the bubble into its editor, where it stands; a comment being
	 * written for the first time is a bubble in that state from the start. The words are edited as they are shown, not in a
	 * form field (like a paragraph edited in place). There are no buttons to post or cancel: Enter or Escape (or a click
	 * anywhere else, which the page sees to) finishes, saving the words or, if there are none, deleting the comment.
	 * Shift+Enter makes a new line.
	 * Pointing at one of the user's own comments also shows the button, in its top right corner, that deletes it. That
	 * button is placed against the bubble, so whatever class the view passes must position it (`relative` or `absolute`).
	 *
	 * The editor is roomy to begin with; `compact`, it begins one line high. Either way it grows with what is written.
	 *
	 * @type {{
	 *   comment: import('#lib/utilities/comments.js').AnchoredComment,
	 *   onlit?: (comment: import('#lib/utilities/comments.js').AnchoredComment | null) => void,
	 *   compact?: boolean,
	 *   class?: string
	 * }}
	 */
	let { comment, onlit = undefined, compact = false, class: extra = '' } = $props();

	const editor = useCommentEditor();
	const editing = $derived(!!editor?.is(comment.id));
	const editable = $derived(!!editor && !!comment.editable && !editing);
	const isNew = $derived(comment.id === DRAFT_ID);
	const names = $derived(comment.authors.join(', ') || 'Anonymous');

	/** @type {HTMLElement | undefined} */
	let bubble = $state();
	/** @type {HTMLDivElement | undefined} */
	let field = $state();

	// a bubble that goes away while pointed at takes its mark with it
	$effect(() => () => onlit?.(null));

	// each call for the editor brings it into view, with the caret at the end of the words
	$effect(() => {
		if (!editing || !field) return;
		void editor?.called;
		const target = field;
		if (target.contentEditable !== 'plaintext-only') target.contentEditable = 'true'; // older browsers
		const show = () => bubble?.scrollIntoView({ block: 'nearest', inline: 'nearest' });
		// after the view has placed the bubble, and after whatever the click that opened it focused
		const turn = setTimeout(() => {
			show();
			target.focus({ preventScroll: true });
			const selection = getSelection();
			selection?.selectAllChildren(target);
			selection?.collapseToEnd();
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
		if (e.isComposing || !(e.key === 'Escape' || (e.key === 'Enter' && !e.shiftKey))) return;
		e.preventDefault();
		e.stopPropagation(); // the Escape is the editor's: nothing around it is cleared too
		editor?.finish();
	}

	/** A press on the editor's bubble, beside the words, leaves the caret in them. @param {MouseEvent} e */
	function onBubblePress(e) {
		if (!field || !(e.target instanceof Node) || field.contains(e.target)) return;
		e.preventDefault();
		field.focus();
	}

	/** Deleting the last of the words can leave a line break behind, which would hide the placeholder: it goes too.
	 * (A capturing listener, so it has gone before the words are read.) @param {Event} e */
	function onFieldDelete(e) {
		if (e instanceof InputEvent && e.inputType.startsWith('delete') && field?.innerText === '\n') field.replaceChildren();
	}

	/** @param {ClipboardEvent} e */
	function onFieldPaste(e) {
		e.preventDefault(); // paste as plain text even where plaintext-only is unsupported
		if (!editor?.busy) document.execCommand('insertText', false, e.clipboardData?.getData('text/plain') ?? '');
	}

	/**
	 * A click on one of the bubble's buttons goes no further: it isn't a click on the bubble, which would open the editor.
	 * @param {MouseEvent} e
	 * @param {() => void} action
	 */
	function onButton(e, action) {
		e.stopPropagation();
		action();
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
	onmousedown={editing ? onBubblePress : undefined}
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
	class="group/comment flex flex-col rounded-xl border bg-[color-mix(in_srgb,var(--color-accent)_8%,var(--color-taupe1))] text-left font-normal text-dark {editing ? 'gap-2 border-2 border-accent px-4 py-3 text-base shadow-xl' : 'gap-1 border-accent/50 px-3 py-2 text-sm shadow-md focus:outline-2 focus:outline-accent hover:border-accent'} {editable ? 'cursor-pointer' : ''} {extra}"
>
	<header class="flex flex-wrap items-baseline gap-x-2 text-xs text-taupe4 {editable ? 'pr-5' : ''}">
		<span class="font-semibold text-taupe5">{names}</span>
		{#if comment.scope}<span>on {comment.scope === 'whole section' ? 'the whole section' : comment.scope}</span>{/if}
	</header>
	{#if editing && editor?.open}
		<div
			bind:this={field}
			bind:innerText={editor.open.body}
			contenteditable="plaintext-only"
			role="textbox"
			tabindex="0"
			aria-multiline="true"
			aria-readonly={editor.busy}
			aria-label={isNew ? 'Your comment' : 'Edit your comment'}
			data-placeholder="Write a comment"
			onkeydown={onFieldKey}
			onbeforeinput={(e) => editor.busy && e.preventDefault()}
			onpaste={onFieldPaste}
			oninputcapture={onFieldDelete}
			class="{compact ? 'min-h-[1lh]' : 'min-h-24'} flex-1 cursor-text overflow-y-auto break-words whitespace-pre-wrap outline-none"
		></div>
		{#if editor.problem}<p role="alert" class="text-sm text-red">{editor.problem}</p>{/if}
	{:else}
		<p class="break-words whitespace-pre-wrap">{comment.body}</p>
	{/if}
	{#if editable}
		<button type="button" aria-label="Delete comment" use:tip={'Delete'} onclick={(e) => onButton(e, () => editor?.askToRemove(comment))} class="raised absolute top-1 right-1 z-10 inline-flex items-center justify-center rounded-full p-0.5 text-dark opacity-0 shadow-md group-focus-within/comment:opacity-100 group-hover/comment:opacity-100 hover:bg-taupe2!"><TrashX width={16} height={16} /></button>
	{/if}
</article>
