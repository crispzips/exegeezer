<script>
	import { untrack } from 'svelte';
	import CascadingViewer from '#lib/components/CascadingViewer.svelte';
	import { Play, Pause } from '@boxicons/svelte';
	import { tip } from '#lib/utilities/menuTip.svelte.js';
	import { buildSections, ancestorsOf } from '#lib/utilities/buildSections.js';
	import { sectionColor } from '#lib/utilities/sectionColor.js';
	import { SIZES, composeMs } from '#lib/utilities/rallyChunks.js';

	/**
	 * Rally view, writing mode: two columns. On the right, the text as the cascading view lays it out, with a
	 * cursor in a gap between bubbles marking where the next thing goes (click a gap, or use the arrow keys).
	 * On the left, a one-line markdown editor: Enter injects its line at the cursor, and so does the clock running out
	 * (a fixed time for the speed, whatever is typed; an empty line just starts the clock again). A line that starts with
	 * hashtags is a section (as many as its level), anything else is a paragraph.
	 *
	 * @type {{
	 *   paragraphs: { id: string, originalIndex: number, text: string, level?: number }[],
	 *   size?: number,
	 *   speed?: number,
	 *   playing?: boolean,
	 *   oninject?: (add: { gap: { id: string, place: 'before' | 'after' | 'inside' } | null, text: string }) => { id: string, kind: 'paragraph' | 'section' } | null | void,
	 *   focusId?: string | null,
	 *   onfocusitem?: (id: string) => void,
	 *   ondelete?: (req: { id: string, kind: 'paragraph' | 'section', scope?: 'only' | 'tree' }) => void
	 * }}
	 */
	let { paragraphs, size = 5, speed = $bindable(6), playing = $bindable(false), oninject = undefined, focusId = null, onfocusitem = undefined, ondelete = undefined } = $props();

	/** @type {{ id: string, place: 'before' | 'after' | 'inside' } | null} */
	let cursor = $state(null);
	/** @type {ReturnType<typeof CascadingViewer> | undefined} */
	let cascade = $state();
	/** @type {HTMLInputElement | undefined} */
	let field = $state();
	let line = $state('');

	/** the colour of the section the cursor is in: the cascade's own (every section takes its top-level section's colour; taupe at the top level) */
	const tint = $derived.by(() => {
		if (!cursor) return 'var(--color-taupe3)';
		const tree = buildSections(paragraphs);
		const section = cursor.place === 'inside' ? cursor.id : (ancestorsOf(tree, cursor.id) ?? []).at(-1);
		if (!section) return 'var(--color-taupe3)';
		const top = (ancestorsOf(tree, section) ?? [])[0] ?? section;
		const at = tree.filter((n) => n.kind === 'section').findIndex((n) => n.kind === 'section' && n.id === top);
		return at === -1 ? 'var(--color-taupe3)' : sectionColor(at, 0);
	});

	/** a line's kind: hashtags at the front (then a space, or nothing) make it a section */
	const heading = $derived(/^(#{1,6})(?:\s|$)/.exec(line)?.[1].length ?? 0);

	/** the end of the text, or the shared focus, until the writer puts the cursor somewhere */
	function defaultCursor() {
		const at = (focusId && paragraphs.find((p) => p.id === focusId)) || paragraphs[paragraphs.length - 1];
		return at ? { id: at.id, place: /** @type {'after' | 'inside'} */ ((at.level ?? 0) > 0 ? 'inside' : 'after') } : null;
	}
	// a cursor for a text that has none yet, or whose item has gone (undone, deleted)
	$effect(() => {
		const list = paragraphs;
		untrack(() => {
			if (!cursor || !list.some((p) => p.id === cursor?.id)) cursor = defaultCursor();
		});
	});
	$effect(() => {
		if (cursor) onfocusitem?.(cursor.id);
	});
	$effect(() => {
		if (field) setTimeout(() => field?.focus(), 50); // after the setup modal has closed
	});
	/** typing anywhere (with no other field or dialog in use) goes to the line @param {KeyboardEvent} e */
	function keepFocus(e) {
		const a = document.activeElement;
		if (a === field || e.metaKey || e.ctrlKey || e.altKey) return;
		if (a instanceof HTMLElement && (a.closest('input, textarea, select, [contenteditable], dialog') || document.querySelector('dialog[open]'))) return;
		field?.focus();
	}

	/** restarts the clock for the next line */
	let turn = $state(0);
	const limit = $derived(composeMs(speed));
	/** the clock is held while the writer is moving the cursor, and for a moment after */
	let held = $state(false);
	/** @type {ReturnType<typeof setTimeout> | undefined} */
	let releaseTimer;
	/** set when the writer's own Enter moves the cursor, which is not the writer moving it */
	let skipHold = true;
	$effect(() => {
		void cursor?.id;
		void cursor?.place;
		untrack(() => {
			if (skipHold) return void (skipHold = false);
			held = true;
			clearTimeout(releaseTimer);
			releaseTimer = setTimeout(() => (held = false), 1500);
		});
	});

	/** @param {boolean} [timedOut] */
	function submit(timedOut = false) {
		turn++;
		const text = line.trim();
		if (!text) return;
		// a paragraph can only go where it would stay in the gap the cursor is in; otherwise nothing is added and the line stays
		if (heading === 0 && cursor && cascade && !cascade.canHoldParagraph(cursor)) return;
		const made = oninject?.({ gap: cursor, text });
		if (!made) return;
		line = '';
		// the next line goes after what was just made (a section: inside it, to be filled)
		skipHold = true;
		cursor = { id: made.id, place: made.kind === 'section' ? 'inside' : 'after' };
	}

	// the clock: while playing (and the cursor is not being moved), the time running out injects what is typed; the time left is kept across pauses
	let left = limit;
	let lastKey = '';
	$effect(() => {
		const key = `${turn}:${limit}`;
		if (key !== lastKey) ((lastKey = key), (left = limit));
		if (!playing || held) return;
		const start = performance.now();
		const t = setTimeout(() => submit(true), left);
		return () => {
			clearTimeout(t);
			left = Math.max(0, left - (performance.now() - start));
		};
	});

	/** @param {KeyboardEvent} e */
	function onKey(e) {
		if (e.key === 'Enter') {
			e.preventDefault();
			return submit();
		}
		// the arrows move the cursor in the text on the right, never the caret in this line
		const dir = { ArrowUp: 'up', ArrowDown: 'down', ArrowLeft: 'left', ArrowRight: 'right' }[e.key];
		if (!dir) return;
		e.preventDefault();
		cascade?.moveCursor(/** @type {'up' | 'down' | 'left' | 'right'} */ (dir));
	}
</script>

<svelte:window onkeydown={keepFocus} />

<!-- svelte-ignore a11y_click_events_have_key_events, a11y_no_static_element_interactions -->
<div class="flex h-full bg-taupe1" style="--c: {tint}" onclick={() => field?.focus()}>
	<!-- the editor: one line, markdown -->
	<div class="flex w-[38%] min-w-0 shrink-0 flex-col items-center justify-center gap-3 border-r border-taupe2 px-6 text-dark" style="font-size: {(SIZES[size] ?? 2) * 0.7}rem; line-height: 1.35">
		<div class="bubble-form w-full rounded-[3rem] border-4 border-(--c) bg-[color-mix(in_srgb,var(--c)_12%,var(--color-taupe1))] px-3 py-3 [box-shadow:0_3px_3px_var(--color-taupe4)]">
			<input
				bind:this={field}
				bind:value={line}
				onkeydown={onKey}
				type="text"
				spellcheck="false"
				autocomplete="off"
				aria-label="Write a line"
				data-text-undo
				placeholder={heading ? 'Section title' : 'Write a paragraph, or # a section'}
				class="pointer-events-none w-full rounded-[1.5rem] px-4 py-2 text-left"
				style="font-size: inherit; line-height: inherit"
			/>
		</div>
		<!-- the clock: drains over the time allowed for a line (a tick count, never seconds) -->
		<div class="flex w-full items-center gap-2">
			<button type="button" onclick={() => (playing = !playing)} aria-label={playing ? 'Pause' : 'Play'} use:tip={playing ? 'Pause' : 'Play'} data-tip-place="below" class="inline-flex shrink-0 rounded-md p-1 hover:bg-taupe2">{#if playing}<Pause />{:else}<Play />{/if}</button>
			<div class="h-1 flex-1 bg-taupe2">
				{#key `${turn}:${limit}`}
					<div class="rally-drain h-full bg-taupe3" style="animation-duration: {limit}ms; animation-play-state: {playing && !held ? 'running' : 'paused'}"></div>
				{/key}
			</div>
		</div>
		<p class="min-h-5 text-center text-xs text-grey3" style="font-size: 0.8rem">
			{#if heading}Section, heading {heading} · Enter to add it at the cursor{:else}Paragraph · Enter to add it at the cursor{/if}
		</p>
	</div>

	<!-- the text, cascading, with the insertion cursor -->
	<div class="min-w-0 flex-1">
		<CascadingViewer bind:this={cascade} placing bind:cursor {paragraphs} {focusId} {ondelete} empty="" />
	</div>
</div>

<style>
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
