<script>
	/**
	 * Footnote tooltip for the views that show footnote marks (`.footnote-ref`, carrying their note in
	 * data-note): hovering or focusing a mark shows the note above it (below only when there is no
	 * room above). It stays open while the pointer is on it, so links inside the note can be clicked.
	 */
	/** @type {{ html: string, x: number, y: number, below: boolean } | null} */
	let note = $state(null);
	/** @type {ReturnType<typeof setTimeout> | undefined} */
	let timer;
	function close() {
		clearTimeout(timer);
		timer = setTimeout(() => (note = null), 150);
	}
	/** @param {Event} e */
	function over(e) {
		const mark = e.target instanceof Element ? e.target.closest('.footnote-ref') : null;
		if (!(mark instanceof HTMLElement)) return;
		clearTimeout(timer);
		const r = mark.getBoundingClientRect();
		const below = r.top < 160;
		note = { html: mark.dataset.note ?? '', x: r.left + r.width / 2, y: below ? r.bottom : r.top, below };
	}
	/** @param {Event} e */
	function out(e) {
		if (e.target instanceof Element && e.target.closest('.footnote-ref')) close();
	}
</script>

<svelte:window onpointerover={over} onpointerout={out} onfocusin={over} onfocusout={out} />

{#if note}
	<div
		role="tooltip"
		onpointerenter={() => clearTimeout(timer)}
		onpointerleave={close}
		class="md fixed z-[60] w-max max-w-sm overflow-y-auto rounded-2xl border border-taupe3 bg-taupe1 text-sm text-taupe5 shadow-lg"
		style="padding: 2rem; max-height: {note.below ? window.innerHeight - note.y - 12 : note.y - 12}px; left: clamp(8px, calc({note.x}px - 12rem), calc(100vw - 24.5rem)); {note.below ? `top: ${note.y + 4}px` : `bottom: ${window.innerHeight - note.y + 4}px`}"
	>
		{@html note.html}
	</div>
{/if}
