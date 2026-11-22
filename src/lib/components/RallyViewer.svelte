<script>
	import { untrack } from 'svelte';
	import { Play, Pause, SkipNext, SkipPrevious } from '@boxicons/svelte';
	import { tip } from '#lib/utilities/menuTip.svelte.js';
	import { definitionsOf, renderMarkdown } from '#lib/utilities/renderMarkdown.js';
	import { buildSections } from '#lib/utilities/buildSections.js';
	import { colorSections } from '#lib/utilities/sectionColor.js';
	import { rallyChunks, plain, readMs as readTime, writeMs as writeTime, composeMs as composeTime, READ_WPM, SIZES } from '#lib/utilities/rallyChunks.js';

	/**
	 * Rally view: paced reading and writing. The text is dealt out a paragraph at a time: the current
	 * paragraph in the middle, the previous one fading out of view to its left, the next one fading
	 * out to its right.
	 *
	 * Reading: each chunk is shown in turn, for as long as its words take at the chosen speed.
	 *
	 * Writing has four styles:
	 *  - compose (the default): no source. The writer composes new text, a sentence or paragraph at
	 *    paragraph at a time, with the time the speed allows for each; Enter or the time running out hands it to
	 *    `oncompose`, which adds it to the text.
	 *  - copy: the chunk stays shown and is typed back before its time runs out.
	 *  - recall: the chunk is shown for its reading time, then hidden, and typed from memory in time.
	 *  - dictate: the chunk is shown once, then hidden; the writer writes it at their own pace and
	 *    Enter moves on.
	 * Copy, recall and dictate keep a tally of chunks matched and missed, and change nothing.
	 *
	 * @type {{
	 *   paragraphs: { id: string, originalIndex: number, text: string, level?: number }[],
	 *   writing?: boolean,
	 *   style?: 'compose' | 'copy' | 'recall' | 'dictate',
	 *   size?: number,
	 *   speed?: number,
	 *   playing?: boolean,
	 *   focusId?: string | null,
	 *   onfocusitem?: (id: string) => void,
	 *   oncompose?: (add: { afterId: string | null, text: string }) => string | null | void,
	 *   empty?: string
	 * }}
	 */
	let { paragraphs, writing = false, style = 'compose', size = 4, speed = $bindable(6), playing = $bindable(false), focusId = null, onfocusitem = undefined, oncompose = undefined, empty = 'No text yet.' } = $props();

	const compose = $derived(writing && style === 'compose');
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
	/** @param {string | undefined} id */
	const tint = (id) => `--c: ${(id && colors.get(id)) || 'var(--color-violet)'}`;
	/** the bubble look: a thick border in the section's colour, a tint of it inside, and the forced-perspective taupe shadow */
	const BUBBLE = 'rounded-[3rem] border-8 border-(--c) bg-[color-mix(in_srgb,var(--c)_12%,var(--color-taupe1))] px-8 py-6 [box-shadow:0_3px_3px_var(--color-taupe4)]';
	let index = $state(0);
	const chunk = $derived(chunks[Math.min(index, chunks.length - 1)]);

	/** 'show': the chunk is on view; 'write': the writer's turn (compose is always 'write') */
	let phase = $state('show');
	/** ms to read the chunk at the reading speed, and to write it at the writing speed */
	const readMs = $derived(chunk ? readTime(chunk.text, speed) : 0);
	const writeMs = $derived(chunk ? writeTime(chunk.text, speed) : 0);
	const composeMs = $derived(composeTime(speed));

	/** how long the current phase lasts, in ms, or null when it waits for the writer */
	const limit = $derived.by(() => {
		if (compose) return composeMs;
		if (!chunk) return null;
		if (!writing) return readMs;
		if (style === 'copy') return writeMs;
		if (phase === 'show') return readMs;
		return style === 'recall' ? writeMs : null;
	});
	/** whether the chunk's text is on view */
	const visible = $derived(!writing || style === 'copy' || phase === 'show');

	// follow the shared focus (and start from it); a changed chunk list keeps the same paragraph
	let lastPara = '';
	$effect(() => {
		const id = focusId;
		const list = chunks;
		if (compose) return;
		untrack(() => {
			const here = list[index]?.paraId;
			if (id && id !== here && id !== lastPara) {
				const found = list.findIndex((c) => c.paraId === id);
				if (found >= 0) index = found;
			} else if (index >= list.length) index = Math.max(0, list.length - 1);
		});
	});
	$effect(() => {
		const para = chunk?.paraId;
		if (!para || compose) return;
		lastPara = para;
		onfocusitem?.(para);
	});

	let typed = $state('');
	let hits = $state(0);
	let misses = $state(0);
	let missed = $state(false);
	/** compose: the paragraph this run has made (sentences join it), and how many chunks were handed over */
	let composedId = $state(/** @type {string | null} */ (null));
	let composed = $state(0);
	/** compose: a counter that restarts the clock for the next turn */
	let turn = $state(0);
	/** @type {HTMLTextAreaElement | undefined} */
	let field = $state();

	function step(by = 1) {
		const next = index + by;
		if (next < 0) return;
		if (next >= chunks.length) {
			playing = false;
			return;
		}
		index = next;
		composedId = null;
	}

	// a new chunk (or style): clear the writer's field and begin again with the chunk shown
	$effect(() => {
		void chunk?.id;
		void style;
		void writing;
		untrack(() => {
			typed = '';
			missed = false;
			phase = compose || (writing && style === 'copy') ? 'write' : 'show';
			if (writing) field?.focus();
		});
	});
	/** compose: hand the typed text to the page, then start the next turn */
	function submit() {
		const text = typed.trim();
		typed = '';
		turn++;
		if (!text || !oncompose) return;
		const id = oncompose({ afterId: composedId ?? focusId ?? null, text });
		if (id) composedId = id;
		composed++;
	}

	/** the writer's text matches the chunk (copy and recall) */
	const matched = $derived(writing && !compose && !!chunk && typed.trim() !== '' && plain(typed).toLowerCase() === plain(chunk.text).toLowerCase());

	// the clock: when the phase's time is up, move on
	$effect(() => {
		if (!playing || limit === null) return;
		void index;
		void turn;
		void phase;
		const t = setTimeout(() => {
			if (compose) return submit();
			if (writing && phase === 'show') {
				phase = 'write';
				field?.focus();
				return;
			}
			if (writing && !matched) {
				misses++;
				missed = true;
			}
			step(1);
		}, limit);
		return () => clearTimeout(t);
	});

	// copy and recall move on at once when the chunk is typed correctly
	$effect(() => {
		if (!matched || style === 'dictate') return;
		const t = setTimeout(
			() =>
				untrack(() => {
					hits++;
					if (playing) step(1);
				}),
			250
		);
		return () => clearTimeout(t);
	});

	// leaving writing, or changing style, resets the tally
	$effect(() => {
		void style;
		if (!writing) untrack(() => ((hits = 0), (misses = 0), (composed = 0), (composedId = null)));
		else untrack(() => ((hits = 0), (misses = 0)));
	});

	/** @param {KeyboardEvent} e the writer's field: Enter hands compose text over, or confirms a dictated chunk */
	function onFieldKey(e) {
		if (e.key === 'Enter' && !e.shiftKey) {
			e.preventDefault();
			if (compose) submit();
			else if (style === 'dictate') {
				if (matched) hits++;
				else if (typed.trim()) misses++;
				step(1);
			}
		}
	}

	/** @param {KeyboardEvent} e */
	function onKey(e) {
		const t = /** @type {HTMLElement} */ (e.target);
		if (e.metaKey || e.ctrlKey || e.altKey) return;
		if (t.closest('input, textarea, select, [contenteditable]')) {
			if (e.key === 'Escape') playing = false;
			return;
		}
		if (e.key === ' ') playing = !playing;
		else if (e.key === 'ArrowUp') speed = Math.min(READ_WPM.length - 1, speed + 1);
		else if (e.key === 'ArrowDown') speed = Math.max(0, speed - 1);
		else if (!compose && e.key === 'ArrowRight') step(1);
		else if (!compose && e.key === 'ArrowLeft') step(-1);
		else return;
		e.preventDefault();
	}

	const fontStyle = $derived(`font-size: ${SIZES[size] ?? 2}rem; line-height: 1.35`);

	/** the paragraphs around the current one, to slide in and out: offset -1 (previous), 0, +1 (next), and one more each way, unseen */
	const around = $derived.by(() => {
		if (compose) return [];
		const at = Math.min(index, chunks.length - 1);
		return chunks.slice(Math.max(0, at - 2), at + 3).map((c, k) => ({ c, offset: Math.max(0, at - 2) + k - at }));
	});
	/** compose: the paragraph before the one being written, shown fading out to the left */
	const before = $derived(compose ? (chunks.find((c) => c.paraId === (composedId ?? focusId)) ?? chunks[chunks.length - 1]) : undefined);
	/** a slide's transform and opacity, by its place relative to the current paragraph (centre: 50% wide; neighbours peek in from the sides and fade) @param {number} offset */
	const slide = (offset) => `transform: translateX(calc(-50% + ${offset * 106}%)) scale(${offset === 0 ? 1 : 0.9}); opacity: ${offset === 0 ? 1 : Math.abs(offset) === 1 ? 0.3 : 0}`;
