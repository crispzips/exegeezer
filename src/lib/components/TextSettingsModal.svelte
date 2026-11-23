<script>
	import MultiSelect from '#lib/components/MultiSelect.svelte';
	import { COMMENT_POLICIES, COMMENT_POLICY_LABELS, PRODUCTION_STATUSES, VISIBILITIES, LOCKED_MESSAGE, isPublicized } from '#lib/textStatus.js';

	/**
	 * A modal for editing a whole text's properties (title, author, production status,
	 * visibility; type and dates are shown). Open it by setting `request` to `{ id }`;
	 * `onsaved({ title, authors, publicized })` is called after a successful save.
	 *
	 * @type {{ request: { id: string } | null, onsaved?: (saved: { title: string, authors: string[], publicized: boolean }) => void }}
	 */
	let { request = $bindable(null), onsaved } = $props();

	/** @type {HTMLDialogElement | undefined} */
	let dialogEl = $state();
	/** @type {any} */
	let info = $state(null);
	let draft = $state({ title: '', personaIds: /** @type {string[]} */ ([]), productionStatus: '', visibility: '', commentPolicy: '' });
	let message = $state('');
	let busy = $state(false);

	const typeLabel = /** @type {Record<string, string>} */ ({ original: 'Original text', commentary: 'Commentary' });
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

	$effect(() => {
		if (!request || !dialogEl || dialogEl.open) return;
		info = null;
		message = '';
		dialogEl.showModal();
		load(request.id);
	});

	/** @param {string} id */
	async function load(id) {
		try {
			const res = await fetch(`/api/texts/${id}/properties`);
			if (!res.ok) throw new Error(`${res.status}`);
			info = await res.json();
			draft = { title: info.title, personaIds: [...info.personaIds], productionStatus: info.productionStatus, visibility: info.visibility, commentPolicy: info.commentPolicy };
		} catch {
			message = 'Could not load the text’s settings.';
		}
	}

	async function save() {
		if (!info || busy) return;
		if (!draft.title.trim()) return void (message = 'Enter a title.');
		if (!draft.personaIds.length) return void (message = 'Choose at least one author.');
		busy = true;
		message = '';
		try {
			const res = await fetch(`/api/texts/${info.id}/properties`, { method: 'PATCH', headers: { 'content-type': 'application/json' }, body: JSON.stringify(draft) });
			if (!res.ok) {
				message = (await res.json().catch(() => null))?.message ?? 'Could not save.';
				return;
			}
			const names = draft.personaIds.map((/** @type {string} */ id) => info.authorChoices.find((/** @type {{ id: string }} */ c) => c.id === id)?.name).filter(Boolean);
			onsaved?.({ title: draft.title.trim().slice(0, 200), authors: names, publicized: isPublicized(draft) });
			dialogEl?.close();
		} finally {
			busy = false;
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
		<form onsubmit={(e) => { e.preventDefault(); save(); }} class="flex flex-col gap-2 text-sm">
			<h2 class="text-base font-semibold">Text settings</h2>
			{#if info?.publicized}<p class="text-xs text-grey3">{LOCKED_MESSAGE} Only who may comment can still be changed.</p>{/if}
			{#if info}
				<label class="grid grid-cols-[8rem_minmax(0,1fr)] items-center gap-2">
					<span class="text-grey3">Title</span>
					<input bind:value={draft.title} maxlength="200" disabled={info.publicized} class="rounded-md px-2 py-1" />
				</label>
				<div class="grid grid-cols-[8rem_minmax(0,1fr)] items-center gap-2">
					<span class="text-grey3">Authors</span>
					<MultiSelect label="Authors" placeholder="Choose authors" options={info.authorChoices.map((/** @type {{ id: string, name: string }} */ c) => ({ value: c.id, label: c.name }))} bind:value={draft.personaIds} disabled={info.publicized} />
				</div>
				<label class="grid grid-cols-[8rem_minmax(0,1fr)] items-center gap-2">
					<span class="text-grey3">Production status</span>
					<select bind:value={draft.productionStatus} disabled={info.publicized} class="rounded-md px-2 py-1">
						{#each PRODUCTION_STATUSES as v (v)}<option value={v}>{v}</option>{/each}
					</select>
				</label>
				<label class="grid grid-cols-[8rem_minmax(0,1fr)] items-center gap-2">
					<span class="text-grey3">Visibility</span>
					<select bind:value={draft.visibility} disabled={info.publicized} class="rounded-md px-2 py-1">
						{#each VISIBILITIES as v (v)}<option value={v}>{v}</option>{/each}
					</select>
				</label>
				<label class="grid grid-cols-[8rem_minmax(0,1fr)] items-center gap-2">
					<span class="text-grey3">Commenting</span>
					<select bind:value={draft.commentPolicy} class="rounded-md px-2 py-1">
						{#each COMMENT_POLICIES as v (v)}<option value={v}>{COMMENT_POLICY_LABELS[v]}</option>{/each}
					</select>
				</label>
				<dl class="grid grid-cols-[8rem_minmax(0,1fr)] gap-x-2 gap-y-1">
					<dt class="text-grey3">Type</dt><dd>{typeLabel[info.type] ?? info.type}</dd>
					<dt class="text-grey3">Created</dt><dd>{fmt(info.createdAt)}</dd>
					<dt class="text-grey3">Last changed</dt><dd>{fmt(info.updatedAt)}</dd>
				</dl>
				{#if info.importedDetails?.length}
					<!-- where imported text came from, and its rights (read-only) -->
					<details class="rounded-md border border-taupe2 p-2">
						<summary class="cursor-pointer font-medium">Imported details ({info.importedDetails.length})</summary>
						{#each info.importedDetails as entry, i (i)}
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
			<div class="mt-2 flex justify-end gap-2">
				<button type="button" onclick={() => dialogEl?.close()} class="rounded-md px-3 py-1.5 hover:bg-taupe2">Cancel</button>
				<button disabled={!info || busy} class="rounded-md bg-violet px-3 py-1.5 font-medium text-white hover:bg-violet/90 disabled:cursor-not-allowed disabled:opacity-50">Save</button>
			</div>
		</form>
	{/if}
</dialog>
