<script>
	import { Grid, ListUl } from '@boxicons/svelte';
	import TextsBrowser from '#lib/components/TextsBrowser.svelte';

	/**
	 * Lists the user's own texts, as a list or as icons, for importing one. Open it by
	 * setting `open` to true. Choosing a text loads it and calls
	 * `onchoose({ id, title, items })`, then closes.
	 *
	 * @type {{ open: boolean, onchoose?: (t: { id: string, title: string, items: any[] }) => void }}
	 */
	let { open = $bindable(false), onchoose } = $props();

	/** @type {HTMLDialogElement | undefined} */
	let dialogEl = $state();
	/** @type {'list' | 'icons'} */
	let view = $state('list');
	/** @type {any[] | null} */
	let texts = $state(null);
	let message = $state('');

	$effect(() => {
		if (open && dialogEl && !dialogEl.open) {
			dialogEl.showModal();
			load();
		}
	});

	async function load() {
		texts = null;
		message = '';
		try {
			const res = await fetch('/api/texts');
			if (!res.ok) throw new Error(`${res.status}`);
			texts = await res.json();
		} catch {
			texts = [];
			message = 'Could not load your texts.';
		}
	}

	/** @param {{ id: string }} t */
	async function choose(t) {
		message = '';
		try {
			const res = await fetch(`/api/texts/${t.id}`);
			if (!res.ok) throw new Error(`${res.status}`);
			const loaded = await res.json();
			dialogEl?.close();
			onchoose?.(loaded);
		} catch {
			message = 'Could not load that text.';
		}
	}
</script>

<dialog
	bind:this={dialogEl}
	onclose={() => (open = false)}
	onclick={(e) => e.target === dialogEl && dialogEl?.close()}
	class="m-auto h-[70vh] w-[min(92vw,48rem)] overflow-hidden rounded-lg border border-taupe2 bg-taupe1 p-4 text-dark backdrop:bg-black/40 open:flex open:flex-col"
>
	<div class="flex shrink-0 items-center justify-between gap-2">
		<h2 class="text-base font-semibold">Import from your texts</h2>
		<div class="flex items-center gap-1">
			<div class="flex gap-1" role="group" aria-label="View">
				<button onclick={() => (view = 'list')} aria-label="List view" aria-pressed={view === 'list'} title="List view" class="rounded-md p-1 {view === 'list' ? 'bg-taupe2' : 'hover:bg-taupe2'}"><ListUl width={18} height={18} /></button>
				<button onclick={() => (view = 'icons')} aria-label="Icon view" aria-pressed={view === 'icons'} title="Icon view" class="rounded-md p-1 {view === 'icons' ? 'bg-taupe2' : 'hover:bg-taupe2'}"><Grid width={18} height={18} /></button>
			</div>
			<button onclick={() => dialogEl?.close()} aria-label="Close" class="ml-2 rounded-md px-2 py-1 text-lg leading-none hover:bg-taupe2">×</button>
		</div>
	</div>
	<div class="mt-3 min-h-0 flex-1 overflow-y-auto">
		{#if texts === null}
			<p class="text-sm text-grey3">Loading…</p>
		{:else if texts.length}
			<TextsBrowser {texts} {view} onselect={choose} />
		{:else}
			<p class="text-sm text-grey3">{message || 'You have no texts yet.'}</p>
		{/if}
	</div>
	{#if message && texts?.length}<p class="mt-2 shrink-0 text-sm text-red-700">{message}</p>{/if}
</dialog>
