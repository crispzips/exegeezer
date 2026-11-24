<script>
	import { untrack } from 'svelte';
	import { Play, Pause, SkipNext, SkipPrevious } from '@boxicons/svelte';
	import { tip } from '#lib/utilities/menuTip.svelte.js';
	import { definitionsOf, emphasizeFirst, renderMarkdown } from '#lib/utilities/renderMarkdown.js';
	import { buildSections } from '#lib/utilities/buildSections.js';
	import { colorSections } from '#lib/utilities/sectionColor.js';
	import { rallyChunks, readMs as readTime, READ_WPM, SIZES } from '#lib/utilities/rallyChunks.js';

	/**
	 * Rally view, reading mode: paced reading. The text is dealt out a paragraph at a time: the current
	 * paragraph in the middle, the previous one fading out of view above it, the next one fading
	 * out below it. (Up and Down step through them; Left and Right change the speed.)
	 *
	 * Reading: each chunk is shown in turn, for as long as its words take at the chosen speed.
	 *
	 * (Writing is RallyWriter's.)
	 *
	 * @type {{
	 *   paragraphs: { id: string, originalIndex: number, text: string, level?: number }[],
	 *   size?: number,
	 *   speed?: number,
	 *   playing?: boolean,
	 *   focusId?: string | null,
	 *   onfocusitem?: (id: string) => void,
	 *   empty?: string
	 * }}
	 */
	let { paragraphs, size = 5, speed = $bindable(6), playing = $bindable(false), focusId = null, onfocusitem = undefined, empty = 'No text yet.' } = $props();

	const chunks = $derived(rallyChunks(paragraphs));
	const defs = $derived(definitionsOf(paragraphs));
	/** each paragraph's bubble colour: its section's, as in the other views (a header takes its own) */
	const colors = $derived.by(() => {
		const bySection = colorSections(buildSections(paragraphs));
		/** @type {Map<string, string>} */
		const map = new Map();
		let here = 'var(--color-taupe3)';
		for (const p of paragraphs) {
			if ((p.level ?? 0) > 0) here = bySection.get(p.id) ?? here;
			map.set(p.id, here);
		}
		return map;
	});
	/** the bubble's colour: its paragraph's section @param {string | undefined} id */
	const tint = (id) => `--c: ${(id && colors.get(id)) || 'var(--color-accent)'}`;
	/** the bubble look: a thick border in the section's colour, a tint of it inside, and the forced-perspective taupe shadow */
	const BUBBLE = 'rounded-[3rem] border-8 border-(--c) bg-[color-mix(in_srgb,var(--c)_12%,var(--color-taupe1))] px-14 py-10 [box-shadow:0_3px_3px_var(--color-taupe4)]';
	let index = $state(0);
	const chunk = $derived(chunks[Math.min(index, chunks.length - 1)]);

	/** how long the current paragraph stays, in ms: the time to read its words at the chosen speed */
	const limit = $derived(chunk ? readTime(chunk.text, speed) : null);

	// follow the shared focus (and start from it); a changed chunk list keeps the same paragraph
	let lastPara = '';
	$effect(() => {
		const id = focusId;
		const list = chunks;
		untrack(() => {
			const here = list[index]?.paraId;
			if (id && id !== here && id !== lastPara) {
				let found = list.findIndex((c) => c.paraId === id);
				if (found < 0) {
					// the focused item is one rally skips (a definition, an empty paragraph): land on the nearest chunk at or before it
					const order = new Map(paragraphs.map((p, k) => [p.id, k]));
					const at = order.get(id);
					if (at !== undefined) {
						for (let k = list.length - 1; k >= 0; k--) if ((order.get(list[k].paraId) ?? Infinity) <= at) { found = k; break; }
						if (found < 0) found = 0;
					}
				}
				if (found >= 0) index = found;
			} else if (index >= list.length) index = Math.max(0, list.length - 1);
		});
	});
	$effect(() => {
		const para = chunk?.paraId;
		if (!para) return;
		lastPara = para;
		onfocusitem?.(para);
	});

	function step(by = 1) {
		const next = index + by;
		if (next < 0) return;
		if (next >= chunks.length) {
			playing = false;
			return;
		}
		index = next;
	}

	// the clock: when the time is up, move on
	$effect(() => {
		if (!playing || limit === null) return;
		void index;
		const t = setTimeout(() => step(1), limit);
		return () => clearTimeout(t);
	});

	/** @param {KeyboardEvent} e */
	function onKey(e) {
		const t = /** @type {HTMLElement} */ (e.target);
		if (e.metaKey || e.ctrlKey || e.altKey) return;
		if (t.closest('input, textarea, select, [contenteditable]')) {
			if (e.key === 'Escape') playing = false;
			return;
		}
		if (e.key === ' ') playing = !playing;
		else if (e.key === 'ArrowRight') speed = Math.min(READ_WPM.length - 1, speed + 1);
		else if (e.key === 'ArrowLeft') speed = Math.max(0, speed - 1);
		else if (e.key === 'ArrowDown') step(1);
		else if (e.key === 'ArrowUp') step(-1);
		else return;
		e.preventDefault();
	}

	const fontStyle = $derived(`font-size: ${SIZES[size] ?? 2}rem; line-height: 1.35`);

	/** the paragraphs around the current one, to slide in and out: three each way */
	const around = $derived.by(() => {
		const at = Math.min(index, chunks.length - 1);
		return chunks.slice(Math.max(0, at - 3), at + 4).map((c, k) => ({ c, offset: Math.max(0, at - 3) + k - at }));
	});
	/** each bubble's height as drawn, so the bubbles can be stacked with a small, even gap whatever their lengths */
	/** @type {Record<string, number>} */
	let heights = $state({});
	const GAP = 12;
	/** a bubble's transform and opacity by its place relative to the current one: the current is in the middle at full strength, the others are stacked above and below it, GAP apart, and faded @param {number} offset */
	function slide(offset) {
		if (offset === 0) return 'transform: translateX(-50%); opacity: 1';
		const dir = Math.sign(offset);
		const h = (/** @type {number} */ o) => heights[around.find((x) => x.offset === o)?.c.id ?? ''] ?? 0;
		let y = h(0) / 2 + GAP;
		for (let o = dir; o !== offset; o += dir) y += h(o) + GAP;
		y += h(offset) / 2;
		return `transform: translateX(-50%) translateY(${dir * y}px); opacity: 0.3`;
	}
