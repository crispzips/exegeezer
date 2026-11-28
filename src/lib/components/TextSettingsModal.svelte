<script>
	import MultiSelect from '#lib/components/MultiSelect.svelte';
	import PeoplePicker from '#lib/components/PeoplePicker.svelte';
	import TagField from '#lib/components/TagField.svelte';
	import { X } from '@boxicons/svelte';
	import { CHOOSABLE_STATUSES, COMMENT_POLICIES, COMMENT_POLICY_LABELS, PRIVILEGES, VISIBILITIES, LOCKED_MESSAGE } from '#lib/textStatus.js';

	/**
	 * A modal for editing a whole text's settings. Open it by setting `request` to `{ id }`; `onsaved()` is called after
	 * a change has been made. Authors change anything open to change; editors propose the status, the visibility and
	 * whom it is circulated to. A change that others have a say in waits for them, and the modal says so.
	 *
	 * @type {{ request: { id: string } | null, onsaved?: () => void }}
	 */
	let { request = $bindable(null), onsaved } = $props();

	/** @type {HTMLDialogElement | undefined} */
	let dialogEl = $state();
	/** @type {any} */
	let info = $state(null);
	/** @typedef {{ userId: string | null, groupId: string | null, privilege: string, name: string }} Share */
	let draft = $state({
		title: '',
		description: '',
		personaIds: /** @type {string[]} */ ([]),
		editors: /** @type {{ id: string, name: string }[]} */ ([]),
		shares: /** @type {Share[]} */ ([]),
		productionStatus: '',
		visibility: '',
		commentPolicy: ''
	});
	let message = $state('');
	let notice = $state('');
	let busy = $state(false);

	const typeLabel = /** @type {Record<string, string>} */ ({ original: 'Original text', commentary: 'Commentary' });
	const fmt = (/** @type {string} */ iso) => new Date(iso).toLocaleString(undefined, { dateStyle: 'long', timeStyle: 'short' });

	const editorOnly = $derived(info?.access === 'editor');
	const commentary = $derived(info?.type === 'commentary');
	/** the head of a publication or palimpsest can't change (nor can an editor change it) */
	const fixed = $derived(!!info?.publicized || editorOnly);
	// a private text is circulated, never published; a public one the other way round
	const statuses = $derived(
		CHOOSABLE_STATUSES.filter((s) => s === info?.productionStatus || (draft.visibility === 'public' ? s !== 'circulated' : s !== 'published'))
	);

	$effect(() => {
		if (!request || !dialogEl || dialogEl.open) return;
		info = null;
		message = '';
		notice = '';
		dialogEl.showModal();
		load(request.id);
	});

	/** @param {string} id */
	async function load(id) {
		try {
			const res = await fetch(`/api/texts/${id}/properties`);
			if (!res.ok) throw new Error(`${res.status}`);
			info = await res.json();
			draft = {
				title: info.title,
				description: info.description,
				personaIds: [...info.personaIds],
				editors: [...info.editorNames],
				shares: info.shares.map((/** @type {Share} */ s) => ({ ...s })),
				productionStatus: info.productionStatus,
				visibility: info.visibility,
				commentPolicy: info.commentPolicy
			};
		} catch {
			message = 'Could not load the text’s settings.';
		}
	}

	/** choosing a visibility keeps the status one the text can have: a circulated text made public is published */
	function onVisibility() {
		if (draft.visibility === 'public' && draft.productionStatus === 'circulated') draft.productionStatus = info.visibility === 'private' && info.productionStatus === 'circulated' ? 'published' : 'manuscript';
		if (draft.visibility === 'private' && draft.productionStatus === 'published') draft.productionStatus = 'manuscript';
	}

	/** @param {string} id @param {string} name @param {'userId' | 'groupId'} kind */
	function addShare(id, name, kind) {
		if (draft.shares.some((s) => s[kind] === id)) return;
		draft.shares = [...draft.shares, { userId: null, groupId: null, [kind]: id, name, privilege: 'read' }];
	}

	async function save() {
		if (!info || busy) return;
		if (!draft.title.trim()) return void (message = 'Enter a title.');
		if (!draft.personaIds.length && !editorOnly) return void (message = 'Choose at least one author.');
		const publishing = !commentary && !info.publicized && draft.productionStatus === 'published' && draft.visibility === 'public';
		if (publishing && !confirm('Publishing is for good. A published, public text is locked and can never be deleted, only recanted or burned. Publish it?')) return;
		const circulation = { productionStatus: draft.productionStatus, visibility: draft.visibility, shares: draft.shares.map(({ userId, groupId, privilege }) => ({ userId, groupId, privilege })) };
		const body = info.publicized
			? { commentPolicy: draft.commentPolicy }
			: editorOnly
				? circulation
				: {
						title: draft.title,
						description: draft.description,
						personaIds: draft.personaIds,
						editorIds: draft.editors.map((e) => e.id),
						commentPolicy: draft.commentPolicy,
						...(commentary ? { shares: circulation.shares } : circulation)
					};
		busy = true;
		message = '';
		notice = '';
		try {
			const res = await fetch(`/api/texts/${info.id}/properties`, { method: 'PATCH', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });
			const answer = await res.json().catch(() => null);
			if (!res.ok) return void (message = answer?.message ?? 'Could not save.');
			if (answer?.done === false) return void (notice = answer.message);
			onsaved?.();
			dialogEl?.close();
		} finally {
			busy = false;
		}
	}

	/** @param {boolean} open */
	async function markAll(open) {
		if (!info || busy) return;
		if (open && !confirm('Make every comment in this commentary public? Where the text it is on has been published, they can then never be changed, hidden or deleted.')) return;
		busy = true;
		message = '';
		notice = '';
		try {
			const res = await fetch(`/api/texts/${info.id}/mark`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ public: open }) });
			const answer = await res.json().catch(() => null);
			if (!res.ok) return void (message = answer?.message ?? 'Could not mark the comments.');
			if (answer?.done === false) return void (notice = answer.message);
			notice = open ? 'Every comment is marked public.' : 'Comments are marked private, except any already in public memory.';
			onsaved?.();
			await load(info.id);
		} finally {
			busy = false;
		}
	}
