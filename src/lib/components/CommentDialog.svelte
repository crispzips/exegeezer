<script>
	/**
	 * A box for leaving a comment on a paragraph. Open it by setting `request` to `{ excerpt, run }`;
	 * `run(body)` is called on Post and may throw (or return a message) to keep the box open with the problem shown.
	 *
	 * @type {{ request: { excerpt: string, run: (body: string) => Promise<string | void> } | null }}
	 */
	let { request = $bindable(null) } = $props();

	/** @type {HTMLDialogElement | undefined} */
	let dialogEl = $state();
	let body = $state('');
	let message = $state('');
	let busy = $state(false);

	$effect(() => {
		if (!request || !dialogEl || dialogEl.open) return;
		body = '';
		message = '';
		dialogEl.showModal();
	});

	async function post() {
		if (!request || busy || !body.trim()) return;
		busy = true;
		message = '';
		try {
			const problem = await request.run(body.trim());
			if (problem) message = problem;
			else dialogEl?.close();
		} catch {
			message = 'Could not post the comment.';
		} finally {
			busy = false;
		}
	}
</script>

<dialog
	bind:this={dialogEl}
	onclick={(e) => { if (e.target === dialogEl) dialogEl?.close(); }}
	onclose={() => (request = null)}
	class="m-auto w-[min(92vw,30rem)] rounded-lg border border-taupe2 bg-taupe1 p-5 text-dark backdrop:bg-black/40"
>
	{#if request}
		<form onsubmit={(e) => { e.preventDefault(); post(); }} class="flex flex-col gap-2 text-sm">
			<h2 class="text-base font-semibold">Comment on this paragraph</h2>
			<blockquote class="line-clamp-3 border-l-4 border-taupe3 pl-2 text-grey3">{request.excerpt}</blockquote>
			<!-- svelte-ignore a11y_autofocus -->
			<textarea bind:value={body} rows="5" autofocus aria-label="Your comment" class="rounded-md px-2 py-1"></textarea>
			{#if message}<p role="alert" class="text-red">{message}</p>{/if}
			<div class="mt-2 flex justify-end gap-2">
				<button type="button" onclick={() => dialogEl?.close()} class="rounded-md px-3 py-1.5 hover:bg-taupe2">Cancel</button>
				<button disabled={busy || !body.trim()} class="rounded-md bg-accent px-3 py-1.5 font-medium text-on-accent hover:bg-accent/90 disabled:cursor-not-allowed disabled:opacity-50">Post</button>
			</div>
		</form>
	{/if}
</dialog>
