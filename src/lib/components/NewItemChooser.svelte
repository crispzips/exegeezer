<script>
	import { tick } from 'svelte';
	import { tip } from '#lib/utilities/menuTip.svelte.js';

	/**
	 * Enter in an edited section or paragraph asks what comes next: two round buttons, shown as their
	 * glyphs (¶ and §). The first, and the one with focus, is whatever was made most recently, so Enter
	 * again repeats it. Choosing a section asks one more thing: its level, as round buttons of # marks, in order,
	 * only the levels the text can take (none deeper than one below the heading before it), with the level
	 * you are in focused. It hangs from where the caret was (`rect`). Tab (or the arrow keys) moves between the buttons; Escape, or clicking away, makes nothing.
	 *
	 * @type {{
	 *   rect: DOMRect,
	 *   first: 'paragraph' | 'section',
	 *   levels: number[],
	 *   level: number,
	 *   onpick: (kind: 'paragraph' | 'section', level?: number) => void,
	 *   oncancel: () => void
	 * }}
	 */
	let { rect, first, levels, level, onpick, oncancel } = $props();

	/** @type {'kind' | 'level'} */
	let stage = $state('kind');
	const kinds = $derived(/** @type {('paragraph' | 'section')[]} */ (first === 'section' ? ['section', 'paragraph'] : ['paragraph', 'section']));
	let innerWidth = $state(0);
	let innerHeight = $state(0);
	const W = $derived((stage === 'kind' ? 2 : levels.length) * 52 + 12); // 44px buttons, a gap, and the padding
	const H = 60;
	// dangling from where the caret was (under the line just typed), or above it when there is no room below
	const left = $derived(Math.max(4, Math.min(rect.left - 8, innerWidth - W - 4)));
	const top = $derived(rect.bottom + 8 + H > innerHeight ? Math.max(4, rect.top - H - 8) : rect.bottom + 8);

	/** @type {HTMLDivElement | undefined} */
	let box = $state();
	/** true while the buttons are swapped for the next stage (the focused one goes, which is not leaving) */
	let switching = false;
	/** @returns {HTMLButtonElement[]} */
	const buttons = () => /** @type {HTMLButtonElement[]} */ ([...(box?.querySelectorAll('button') ?? [])]);
	$effect(() => {
		if (box && stage === 'kind') buttons()[0]?.focus();
	});

	/** @param {'paragraph' | 'section'} kind */
	async function chooseKind(kind) {
		if (kind === 'paragraph') return onpick('paragraph');
		switching = true;
		stage = 'level';
		await tick();
		const at = Math.max(0, levels.indexOf(level));
		buttons()[at]?.focus();
		switching = false;
	}

	/** @param {KeyboardEvent} e */
	function onkeydown(e) {
		e.stopPropagation(); // the page and the views must not also act on these keys
		if (e.key === 'Escape') {
			e.preventDefault();
			oncancel();
		} else if (e.key === 'Tab' || e.key === 'ArrowLeft' || e.key === 'ArrowRight' || e.key === 'ArrowUp' || e.key === 'ArrowDown') {
			e.preventDefault();
			const all = buttons();
			const back = e.key === 'ArrowLeft' || e.key === 'ArrowUp' || (e.key === 'Tab' && e.shiftKey);
			const i = all.indexOf(/** @type {HTMLButtonElement} */ (document.activeElement));
			all[(i + (back ? -1 : 1) + all.length) % all.length]?.focus();
		}
	}

	/** @param {FocusEvent} e */
	function onfocusout(e) {
		if (switching) return;
		if (!box?.contains(/** @type {Node | null} */ (e.relatedTarget))) oncancel();
	}

	const btn = 'flex h-11 w-11 items-center justify-center rounded-full border border-taupe3 bg-taupe1 text-taupe5 [box-shadow:0_3px_3px_var(--color-taupe4)] hover:bg-taupe2 focus:bg-taupe2 focus:outline-2 focus:outline-taupe4';
</script>

<svelte:window bind:innerWidth bind:innerHeight />

<!-- svelte-ignore a11y_no_noninteractive_element_interactions -->
<div
	bind:this={box}
	role="menu"
	aria-label={stage === 'kind' ? 'Add a paragraph or a section' : 'The new section\'s level'}
	tabindex="-1"
	{onkeydown}
	{onfocusout}
	class="pop-in fixed z-50 flex items-center gap-2 rounded-full border border-taupe3 bg-taupe1 p-1 shadow-lg"
	style="left: {left}px; top: {top}px"
>
	{#if stage === 'kind'}
		{#each kinds as kind (kind)}
			<button type="button" role="menuitem" aria-label={kind === 'paragraph' ? 'Paragraph' : 'Section'} use:tip={kind === 'paragraph' ? 'Paragraph' : 'Section'} data-tip-place="below" onclick={() => chooseKind(kind)} class={btn}>
				{#if kind === 'paragraph'}
					<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="24" height="24" fill="currentColor"><path d="M4 10c0 3.31 2.69 6 6 6h2v4h2V6h2v14h2V6h3V4H10c-3.31 0-6 2.69-6 6m8 4h-2c-2.21 0-4-1.79-4-4s1.79-4 4-4h2z" /></svg>
				{:else}
					<span class="text-2xl leading-none font-semibold" style="font-family: Georgia, serif">§</span>
				{/if}
			</button>
		{/each}
	{:else}
		{#each levels as n (n)}
			<button type="button" role="menuitem" aria-label="Heading {n}" use:tip={`Heading ${n}`} data-tip-place="below" onclick={() => onpick('section', n)} class={btn}>
				<span class="leading-none font-semibold {n > 4 ? 'text-xs' : n > 2 ? 'text-base' : 'text-xl'}" style="font-family: Georgia, serif">{'#'.repeat(n)}</span>
			</button>
		{/each}
	{/if}
</div>