</script>

<svelte:window onkeydown={onKey} />

<div class="flex h-full flex-col bg-taupe1">
	{#if !chunks.length}
		<p class="m-auto text-grey3">{empty}</p>
	{:else}
		<!-- the stage: the paragraph in the middle, its neighbours stacked close above and below it, faded -->
		<div class="relative min-h-0 flex-1 overflow-hidden text-dark [container-type:size]" style={fontStyle}>
			{#each around as { c, offset } (c.id)}
				<div role="presentation" onclick={() => { const k = chunks.findIndex((x) => x.id === c.id); if (k >= 0) index = k; }} bind:offsetHeight={heights[c.id]} class="rally-chunk {offset === 0 ? '' : 'cursor-pointer'} absolute top-1/2 left-1/2 flex max-h-[90%] w-1/2 -translate-y-1/2 items-center justify-center overflow-hidden text-center transition-[transform,opacity] duration-500 ease-out {BUBBLE} {offset === 0 ? 'z-20' : ''} {c.header ? 'font-semibold' : ''}" style="{slide(offset)}; {tint(c.paraId)}">
					<div>{@html emphasizeFirst(renderMarkdown(c.text, defs, c.id))}</div>
				</div>
			{/each}
			<!-- the ghosts fade into the page at the top and bottom; the current paragraph sits above this fade -->
			<div aria-hidden="true" class="pointer-events-none absolute inset-x-0 top-0 z-10 h-1/4 bg-linear-to-b from-taupe1 to-transparent"></div>
			<div aria-hidden="true" class="pointer-events-none absolute inset-x-0 bottom-0 z-10 h-1/4 bg-linear-to-t from-taupe1 to-transparent"></div>
		</div>
		<!-- the clock: drains over the phase's time while playing -->
		<div class="h-1 shrink-0 bg-taupe2">
			{#if limit !== null}
				{#key `${chunk?.id}:${playing}:${limit}`}
					<div class="h-full bg-taupe3 {playing ? 'rally-drain' : ''}" style="animation-duration: {limit}ms; {playing ? '' : 'width: 0'}"></div>
				{/key}
			{/if}
		</div>
		<div class="flex shrink-0 items-center justify-center gap-3 border-t border-taupe2 px-4 py-2 text-dark">
			<button onclick={() => step(-1)} disabled={index === 0} aria-label="Previous" use:tip={'Previous'} data-tip-place="below" class="inline-flex rounded-md p-1 hover:bg-taupe2 disabled:opacity-30"><SkipPrevious /></button>
			<button onclick={() => (playing = !playing)} aria-label={playing ? 'Pause' : 'Play'} use:tip={playing ? 'Pause' : 'Play'} data-tip-place="below" class="inline-flex rounded-md p-1 hover:bg-taupe2">{#if playing}<Pause />{:else}<Play />{/if}</button>
			<button onclick={() => step(1)} disabled={index >= chunks.length - 1} aria-label="Next" use:tip={'Next'} data-tip-place="below" class="inline-flex rounded-md p-1 hover:bg-taupe2 disabled:opacity-30"><SkipNext /></button>
			<span class="text-xs text-grey3 tabular-nums">{index + 1} / {chunks.length}</span>
		</div>
	{/if}
</div>

<style>
	.rally-chunk :global(p),
	.rally-chunk :global(h1),
	.rally-chunk :global(h2),
	.rally-chunk :global(h3),
	.rally-chunk :global(h4),
	.rally-chunk :global(h5),
	.rally-chunk :global(h6) {
		margin: 0;
		font-size: inherit;
		font-weight: inherit;
	}
	.rally-drain {
		animation-name: rally-drain;
		animation-timing-function: linear;
		animation-fill-mode: forwards;
	}
	@keyframes rally-drain {
		from {
			width: 100%;
		}
		to {
			width: 0;
		}
	}
</style>