</script>

<dialog
	bind:this={dialogEl}
	onclick={(e) => { if (e.target === dialogEl) dialogEl?.close(); }}
	onclose={() => (request = null)}
	class="m-auto w-[min(92vw,32rem)] rounded-lg border border-taupe2 bg-taupe1 p-5 text-dark backdrop:bg-black/40"
>
	{#if request}
		<form onsubmit={(e) => { e.preventDefault(); save(); }} class="flex flex-col gap-2 text-sm">
			<h2 class="text-base font-semibold">Text settings</h2>
			{#if info?.publicized}<p class="text-xs text-grey3">{LOCKED_MESSAGE} Only who may comment, and its tags, can still be changed.</p>{/if}
			{#if editorOnly && !info.publicized}<p class="text-xs text-grey3">You edit this text. You can propose its status, visibility and circulation; its authors decide.</p>{/if}
			{#if info}
				<label class="grid grid-cols-[8rem_minmax(0,1fr)] items-center gap-2">
					<span class="text-grey3">Title</span>
					<input bind:value={draft.title} maxlength="200" disabled={fixed} class="rounded-md px-2 py-1" />
				</label>
				<label class="grid grid-cols-[8rem_minmax(0,1fr)] items-start gap-2">
					<span class="pt-1 text-grey3">Description</span>
					<textarea bind:value={draft.description} rows="3" maxlength="5000" disabled={fixed} class="rounded-md px-2 py-1"></textarea>
				</label>
				<div class="grid grid-cols-[8rem_minmax(0,1fr)] items-center gap-2">
					<span class="text-grey3">Authors</span>
					<MultiSelect label="Authors" placeholder="Choose authors" options={info.authorChoices.map((/** @type {{ id: string, name: string }} */ c) => ({ value: c.id, label: c.name }))} bind:value={draft.personaIds} disabled={fixed} />
				</div>
				<div class="grid grid-cols-[8rem_minmax(0,1fr)] items-start gap-2">
					<span class="pt-1 text-grey3">Editors</span>
					<div class="flex flex-col gap-1">
						{#each draft.editors as e (e.id)}
							<span class="flex items-center justify-between gap-2 rounded-md border border-taupe3 px-2 py-0.5">
								{e.name}
								{#if !fixed}<button type="button" aria-label="Remove {e.name}" onclick={() => (draft.editors = draft.editors.filter((x) => x.id !== e.id))} class="rounded p-0.5 hover:bg-taupe2"><X width={14} height={14} /></button>{/if}
							</span>
						{/each}
						{#if !fixed}
							<PeoplePicker url="/api/search/personae" label="Add a persona as editor" exclude={[...draft.personaIds, ...draft.editors.map((e) => e.id)]} onpick={(p) => (draft.editors = [...draft.editors, p])} />
						{:else if !draft.editors.length}
							<span class="py-1 text-grey3">None</span>
						{/if}
					</div>
				</div>
				{#if commentary}
					<div class="grid grid-cols-[8rem_minmax(0,1fr)] items-start gap-2">
						<span class="pt-1 text-grey3">Status</span>
						<div>
							<p class="py-1">{info.productionStatus} · {info.visibility}</p>
							<p class="text-xs text-grey3">A commentary follows the text it is on. Mark comments public or private: public ones are published when that text is.</p>
							{#if !editorOnly && info.productionStatus !== 'burned' && info.productionStatus !== 'recanted'}
								<div class="mt-1 flex gap-2">
									<button type="button" disabled={busy} onclick={() => markAll(true)} class="rounded-md border border-taupe3 px-2 py-1 hover:bg-taupe2">Mark all public</button>
									<button type="button" disabled={busy} onclick={() => markAll(false)} class="rounded-md border border-taupe3 px-2 py-1 hover:bg-taupe2">Mark all private</button>
								</div>
							{/if}
						</div>
					</div>
				{:else}
					<label class="grid grid-cols-[8rem_minmax(0,1fr)] items-center gap-2">
						<span class="text-grey3">Production status</span>
						{#if info.publicized}
							<span class="py-1">{info.productionStatus}</span>
						{:else}
							<select bind:value={draft.productionStatus} class="rounded-md px-2 py-1">
								{#each statuses as v (v)}<option value={v}>{v}</option>{/each}
							</select>
						{/if}
					</label>
					<label class="grid grid-cols-[8rem_minmax(0,1fr)] items-center gap-2">
						<span class="text-grey3">Visibility</span>
						<select bind:value={draft.visibility} onchange={onVisibility} disabled={info.publicized} class="rounded-md px-2 py-1">
							{#each VISIBILITIES as v (v)}<option value={v}>{v}</option>{/each}
						</select>
					</label>
				{/if}
				{#if !commentary && draft.productionStatus === 'circulated'}
					<div class="grid grid-cols-[8rem_minmax(0,1fr)] items-start gap-2">
						<span class="pt-1 text-grey3">Circulated to</span>
						<div class="flex flex-col gap-1">
							{#each draft.shares as s, i (s.userId ?? s.groupId)}
								<span class="flex items-center gap-2 rounded-md border border-taupe3 px-2 py-0.5">
									<span class="min-w-0 flex-1 truncate">{s.name}</span>
									<select bind:value={draft.shares[i].privilege} aria-label="What {s.name} may do" class="rounded-md px-1 py-0.5">
										{#each PRIVILEGES as p (p)}<option value={p}>{p}</option>{/each}
									</select>
									<button type="button" aria-label="Remove {s.name}" onclick={() => (draft.shares = draft.shares.filter((_, k) => k !== i))} class="rounded p-0.5 hover:bg-taupe2"><X width={14} height={14} /></button>
								</span>
							{/each}
							<PeoplePicker url="/api/search/users" label="Add a user" exclude={draft.shares.flatMap((s) => (s.userId ? [s.userId] : []))} onpick={(u) => addShare(u.id, u.name, 'userId')} />
							{#if info.groups.length}
								<select aria-label="Add a group" value="" onchange={(e) => { const g = info.groups.find((/** @type {{ id: string }} */ x) => x.id === e.currentTarget.value); if (g) addShare(g.id, `Group: ${g.name}`, 'groupId'); e.currentTarget.value = ''; }} class="rounded-md px-2 py-1">
									<option value="">Add a group…</option>
									{#each info.groups as g (g.id)}<option value={g.id}>{g.name} ({g.members.length})</option>{/each}
								</select>
							{:else}
								<p class="text-xs text-grey3">Groups are made on your profile, under Circulation.</p>
							{/if}
						</div>
					</div>
				{/if}
				<label class="grid grid-cols-[8rem_minmax(0,1fr)] items-center gap-2">
					<span class="text-grey3">Commenting</span>
					<select bind:value={draft.commentPolicy} disabled={editorOnly} class="rounded-md px-2 py-1">
						{#each COMMENT_POLICIES as v (v)}<option value={v}>{COMMENT_POLICY_LABELS[v]}</option>{/each}
					</select>
				</label>
				{#if !editorOnly}<TagField kind="text" id={info.id} />{/if}
				<dl class="grid grid-cols-[8rem_minmax(0,1fr)] gap-x-2 gap-y-1">
					<dt class="text-grey3">Type</dt><dd>{typeLabel[info.type] ?? info.type}</dd>
					<dt class="text-grey3">Created</dt><dd>{fmt(info.createdAt)}</dd>
					<dt class="text-grey3">Last changed</dt><dd>{fmt(info.updatedAt)}</dd>
				</dl>
			{:else if !message}
				<p class="text-grey3">Loading…</p>
			{/if}
			{#if message}<p role="alert" class="text-red">{message}</p>{/if}
			{#if notice}<p role="status">{notice}</p>{/if}
			<div class="mt-2 flex justify-end gap-2">
				<button type="button" onclick={() => dialogEl?.close()} class="rounded-md px-3 py-1.5 hover:bg-taupe2">{notice ? 'Close' : 'Cancel'}</button>
				<button disabled={!info || busy} class="rounded-md bg-accent px-3 py-1.5 font-medium text-on-accent hover:bg-accent/90 disabled:cursor-not-allowed disabled:opacity-50">{editorOnly ? 'Propose' : 'Save'}</button>
			</div>
		</form>
	{/if}
</dialog>
