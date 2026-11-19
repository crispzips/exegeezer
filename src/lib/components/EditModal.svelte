<script>
	import { tick } from 'svelte';
	import { X } from '@boxicons/svelte';
	import { findPosition, indexInfo, moveItem } from '#lib/utilities/editText.js';

	/**
	 * The editor modal for one paragraph or section. It grows out of the bubble it was
	 * opened from (the bubble's box visibly expands into the modal) and, when closed,
	 * shrinks back into the bubble's current place.
	 *
	 * The header holds the section title (or "Section # n" / "Paragraph # n" when there is
	 * none) and a dark exit button, over a thin taupe2 divider. The body holds the
	 * editable fields: the title (sections), and the item's indices. The indices are
	 * linked: they all describe one position in the text, so changing one moves the
	 * item and the others update to match. Nothing changes in the text until Save.
	 *
	 * @type {{
	 *   request: { id: string, kind: 'paragraph' | 'section', from: DOMRect } | null,
	 *   list: { id: string, originalIndex: number, text: string, level?: number }[],
	 *   onsave: (change: { id: string, title: string | null, position: number }) => void
	 * }}
	 */
	let { request = $bindable(null), list, onsave } = $props();

	/** @type {HTMLDialogElement | undefined} */
	let dialogEl = $state();
	/** @type {HTMLDivElement | undefined} */
	let bodyEl = $state();

	const DURATION = 260;
	const EASE = 'cubic-bezier(0.2, 0.8, 0.2, 1)';

	/** the item's draft position in the list (the one number every index derives from) */
	let pos = $state(0);
	let title = $state('');
	/** @type {Record<string, string>} */
	let errors = $state({});
	let closing = false;

	/** the item as it is now, before any edit */
	const current = $derived(request ? indexInfo(list, request.id) : null);
	/** the indices the item would have at the draft position */
	const preview = $derived(request ? indexInfo(moveItem(list, request.id, pos), request.id) : null);

	// "Section # n" / "Paragraph # n" for items without a title
	const heading = $derived.by(() => {
		if (!current) return '';
		const name = (current.title ?? '').trim();
		if (current.kind === 'section') return name || `Section # ${current.sectionIndex}`;
		return `Paragraph # ${current.paragraphIndex}`;
	});

	/** @param {DOMRect} to @param {DOMRect} from */
	function flip(from, to) {
		const dx = from.left - to.left;
		const dy = from.top - to.top;
		const sx = from.width / to.width;
		const sy = from.height / to.height;
		return `translate(${dx}px, ${dy}px) scale(${sx}, ${sy})`;
	}

	// Open: reset the draft, show the dialog, and expand it from the bubble's box
	$effect(() => {
		if (!request || !dialogEl || dialogEl.open) return;
		const info = indexInfo(list, request.id);
		pos = info?.originalIndex ?? 0;
		title = info?.title ?? '';
		errors = {};
		closing = false;
		const from = request.from;
		dialogEl.showModal();
		const to = dialogEl.getBoundingClientRect();
		const opts = { duration: DURATION, easing: EASE };
		dialogEl.animate(
			[{ transformOrigin: 'top left', transform: flip(from, to) }, { transformOrigin: 'top left', transform: 'none' }],
			opts
		);
		bodyEl?.animate([{ opacity: 0 }, { opacity: 0, offset: 0.4 }, { opacity: 1 }], opts);
		try {
			dialogEl.animate([{ opacity: 0 }, { opacity: 1 }], { ...opts, pseudoElement: '::backdrop' });
		} catch {
			/* browsers without ::backdrop animation just show it at once */
		}
	});

	/** the bubble's box now (it may have moved since the modal opened), else where it was */
	function bubbleRect() {
		const id = request?.id ?? '';
		const el = document.querySelector(`[data-node="${CSS.escape(id)}"], [data-para="${CSS.escape(id)}"]`);
		return el ? el.getBoundingClientRect() : (request?.from ?? null);
	}

	/** Shrink back into the bubble, then close */
	async function close() {
		if (closing || !dialogEl) return;
		closing = true;
		await tick();
		const to = dialogEl.getBoundingClientRect();
		const from = bubbleRect();
		const opts = { duration: DURATION, easing: EASE, fill: /** @type {FillMode} */ ('forwards') };
		const done = [
			dialogEl.animate(
				[{ transformOrigin: 'top left', transform: 'none' }, { transformOrigin: 'top left', transform: from ? flip(from, to) : 'scale(0.9)' }],
				opts
			).finished,
			bodyEl?.animate([{ opacity: 1 }, { opacity: 0, offset: 0.5 }, { opacity: 0 }], opts).finished
		];
		try {
			dialogEl.animate([{ opacity: 1 }, { opacity: 0 }], { ...opts, pseudoElement: '::backdrop' });
		} catch {
			/* see above */
		}
		await Promise.allSettled(done);
		dialogEl.close();
	}

	/** @param {Event} e */
	function onCancel(e) {
		e.preventDefault(); // Escape: play the closing animation instead
		close();
	}

	/** @param {MouseEvent} e */
	function onBackdrop(e) {
		if (e.target === dialogEl) close();
	}

	function onClosed() {
		for (const a of dialogEl?.getAnimations() ?? []) a.cancel();
		for (const a of bodyEl?.getAnimations() ?? []) a.cancel();
		request = null;
	}

	const FIELDS = /** @type {const} */ ({
		originalIndex: 'Original index',
		paragraphIndex: 'Paragraph index',
		sectionIndex: 'Section index',
		hierarchicalIndex: 'Hierarchical index'
	});
	const shown = $derived(
		/** @type {('originalIndex' | 'paragraphIndex' | 'sectionIndex' | 'hierarchicalIndex')[]} */ (
			request?.kind === 'section'
				? ['originalIndex', 'sectionIndex', 'hierarchicalIndex']
				: ['originalIndex', 'paragraphIndex', 'sectionIndex', 'hierarchicalIndex']
		)
	);

	/**
	 * Apply an edited index: find the position that gives it that value and move the
	 * draft there (every other index then follows); otherwise put the old value back.
	 * @param {'originalIndex' | 'paragraphIndex' | 'sectionIndex' | 'hierarchicalIndex'} field
	 * @param {HTMLInputElement} input
	 */
	function commit(field, input) {
		if (!request) return;
		const next = findPosition(list, request.id, field, input.value, pos);
		if (next === null) {
			errors = { ...errors, [field]: 'No such position' };
			input.value = String(preview?.[field] ?? '');
			return;
		}
		errors = {};
		pos = next;
		input.value = String(indexInfoAt(next)?.[field] ?? '');
	}

	/** @param {number} p */
	function indexInfoAt(p) {
		return request ? indexInfo(moveItem(list, request.id, p), request.id) : null;
	}

	function save() {
		if (!request) return;
		onsave({ id: request.id, title: request.kind === 'section' ? title : null, position: pos });
		close();
	}

	const titleChanged = $derived(request?.kind === 'section' && title.trim() !== (current?.title ?? '') && title.trim() !== '');
	const dirty = $derived(titleChanged || pos !== (current?.originalIndex ?? 0));
