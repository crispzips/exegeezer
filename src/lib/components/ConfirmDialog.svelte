<script>
	/**
	 * A modal asking the user to confirm a destructive action. Open it by setting
	 * `request` to an object (title, message, confirm label); it closes, and `request`
	 * is cleared, when the user confirms or cancels (button, Escape or backdrop click).
	 *
	 * @type {{
	 *   request: { title: string, message: string, confirm: string, run: () => void } | null,
	 * }}
	 */
	let { request = $bindable(null) } = $props();

	/** @type {HTMLDialogElement | undefined} */
	let dialogEl = $state();

	$effect(() => {
		if (request && dialogEl && !dialogEl.open) dialogEl.showModal();
	});

	function confirm() {
		const run = request?.run;
		dialogEl?.close();
		run?.();
	}

	/** @param {MouseEvent} e */
	function onBackdrop(e) {
		if (e.target === dialogEl) dialogEl?.close();
	}
</script>

<!-- svelte-ignore a11y_click_events_have_key_events, a11y_no_noninteractive_element_interactions -->
<dialog
	bind:this={dialogEl}
	onclick={onBackdrop}
	onclose={() => (request = null)}
	class="m-auto w-[min(92vw,28rem)] rounded-lg border border-taupe2 bg-taupe1 p-5 text-dark backdrop:bg-black/40"
>
	{#if request}
		<h2 class="text-base font-semibold">{request.title}</h2>
		<p class="mt-2 text-sm whitespace-pre-line">{request.message}</p>
		<div class="mt-4 flex justify-end gap-2">
			<button type="button" onclick={() => dialogEl?.close()} class="rounded-md px-3 py-1.5 text-sm hover:bg-taupe2">
				Cancel
			</button>
			<button
				type="button"
				onclick={confirm}
				class="rounded-md bg-red px-3 py-1.5 text-sm font-medium text-white hover:bg-red/90"
			>
				{request.confirm}
			</button>
		</div>
	{/if}
</dialog>
