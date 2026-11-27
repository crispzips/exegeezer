<script>
	import CommentBubble from '#lib/components/CommentBubble.svelte';
	import { useCommentEditor } from '#lib/utilities/commentEditor.svelte.js';

	/**
	 * Comments flowing down a column beside the things they are about. Each bubble lines up with its anchor, or follows on
	 * from the bubble before it when that one is in the way. Place it next to `root`, never inside it, so that the two
	 * scroll together.
	 *
	 * @type {{
	 *   comments: import('#lib/utilities/comments.js').AnchoredComment[],
	 *   root: HTMLElement | null | undefined,
	 *   attribute: string,
	 *   onlit?: (comment: import('#lib/utilities/comments.js').AnchoredComment | null) => void
	 * }}
	 *
	 * `comments` are in the order of their anchors; an anchor is the element in `root` whose `attribute` is the comment's `anchorId`.
	 */
	let { comments, root, attribute, onlit = undefined } = $props();

	const SPACE = 8; // between neighbouring bubbles (px)
	/** the bubble being written in is larger than the rest */
	const editor = useCommentEditor();

	/** @type {HTMLDivElement | undefined} */
	let host = $state();

	function place() {
		if (!host || !root) return;
		const base = host.getBoundingClientRect();
		let end = 0;
		comments.forEach((c, i) => {
			const bubble = /** @type {HTMLElement | undefined} */ (host?.children[i]);
			if (!bubble) return;
			const anchor = root?.querySelector(`[${attribute}="${CSS.escape(c.anchorId)}"]`);
			// an anchor that isn't on the page (yet) leaves its comment out of sight
			bubble.style.visibility = anchor ? '' : 'hidden';
			if (!anchor) return;
			const box = anchor.getBoundingClientRect();
			const at = Math.max(end, box.top - base.top, 0);
			bubble.style.top = `${at}px`;
			end = at + bubble.offsetHeight + SPACE;
		});
		// the host is as long as its bubbles reach, so the view can scroll to the last of them
		host.style.minHeight = `${end}px`;
	}

	// place again whenever the anchors or the bubbles move, resize, arrive or leave
	$effect(() => {
		void comments;
		const el = root;
		if (!host || !el) return;
		/** @type {ReturnType<typeof setTimeout> | undefined} */
		let turn;
		const soon = () => {
			clearTimeout(turn);
			turn = setTimeout(place, 0);
		};
		const sizes = new ResizeObserver(soon);
		sizes.observe(el);
		for (const bubble of host.children) sizes.observe(bubble);
		const changes = new MutationObserver(soon);
		changes.observe(el, { childList: true, subtree: true });
		place();
		return () => {
			clearTimeout(turn);
			sizes.disconnect();
			changes.disconnect();
		};
	});
</script>

<div bind:this={host} data-comment-flow class="relative w-full">
	{#each comments as c (c.id)}
		<CommentBubble comment={c} {onlit} class="absolute {editor?.is(c.id) ? 'inset-x-1 z-10' : 'inset-x-2'}" />
	{/each}
</div>
