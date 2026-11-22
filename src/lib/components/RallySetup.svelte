<script>
	import { fade } from 'svelte/transition';
	import { Pencil, Copy, Brain, Ear, TextHeight, Stopwatch, FlagChequered } from '@boxicons/svelte';
	import { tip } from '#lib/utilities/menuTip.svelte.js';
	import { READ_WPM, SIZES, STYLES, readMs, writeMs, composeMs } from '#lib/utilities/rallyChunks.js';

	/**
	 * The rally's setup: every setting in one modal, then a violet checkered-flag button (Start rally)
	 * at the bottom. Open it by setting `open`; `onstart` is called when the flag is clicked.
	 *
	 * @type {{
	 *   open: boolean,
	 *   writing: boolean,
	 *   empty?: boolean,
	 *   style: 'compose' | 'copy' | 'recall' | 'dictate',
	 *   size: number,
	 *   speed: number,
	 *   onstart: () => void
	 * }}
	 */
	let { open = $bindable(false), writing, empty = false, style = $bindable('compose'), size = $bindable(4), speed = $bindable(6), onstart } = $props();

	/** @type {HTMLDialogElement | undefined} */
	let dialogEl = $state();

	$effect(() => {
		if (open && dialogEl && !dialogEl.open) dialogEl.showModal();
		else if (!open && dialogEl?.open) dialogEl.close();
	});

	/** @param {MouseEvent} e */
	function onBackdrop(e) {
		if (e.target === dialogEl) dialogEl?.close();
	}

	// ---- the preview: sample paragraphs dealt out as the rally will, at the chosen size and pace, looping while the modal is open ----
	const SAMPLE = [
		'The quick brown fox jumps over the lazy dog.',
		'Pack my box with five dozen liquor jugs.',
		'How vexingly quick daft zebras jump!',
		'Sphinx of black quartz, judge my vow.',
		'Jackdaws love my big sphinx of quartz.'
	];
	let at = $state(0);
	/** how long the current sample stays: what a real paragraph would get with these settings */
	const dwell = $derived.by(() => {
		const shown = SAMPLE[at];
		if (!writing || empty || style === 'dictate') return readMs(shown, speed);
		if (style === 'compose') return composeMs(speed);
		return writeMs(shown, speed);
	});
	$effect(() => {
		if (!open) return;
		void at;
		const t = setTimeout(() => (at = (at + 1) % SAMPLE.length), dwell);
		return () => clearTimeout(t);
	});
	/** each writing style has its own accent from the theme */
	const STYLE_COLOURS = { compose: 'green', copy: 'blue', recall: 'magenta', dictate: 'orange' };
	/** the modal's own accent: the chosen writing style's colour (violet when there is no style to choose) */
	const mode = $derived(writing && !empty ? `var(--color-${STYLE_COLOURS[style]})` : 'var(--color-violet)');
	const STYLE_TIPS = { compose: 'Compose new text', copy: 'Type it back', recall: 'Recall from memory', dictate: 'Dictation' };
</script>

<!-- svelte-ignore a11y_click_events_have_key_events, a11y_no_noninteractive_element_interactions -->
<dialog bind:this={dialogEl} onclick={onBackdrop} onclose={() => (open = false)} style="--mode: {mode}" class="m-auto w-[min(92vw,44rem)] rounded-lg border border-taupe2 bg-taupe1 p-5 text-dark backdrop:bg-black/40">
	<div class="flex flex-col gap-5">
		<!-- the preview: the real size and pace (just the current paragraph; no neighbours) -->
		<div class="flex h-72 flex-col overflow-hidden rounded-md border border-taupe2 bg-taupe1">
			<div class="flex min-h-0 flex-1 items-center justify-center overflow-hidden px-6 text-center text-dark" style="font-size: {SIZES[size]}rem; line-height: 1.35">
				{#key at}<span in:fade={{ duration: 300 }}>{SAMPLE[at]}</span>{/key}
			</div>
			<div class="h-1 shrink-0 bg-taupe2">
				{#key `${at}:${dwell}`}<div class="h-full w-full bg-taupe3" style="animation: rally-preview {dwell}ms linear forwards"></div>{/key}
			</div>
		</div>

		<!-- how writing works: only in writing mode -->
		{#if writing && !empty}
			<div class="flex items-center justify-center gap-2" role="group" aria-label="Writing style">
				{#each STYLES as s (s)}
					<button type="button" onclick={() => (style = s)} aria-label={STYLE_TIPS[s]} aria-pressed={style === s} use:tip={STYLE_TIPS[s]} data-tip-place="below" style="--a: var(--color-{STYLE_COLOURS[s]})" class="inline-flex items-center justify-center rounded-md border-2 p-2 text-(--a) hover:bg-[color-mix(in_srgb,var(--a)_15%,var(--color-taupe1))] {style === s ? 'border-(--a) bg-[color-mix(in_srgb,var(--a)_22%,var(--color-taupe1))]' : 'border-transparent'}">
						{#if s === 'copy'}<Copy class="text-(--a)!" />{:else if s === 'recall'}<Brain class="text-(--a)!" />{:else if s === 'dictate'}<Ear class="text-(--a)!" />{:else}<Pencil class="text-(--a)!" />{/if}
					</button>
				{/each}
			</div>
		{/if}

		<!-- text size: a slider with a tick for every size, and a sample -->
		<div class="flex items-center gap-3">
			<TextHeight class="shrink-0" />
			<div class="min-w-0 flex-1">
				<input type="range" min="0" max={SIZES.length - 1} step="1" bind:value={size} aria-label="Text size" class="form-range w-full" style="--p: {size / (SIZES.length - 1)}" />
				<div aria-hidden="true" class="flex justify-between px-4">{#each SIZES as _, i (i)}<span class="h-1.5 w-px bg-taupe4"></span>{/each}</div>
			</div>
			<span class="w-10 shrink-0"></span>
		</div>

		<!-- speed: a slider with a tick for every speed, no labels -->
		<div class="flex items-center gap-3">
			<Stopwatch class="shrink-0" />
			<div class="min-w-0 flex-1">
				<input type="range" min="0" max={READ_WPM.length - 1} step="1" bind:value={speed} aria-label="Speed" class="form-range w-full" style="--p: {speed / (READ_WPM.length - 1)}" />
				<div aria-hidden="true" class="flex justify-between px-4">{#each READ_WPM as _, i (i)}<span class="h-1.5 w-px bg-taupe4"></span>{/each}</div>
			</div>
			<span class="w-10 shrink-0"></span>
		</div>

		<button type="button" onclick={onstart} aria-label="Start rally" use:tip={'Start rally'} data-tip-place="below" class="mx-auto inline-flex items-center justify-center rounded-md bg-(--mode) px-6 py-2.5 text-taupe1 hover:brightness-110"><FlagChequered class="text-taupe1!" width={28} height={28} /></button>
	</div>
</dialog>

<style>
	@keyframes -global-rally-preview {
		from {
			width: 100%;
		}
		to {
			width: 0;
		}
	}
</style>