</script>

<svelte:window onkeydown={onKey} />

<div class="flex h-full flex-col bg-taupe1">
	{#if !chunks.length && !compose}
		<p class="m-auto text-grey3">{empty}</p>
	{:else}
		<!-- the stage: the paragraph in the middle, its neighbours fading out to either side -->
		<div class="relative min-h-0 flex-1 overflow-hidden text-dark [mask-image:linear-gradient(to_right,transparent,black_20%,black_80%,transparent)]" style={fontStyle}>
			{#each around as { c, offset } (c.id)}
				<div class="rally-chunk absolute top-1/2 left-1/2 flex max-h-[90%] w-1/2 -translate-y-1/2 items-center justify-center overflow-hidden text-center transition-[transform,opacity] duration-500 ease-out {BUBBLE} {offset === 0 && writing ? 'text-taupe5' : ''} {c.header ? 'font-semibold' : ''} {offset === 0 && !visible ? 'invisible' : ''}" style="{slide(offset)}; {tint(c.paraId)}">
					<div>{@html renderMarkdown(c.text, defs, c.id)}</div>
				</div>
			{/each}
			{#if compose && before}
				<div class="rally-chunk absolute top-1/2 left-1/2 flex max-h-[90%] w-1/2 -translate-y-1/2 items-center justify-center overflow-hidden text-center transition-[transform,opacity] duration-500 ease-out {BUBBLE}" style="{slide(-1)}; {tint(before.paraId)}">
					<div>{@html renderMarkdown(before.text, defs, before.id)}</div>
				</div>
			{/if}
			{#if compose}
				<!-- composing: the paragraph being written is the one in the middle -->
				<div class="bubble-form absolute top-1/2 left-1/2 w-1/2 -translate-x-1/2 -translate-y-1/2 text-center {BUBBLE}" style={tint(before?.paraId)}>
					<textarea bind:this={field} bind:value={typed} onkeydown={onFieldKey} rows="4" spellcheck="false" aria-label="Compose" class="w-full resize-none rounded-[2rem] text-left" style="font-size: inherit; line-height: inherit"></textarea>
				</div>
			{/if}
		</div>
		{#if writing && !compose}
			<!-- copy, recall, dictate: typed below the paragraph -->
			<div class="shrink-0 px-[15%] pb-4" style={fontStyle}>
				<div class="bubble-form text-center {BUBBLE}" style={tint(chunk?.paraId)}>
					<textarea bind:this={field} bind:value={typed} onkeydown={onFieldKey} rows="3" spellcheck="false" aria-label="Type the paragraph" class="w-full resize-none rounded-[2rem] text-left {matched ? 'border-green!' : missed ? 'border-orange!' : ''}" style="font-size: inherit; line-height: inherit"></textarea>
				</div>
			</div>
		{/if}

		<!-- the clock: drains over the phase's time while playing -->
		<div class="h-1 shrink-0 bg-taupe2">
			{#if limit !== null}
				{#key `${chunk?.id}:${phase}:${turn}:${playing}:${limit}`}
					<div class="h-full bg-taupe3 {playing ? 'rally-drain' : ''}" style="animation-duration: {limit}ms; {playing ? '' : 'width: 0'}"></div>
				{/key}
			{/if}
		</div>
		<div class="flex shrink-0 items-center justify-center gap-3 border-t border-taupe2 px-4 py-2 text-dark">
			{#if !compose}
				<button onclick={() => step(-1)} disabled={index === 0} aria-label="Previous" use:tip={'Previous'} data-tip-place="below" class="inline-flex rounded-md p-1 hover:bg-taupe2 disabled:opacity-30"><SkipPrevious /></button>
			{/if}
			<button onclick={() => (playing = !playing)} aria-label={playing ? 'Pause' : 'Play'} use:tip={playing ? 'Pause' : 'Play'} data-tip-place="below" class="inline-flex rounded-md p-1 hover:bg-taupe2">{#if playing}<Pause />{:else}<Play />{/if}</button>
			{#if !compose}
				<button onclick={() => step(1)} disabled={index >= chunks.length - 1} aria-label="Next" use:tip={'Next'} data-tip-place="below" class="inline-flex rounded-md p-1 hover:bg-taupe2 disabled:opacity-30"><SkipNext /></button>
				<span class="text-xs text-grey3 tabular-nums">{index + 1} / {chunks.length}</span>
			{/if}
			{#if compose}<span class="text-xs text-grey3 tabular-nums">{composed} written</span>
			{:else if writing}<span class="text-xs text-grey3 tabular-nums">{hits} hit · {misses} missed</span>{/if}
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
