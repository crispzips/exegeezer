<script>
	import { ArrowUpRightSquare } from '@boxicons/svelte';
	import RainLoader from './RainLoader.svelte';
	import { combineTexts } from '#lib/utilities/combineTexts.js';

	/** the most texts one batch may string together */
	const BATCH_LIMIT = 40;

	/**
	 * Find and import texts from open-access libraries. Open it by setting `open` to true.
	 * Any number of sources can be ticked to search at once; each result says which source it is from.
	 * Choosing a result downloads the text (through the server) and calls
	 * `onchoose({ title, markdown, details, notes })`, then closes (`details`: one entry of rights and publication information per text).
	 * Results can also be ticked: the ticked texts (numbered in the order they were ticked, across searches and
	 * sources) are downloaded one after another and strung together as the sections of one text.
	 * Below the search is a catalog of other places that do not welcome automated access:
	 * each one is only described and linked to its own instructions.
	 *
	 * @type {{ open: boolean, onchoose?: (t: { title: string, markdown: string, details: Record<string, string>[], notes: string[] }) => void }}
	 */
	let { open = $bindable(false), onchoose } = $props();

	/** @type {HTMLDialogElement | undefined} */
	let dialogEl = $state();
	/** @type {any[] | null} */
	let sources = $state(null);
	/** @type {any[]} */
	let human = $state([]);
	/** the ids of the sources being searched */
	/** @type {string[]} */
	let chosen = $state([]);
	/** show only the sources whose texts come with real sections (headings), not just paragraphs */
	let structuredOnly = $state(false);
	/** leave out single chapters and parts of a work (for sources that list them) */
	let wholeOnly = $state(false);
	/** the ticked texts, in the order they were ticked */
	/** @type {{ source: string, sourceName: string, id: string, title: string }[]} */
	let picked = $state([]);
	/** progress of a batch import: how many are done, or null when none is running */
	/** @type {number | null} */
	let batchDone = $state(null);
	let query = $state('');
	/** @type {{ source: string, sourceName: string, id: string, title: string, author: string | null, detail: string, url: string, tooBig?: boolean }[] | null} */
	let results = $state(null);
	let searching = $state(false);
	/** the id of the result being downloaded */
	let importing = $state('');
	let message = $state('');
	/** a search answer that is guidance, not a failure (the source has nothing at that address): shown calmly, not in red */
	let notice = $state('');

	/** a download is under way, so the dialog is locked */
	const busy = $derived(!!importing || batchDone !== null);
	const shown = $derived(sources?.filter((s) => !structuredOnly || s.structured) ?? []);
	const pickedIndex = $derived(new Map(picked.map((p, i) => [`${p.source}\u0000${p.id}`, i])));
	/** the sources a search goes to: ticked, shown, and switched on */
	const active = $derived(shown.filter((s) => s.available && chosen.includes(s.id)));
	const unavailable = $derived(shown.filter((s) => !s.available));

	/** After the "structured only" filter changes: ticked sources it hides are dropped; if none is left, the first one shown is ticked. */
	function refit() {
		chosen = chosen.filter((id) => shown.some((s) => s.id === id));
		if (!chosen.length) chosen = shown.filter((s) => s.available).slice(0, 1).map((s) => s.id);
		results = null;
		message = '';
		notice = '';
	}

	$effect(() => {
		if (open && dialogEl && !dialogEl.open) {
			dialogEl.showModal();
			if (!sources) loadSources();
		}
	});

	async function loadSources() {
		message = '';
		notice = '';
		try {
			const res = await fetch('/api/sources');
			if (!res.ok) throw new Error(`${res.status}`);
			const data = await res.json();
			sources = data.open;
			human = data.human;
			chosen = sources?.filter((s) => s.available).slice(0, 1).map((s) => s.id) ?? [];
		} catch {
			sources = [];
			message = 'Could not load the list of sources.';
		}
	}

	/** Tick or untick a source (one always stays ticked). @param {string} id */
	function toggleSource(id) {
		if (chosen.includes(id)) {
			if (chosen.length > 1) chosen = chosen.filter((c) => c !== id);
		} else chosen = [...chosen, id];
		results = null;
		message = '';
		notice = '';
	}

	function chooseAll() {
		chosen = shown.filter((s) => s.available).map((s) => s.id);
		results = null;
		message = '';
		notice = '';
	}

	/** @param {Response} res */
	async function failure(res) {
		const body = await res.json().catch(() => null);
		return body?.message ?? `Something went wrong (${res.status}).`;
	}

	/** @param {SubmitEvent} e */
	async function search(e) {
		e.preventDefault();
		if (!active.length || !query.trim() || searching) return;
		searching = true;
		message = '';
		notice = '';
		results = null;
		const q = encodeURIComponent(query.trim());
		const answers = await Promise.all(
			active.map(async (src) => {
				try {
					const res = await fetch(`/api/sources/${src.id}/search?q=${q}${wholeOnly ? '&whole=1' : ''}`);
					if (!res.ok) return { src, error: await failure(res), soft: res.status === 404, list: [] };
					const list = (await res.json()).results.map((/** @type {any} */ r) => ({ ...r, source: src.id, sourceName: src.name }));
					return { src, error: '', list };
				} catch {
					return { src, error: 'Could not reach the server.', list: [] };
				}
			})
		);
		// one from each source in turn, so the best of every source is near the top
		/** @type {NonNullable<typeof results>} */
		const merged = [];
		for (let i = 0; answers.some((a) => i < a.list.length); i++) for (const a of answers) if (i < a.list.length) merged.push(a.list[i]);
		results = merged;
		const word = (/** @type {{ src: { name: string }, error: string }} */ a) => `${a.src.name}: ${a.error}`;
		const failed = answers.filter((a) => a.error && !('soft' in a && a.soft)).map(word);
		notice = answers.filter((a) => a.error && 'soft' in a && a.soft).map(word).join(' ');
		message = failed.length ? failed.join(' ') : merged.length || notice ? '' : 'Nothing found. Try other words.';
		searching = false;
	}

	/** @param {{ source: string, sourceName: string, id: string, title: string }} r */
	function togglePick(r) {
		const key = `${r.source}\u0000${r.id}`;
		if (pickedIndex.has(key)) picked = picked.filter((p) => `${p.source}\u0000${p.id}` !== key);
		else if (picked.length < BATCH_LIMIT) picked = [...picked, { source: r.source, sourceName: r.sourceName, id: r.id, title: r.title }];
		else message = `A batch can hold up to ${BATCH_LIMIT} texts.`;
	}

	/** Download every ticked text, one after another, and hand them over as one text. */
	async function importPicked() {
		if (importing || batchDone !== null || !picked.length) return;
		message = '';
		notice = '';
		batchDone = 0;
		/** @type {{ title: string, markdown: string, details: Record<string, string>, notes: string[] }[]} */
		const texts = [];
		try {
			for (const p of picked) {
				const res = await fetch(`/api/sources/${p.source}/text?id=${encodeURIComponent(p.id)}`);
				if (!res.ok) return void (message = `${p.title}: ${await failure(res)} Nothing was imported; remove it from the selection to go on.`);
				texts.push(await res.json());
				batchDone = texts.length;
			}
			const whole = combineTexts(texts);
			const notes = [...new Set(texts.flatMap((t) => t.notes ?? []))];
			picked = [];
			dialogEl?.close();
			onchoose?.({ title: whole.title, markdown: whole.markdown, details: whole.details, notes });
		} catch {
			message = 'Could not reach the server.';
		} finally {
			batchDone = null;
		}
	}

	/** @param {{ source: string, id: string }} r */
	async function importText(r) {
		if (importing) return;
		importing = `${r.source}\u0000${r.id}`;
		message = '';
		notice = '';
		try {
			const res = await fetch(`/api/sources/${r.source}/text?id=${encodeURIComponent(r.id)}`);
			if (!res.ok) return void (message = await failure(res));
			const text = await res.json();
			dialogEl?.close();
			onchoose?.({ title: text.title, markdown: text.markdown, details: [text.details], notes: text.notes ?? [] });
		} catch {
			message = 'Could not reach the server.';
		} finally {
			importing = '';
		}
	}
