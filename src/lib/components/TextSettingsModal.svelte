<script>
	import MultiSelect from '#lib/components/MultiSelect.svelte';
	import { PRODUCTION_STATUSES, VISIBILITIES } from '#lib/textStatus.js';

	/**
	 * A modal for editing a whole text's properties (title, author, production status,
	 * visibility; type and dates are shown). Open it by setting `request` to `{ id }`;
	 * `onsaved({ title, authors })` is called after a successful save.
	 *
	 * @type {{ request: { id: string } | null, onsaved?: (saved: { title: string, authors: string[] }) => void }}
	 */
	let { request = $bindable(null), onsaved } = $props();

	/** @type {HTMLDialogElement | undefined} */
	let dialogEl = $state();
	/** @type {any} */
	let info = $state(null);
	let draft = $state({ title: '', personaIds: /** @type {string[]} */ ([]), productionStatus: '', visibility: '' });
	let message = $state('');
	let busy = $state(false);

	const typeLabel = /** @type {Record<string, string>} */ ({ original: 'Original text', commentary: 'Commentary' });
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
			draft = { title: info.title, personaIds: [...info.personaIds], productionStatus: info.productionStatus, visibility: info.visibility };
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
			onsaved?.({ title: draft.title.trim().slice(0, 200), authors: names });
			dialogEl?.close();
		} finally {
			busy = false;
		}
	}
</script>

<dialog
	bind:this={dialogEl}
	onclick={(e) => { if (e.target === dialogEl) dialogEl?.close(); }}
	onclose={() => (request = null)}
	class="m-auto w-[min(92vw,28rem)] rounded-lg border border-taupe2 bg-taupe1 p-5 text-dark backdrop:bg-black/40"
>
	{#if request}
		<form onsubmit={(e) => { e.preventDefault(); save(); }} class="flex flex-col gap-2 text-sm">
			<h2 class="text-base font-semibold">Text settings</h2>
			{#if info}
				<label class="grid grid-cols-[8rem_minmax(0,1fr)] items-center gap-2">
					<span class="text-grey3">Title</span>
					<input bind:value={draft.title} maxlength="200" class="rounded-md px-2 py-1" />
				</label>
				<div class="grid grid-cols-[8rem_minmax(0,1fr)] items-center gap-2" title={info.publicized ? "The authors of a published, public text can't be changed" : ''}>
					<span class="text-grey3">Authors</span>
					<MultiSelect label="Authors" placeholder="Choose authors" options={info.authorChoices.map((/** @type {{ id: string, name: string }} */ c) => ({ value: c.id, label: c.name }))} bind:value={draft.personaIds} disabled={info.publicized} />
				</div>
				<label class="grid grid-cols-[8rem_minmax(0,1fr)] items-center gap-2">
					<span class="text-grey3">Production status</span>
					<select bind:value={draft.productionStatus} class="rounded-md px-2 py-1">
						{#each PRODUCTION_STATUSES as v (v)}<option value={v}>{v}</option>{/each}
					</select>
				</label>
				<label class="grid grid-cols-[8rem_minmax(0,1fr)] items-center gap-2">
					<span class="text-grey3">Visibility</span>
					<select bind:value={draft.visibility} class="rounded-md px-2 py-1">
						{#each VISIBILITIES as v (v)}<option value={v}>{v}</option>{/each}
					</select>
				</label>
				<dl class="grid grid-cols-[8rem_minmax(0,1fr)] gap-x-2 gap-y-1">
					<dt class="text-grey3">Type</dt><dd>{typeLabel[info.type] ?? info.type}</dd>
					<dt class="text-grey3">Created</dt><dd>{fmt(info.createdAt)}</dd>
					<dt class="text-grey3">Last changed</dt><dd>{fmt(info.updatedAt)}</dd>
				</dl>
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
