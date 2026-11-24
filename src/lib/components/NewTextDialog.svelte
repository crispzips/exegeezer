<script>
	/**
	 * Asks for a new text's name and visibility before it is first saved. Open it by
	 * setting `request` to `{ title, run }`; `run({ title, visibility })` is called on
	 * Create. Visibility has no default: the user must choose.
	 *
	 * @type {{ request: { title: string, run: (v: { title: string, visibility: string }) => void } | null }}
	 */
	let { request = $bindable(null) } = $props();

	/** @type {HTMLDialogElement | undefined} */
	let dialogEl = $state();
	let title = $state('');
	let visibility = $state('');

	$effect(() => {
		if (request && dialogEl && !dialogEl.open) {
			title = request.title === 'Untitled' ? '' : request.title;
			visibility = '';
			dialogEl.showModal();
		}
	});

	const ready = $derived(title.trim() !== '' && visibility !== '');

	function create() {
		if (!ready) return;
		const run = request?.run;
		const v = { title: title.trim().slice(0, 200), visibility };
		dialogEl?.close();
		run?.(v);
	}
</script>

<dialog
	bind:this={dialogEl}
	onclose={() => (request = null)}
	class="m-auto w-[min(92vw,28rem)] rounded-lg border border-taupe2 bg-taupe1 p-5 text-dark backdrop:bg-black/40"
>
	{#if request}
		<form onsubmit={(e) => { e.preventDefault(); create(); }}>
			<h2 class="text-base font-semibold">New text</h2>
			<label class="mt-3 flex flex-col gap-1 text-sm">
				<span class="font-medium">Name</span>
				<!-- svelte-ignore a11y_autofocus -->
				<input autofocus bind:value={title} maxlength="200" class="rounded-md px-2 py-1" />
			</label>
			<fieldset class="mt-3 text-sm">
				<legend class="font-medium">Visibility</legend>
				<label class="mt-1 flex items-center gap-2"><input type="radio" bind:group={visibility} value="private" class="accent-accent" /> Private <span class="text-xs text-grey3">only you can see it</span></label>
				<label class="mt-1 flex items-center gap-2"><input type="radio" bind:group={visibility} value="public" class="accent-accent" /> Public <span class="text-xs text-grey3">anyone can see it</span></label>
			</fieldset>
			<p class="mt-3 text-xs text-grey3">It starts as a draft.</p>
			<div class="mt-4 flex justify-end gap-2">
				<button type="button" onclick={() => dialogEl?.close()} class="rounded-md px-3 py-1.5 text-sm hover:bg-taupe2">Cancel</button>
				<button disabled={!ready} class="rounded-md bg-accent px-3 py-1.5 text-sm font-medium text-on-accent hover:bg-accent/90 disabled:cursor-not-allowed disabled:opacity-50">Create</button>
			</div>
		</form>
	{/if}
</dialog>
