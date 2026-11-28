<script>
	/**
	 * A text's head (its metadata), which anyone who may read the text may read, whatever has become of its words.
	 * Open it by setting `request` to `{ id }`.
	 *
	 * @type {{ request: { id: string } | null }}
	 */
	let { request = $bindable(null) } = $props();

	/** @type {HTMLDialogElement | undefined} */
	let dialogEl = $state();
	/** @type {any} */
	let head = $state(null);
	let message = $state('');

	/** the labelled fields of an imported-details entry, in reading order */
	const DETAIL_LABELS = /** @type {[string, string][]} */ ([
		['title', 'Title'],
		['author', 'Author'],
		['published', 'Published'],
		['publisher', 'Publisher'],
		['citation', 'Citation'],
		['identifier', 'Identifier'],
		['language', 'Language'],
		['license', 'License'],
		['rights', 'Rights'],
		['importedAt', 'Imported']
	]);
	const fmt = (/** @type {string} */ iso) => new Date(iso).toLocaleString(undefined, { dateStyle: 'long', timeStyle: 'short' });
	const day = (/** @type {string} */ iso) => new Date(iso).toLocaleDateString(undefined, { dateStyle: 'long' });

	$effect(() => {
		if (!request || !dialogEl || dialogEl.open) return;
		head = null;
		message = '';
		dialogEl.showModal();
		load(request.id);
	});

	/** @param {string} id */
	async function load(id) {
		try {
			const res = await fetch(`/api/texts/${id}/head`);
			if (!res.ok) throw new Error(`${res.status}`);
			head = await res.json();
		} catch {
			message = 'Could not load the text’s details.';
		}
	}
</script>

<!-- eslint-disable svelte/no-navigation-without-resolve -- the source link leaves the app for an outside site -->
<dialog
	bind:this={dialogEl}
	onclick={(e) => { if (e.target === dialogEl) dialogEl?.close(); }}
	onclose={() => (request = null)}
	class="m-auto w-[min(92vw,28rem)] rounded-lg border border-taupe2 bg-taupe1 p-5 text-dark backdrop:bg-black/40"
>
	{#if request}
		<div class="flex flex-col gap-2 text-sm">
			<h2 class="text-base font-semibold">{head?.title ?? 'About this text'}</h2>
			{#if head}
				{#if head.productionStatus === 'recanted'}<p class="text-grey3">Recanted: its words are hidden from the public.</p>{/if}
				{#if head.productionStatus === 'burned'}<p class="text-grey3">Burned: its words are gone for good.</p>{/if}
				{#if head.description}<p class="whitespace-pre-line">{head.description}</p>{/if}
				<dl class="grid grid-cols-[8rem_minmax(0,1fr)] gap-x-2 gap-y-1">
					<dt class="text-grey3">Authors</dt><dd>{head.authors.join(', ') || 'None'}</dd>
					{#if head.editors.length}<dt class="text-grey3">Editors</dt><dd>{head.editors.join(', ')}</dd>{/if}
					{#if head.renunciations.length}
						<dt class="text-grey3">Renunciations</dt>
						<dd>
							{#each head.renunciations as r, i (i)}
								<p>{r.name} renounced it{r.extreme ? ' with extreme prejudice' : ''}, {day(r.on)}</p>
							{/each}
						</dd>
					{/if}
					<dt class="text-grey3">Status</dt><dd>{head.productionStatus} · {head.visibility}</dd>
					<dt class="text-grey3">Type</dt><dd>{head.type === 'commentary' ? 'Commentary' : 'Original text'}</dd>
					{#if head.commentaryOn}<dt class="text-grey3">On</dt><dd><a href="/exejeeze?text={head.commentaryOn.id}" onclick={() => dialogEl?.close()} class="underline">{head.commentaryOn.title}</a></dd>{/if}
					{#if head.tags.length}<dt class="text-grey3">Tags</dt><dd>{head.tags.join(', ')}</dd>{/if}
					<dt class="text-grey3">Created</dt><dd>{fmt(head.createdAt)}</dd>
					<dt class="text-grey3">Last changed</dt><dd>{fmt(head.updatedAt)}</dd>
				</dl>
				{#each head.credits as c, i (i)}
					{#if c.attribution}<p class="text-xs text-grey3">{c.attribution}{#if c.licenseUrl}{' '}<a href={c.licenseUrl} target="_blank" rel="noopener noreferrer" class="underline">Licence</a>{/if}</p>{/if}
				{/each}
				{#if head.importedDetails.length}
					<!-- where imported text came from, and its rights -->
					<details class="rounded-md border border-taupe2 p-2">
						<summary class="cursor-pointer font-medium">Imported details ({head.importedDetails.length})</summary>
						{#each head.importedDetails as entry, i (i)}
							<dl class="mt-2 grid grid-cols-[6rem_minmax(0,1fr)] gap-x-2 gap-y-0.5 text-xs">
								{#each DETAIL_LABELS as [key, label] (key)}
									{#if entry[key]}<dt class="text-grey3">{label}</dt><dd class="break-words">{entry[key]}</dd>{/if}
								{/each}
								{#if entry.source}
									<dt class="text-grey3">Source</dt>
									<dd class="break-words">
										{#if entry.sourceUrl}<a href={entry.sourceUrl} target="_blank" rel="noopener noreferrer" class="underline">{entry.source}</a>{:else}{entry.source}{/if}
									</dd>
								{/if}
							</dl>
						{/each}
					</details>
				{/if}
			{:else if !message}
				<p class="text-grey3">Loading…</p>
			{/if}
			{#if message}<p role="alert" class="text-red">{message}</p>{/if}
			<div class="mt-2 flex justify-end">
				<button type="button" onclick={() => dialogEl?.close()} class="rounded-md px-3 py-1.5 hover:bg-taupe2">Close</button>
			</div>
		</div>
	{/if}
</dialog>