</script>

<!-- svelte-ignore a11y_click_events_have_key_events, a11y_no_noninteractive_element_interactions -->
<dialog
	bind:this={dialogEl}
	onclick={onBackdrop}
	oncancel={onCancel}
	onclose={onClosed}
	class="m-auto w-[min(92vw,34rem)] overflow-hidden rounded-lg border border-taupe2 bg-taupe1 p-0 text-dark shadow-xl backdrop:bg-black/40"
>
	{#if request}
		<div bind:this={bodyEl}>
			<header class="flex items-center justify-between gap-4 border-b border-taupe2 px-4 py-3">
				<h2 class="min-w-0 truncate text-base font-semibold" title={heading}>{heading}</h2>
				<button
					type="button"
					onclick={close}
					aria-label="Close"
					title="Close"
					class="inline-flex shrink-0 items-center justify-center rounded-md p-1 text-dark hover:bg-taupe2"
				>
					<X />
				</button>
			</header>

			<div class="flex flex-col gap-4 p-4">
				{#if request.kind === 'section'}
					<label class="flex flex-col gap-1 text-sm font-medium">
						Title
						<input
							type="text"
							bind:value={title}
							class="rounded-md border border-taupe2 bg-white/60 px-2 py-1.5 font-normal text-dark outline-none focus:border-grey2"
						/>
					</label>
				{/if}

				<fieldset class="flex flex-col gap-2">
					<legend class="mb-1 text-sm font-medium">
						Position
						<span class="font-normal text-grey3">— these are linked: change one and the rest follow</span>
					</legend>
					<div class="grid grid-cols-2 gap-3">
						{#each shown as field (field)}
							<label class="flex flex-col gap-1 text-xs text-grey3">
								{FIELDS[field]}{request.kind === 'paragraph' && (field === 'sectionIndex' || field === 'hierarchicalIndex')
									? ' (of its section)'
									: ''}
								<input
									type="text"
									inputmode={field === 'hierarchicalIndex' ? 'decimal' : 'numeric'}
									value={preview?.[field] ?? ''}
									onchange={(e) => commit(field, e.currentTarget)}
									onkeydown={(e) => e.key === 'Enter' && e.currentTarget.blur()}
									aria-invalid={errors[field] ? 'true' : undefined}
									class="rounded-md border bg-white/60 px-2 py-1.5 text-sm text-dark outline-none focus:border-grey2 {errors[field] ? 'border-red' : 'border-taupe2'}"
								/>
								{#if errors[field]}<span class="text-red">{errors[field]}</span>{/if}
							</label>
						{/each}
					</div>
				</fieldset>

				<div class="flex justify-end">
					<button
						type="button"
						onclick={save}
						disabled={!dirty}
						class="rounded-md bg-dark px-3 py-1.5 text-sm font-medium text-taupe1 hover:bg-lessdark disabled:cursor-not-allowed disabled:opacity-40"
					>
						Save
					</button>
				</div>
			</div>
		</div>
	{/if}
</dialog>