</script>

<!-- eslint-disable svelte/no-navigation-without-resolve -- every link here leaves the app for an outside site -->
<dialog
	bind:this={dialogEl}
	onclose={() => (open = false)}
	oncancel={(e) => busy && e.preventDefault()}
	onclick={(e) => e.target === dialogEl && !busy && dialogEl?.close()}
	class="m-auto h-[80vh] w-[min(92vw,48rem)] overflow-hidden rounded-lg border border-taupe2 bg-taupe1 p-4 text-dark backdrop:bg-black/40 open:flex open:flex-col"
>
	<!-- while a text downloads (some take many seconds) nothing else can be done: inert blocks the mouse and the keyboard, and the dialog cannot be closed -->
	<div inert={busy} class="flex min-h-0 flex-1 flex-col">
	<div class="flex shrink-0 items-center justify-between gap-2">
		<h2 class="text-base font-semibold">Import from open libraries</h2>
		<button onclick={() => dialogEl?.close()} aria-label="Close" class="rounded-md px-2 py-1 text-lg leading-none hover:bg-taupe2">×</button>
	</div>

	{#if sources === null}
		<p class="mt-3 text-sm text-grey3">Loading…</p>
	{:else}
		<div class="mt-3 flex shrink-0 flex-wrap items-center gap-1" role="group" aria-label="Sources to search">
			{#each shown as s (s.id)}
				<button
					onclick={() => toggleSource(s.id)}
					disabled={!s.available}
					aria-pressed={chosen.includes(s.id)}
					class="rounded-md border px-3 py-1 text-sm {chosen.includes(s.id) && s.available ? 'border-violet bg-taupe2 font-medium' : 'border-transparent hover:bg-taupe2'} disabled:cursor-not-allowed disabled:opacity-50 disabled:hover:bg-transparent"
				>
					{s.name}
				</button>
			{/each}
			{#if shown.filter((s) => s.available).length > 1}
				<button onclick={chooseAll} class="rounded-md px-2 py-1 text-xs underline hover:bg-taupe2">All</button>
			{/if}
		</div>

		<div class="mt-2 flex shrink-0 flex-wrap gap-x-4 gap-y-1">
			<label class="flex items-center gap-1.5 text-xs">
				<input type="checkbox" bind:checked={structuredOnly} onchange={refit} />
				Structured texts only (with chapters and sections)
			</label>
			<label class="flex items-center gap-1.5 text-xs">
				<input type="checkbox" bind:checked={wholeOnly} />
				Full texts only (not single chapters or parts)
			</label>
		</div>

		{#each unavailable as u (u.id)}
			<p class="mt-2 shrink-0 text-xs text-red-700">{u.unavailableReason}</p>
		{/each}

		{#if active.length === 1}
			<p class="mt-2 shrink-0 text-xs text-grey3">
				{active[0].kind}. {active[0].description}
				<a href={active[0].homepage} target="_blank" rel="noopener noreferrer" class="underline">Visit</a>
				·
				<a href={active[0].docs} target="_blank" rel="noopener noreferrer" class="underline">How its access works</a>
			</p>
		{:else if active.length > 1}
			<p class="mt-2 shrink-0 text-xs text-grey3">Searching {active.length} sources at once: {active.map((a) => a.name).join(', ')}. Each result shows which one it is from.</p>
		{/if}
		{#if active.length}
			<form onsubmit={search} class="mt-3 flex shrink-0 gap-2">
				<input type="search" bind:value={query} placeholder={active.length === 1 ? active[0].searchHint : 'Title, author or topic'} aria-label="Search {active.map((a) => a.name).join(', ')}" class="min-w-0 flex-1 rounded-md px-2 py-1 text-sm" />
				<button disabled={searching || !query.trim()} class="rounded-md bg-violet px-3 py-1 text-xs font-medium text-white hover:bg-violet/90 disabled:cursor-not-allowed disabled:opacity-50">
					{searching ? 'Searching…' : 'Search'}
				</button>
			</form>
		{/if}
	{/if}

	{#if picked.length}
		<div class="mt-3 shrink-0 rounded-md border border-taupe2 p-2">
			<div class="flex items-center justify-between gap-2">
				<span class="text-xs font-medium">{picked.length} selected, to be strung together in this order</span>
				<span class="flex gap-2">
					<button onclick={() => (picked = [])} disabled={batchDone !== null} class="rounded-md px-2 py-1 text-xs hover:bg-taupe2 disabled:opacity-50">Clear</button>
					<button onclick={importPicked} disabled={batchDone !== null || !!importing} class="rounded-md bg-violet px-3 py-1 text-xs font-medium text-white hover:bg-violet/90 disabled:cursor-not-allowed disabled:opacity-50">
						{batchDone === null ? `Import ${picked.length} as one text` : `Importing ${Math.min(batchDone + 1, picked.length)} of ${picked.length}…`}
					</button>
				</span>
			</div>
			<ol class="mt-1 max-h-24 list-inside list-decimal overflow-y-auto text-xs text-grey3">
				{#each picked as p (`${p.source}\u0000${p.id}`)}
					<li>
						{p.title}
						<span class="opacity-70">({p.sourceName})</span>
						<button onclick={() => (picked = picked.filter((q) => q !== p))} disabled={batchDone !== null} aria-label="Remove {p.title} from the selection" class="rounded px-1 hover:bg-taupe2">×</button>
					</li>
				{/each}
			</ol>
		</div>
	{/if}

	<!-- outside the scrolling list, so a failure is seen even when the results are scrolled down -->
	{#if notice}<p class="mt-3 shrink-0 rounded-md bg-taupe2 px-3 py-2 text-sm">{notice}</p>{/if}
	{#if message}<p role="alert" class="mt-3 shrink-0 text-sm {results?.length ? 'text-red-700' : 'text-grey3'}">{message}</p>{/if}

	<div class="mt-3 min-h-0 flex-1 overflow-y-auto">
		{#if results?.length}
			<ul class="divide-y divide-taupe2">
				{#each results as r (`${r.source}\u0000${r.id}`)}
					{@const at = pickedIndex.get(`${r.source}\u0000${r.id}`)}
					<li class="flex items-center gap-2 py-2">
						<input type="checkbox" checked={at !== undefined} disabled={r.tooBig} onchange={() => togglePick(r)} aria-label="Select {r.title} for a batch" />
						<span class="w-5 shrink-0 text-center text-xs font-medium text-grey3">{at !== undefined ? at + 1 : ''}</span>
						<div class="min-w-0 flex-1">
							<div class="truncate text-sm font-medium">{r.title}</div>
							<div class="truncate text-xs text-grey3">{[r.author, r.detail].filter(Boolean).join(' · ')}</div>
						</div>
						<span class="shrink-0 rounded bg-taupe2 px-1.5 py-0.5 text-[10px]">{r.sourceName}</span>
						<a href={r.url} target="_blank" rel="noopener noreferrer" aria-label="Open {r.title} on {r.sourceName}" class="rounded-md p-1 hover:bg-taupe2"><ArrowUpRightSquare width={16} height={16} /></a>
						<button onclick={() => importText(r)} disabled={!!importing || batchDone !== null || r.tooBig} class="shrink-0 rounded-md bg-violet px-3 py-1 text-xs font-medium text-white hover:bg-violet/90 disabled:cursor-not-allowed disabled:opacity-50">
							{importing === `${r.source}\u0000${r.id}` ? 'Importing…' : 'Import'}
						</button>
					</li>
				{/each}
			</ul>
		{/if}

		{#if human.length}
			<details class="mt-4 rounded-md border border-taupe2 p-3">
				<summary class="cursor-pointer text-sm font-medium">Other places to find texts</summary>
				<p class="mt-2 text-xs text-grey3">
					These libraries ask for human visitors, need a key or login, or have no public API, so exegeezer does not fetch from them. Download a text there by hand, following their own instructions, then load the file with Browse Computer.
				</p>
				<ul class="mt-3 space-y-3">
					{#each human as h (h.id)}
						<li class="text-sm">
							<a href={h.homepage} target="_blank" rel="noopener noreferrer" class="font-medium underline">{h.name}</a>
							<span class="text-xs text-grey3"> · {h.kind}</span>
							<p class="text-xs">{h.description}</p>
							<p class="text-xs text-grey3">{h.why}</p>
							<p class="mt-0.5 text-xs">
								{#each h.instructions as ins, i (ins.url)}{i ? ' · ' : ''}<a href={ins.url} target="_blank" rel="noopener noreferrer" class="underline">{ins.label}</a>{/each}
							</p>
						</li>
					{/each}
				</ul>
			</details>
		{/if}
	</div>
	</div>

	{#if busy}
		<div role="status" aria-live="polite" class="absolute inset-0 z-10 flex flex-col items-center justify-center gap-3 rounded-lg bg-taupe1/85 text-center">
			<span class="text-violet"><RainLoader size={72} /></span>
			<p class="text-sm font-medium">
				{batchDone !== null ? `Importing text ${Math.min(batchDone + 1, picked.length)} of ${picked.length}…` : 'Importing…'}
			</p>
			<p class="max-w-xs text-xs text-grey3">Long works can take half a minute. Please wait.</p>
		</div>
	{/if}
</dialog>
