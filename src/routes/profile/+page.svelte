<script>
	import { tick } from 'svelte';
	import { enhance } from '$app/forms';
	import { afterNavigate, goto, invalidateAll } from '$app/navigation';
	import { page } from '$app/state';
	import TextsBrowser from '#lib/components/TextsBrowser.svelte';
	import ConfirmDialog from '#lib/components/ConfirmDialog.svelte';
	import AboutMe from '#lib/components/AboutMe.svelte';
	import SettingsPane from '#lib/components/SettingsPane.svelte';
	import TagField from '#lib/components/TagField.svelte';
	import { tip } from '#lib/utilities/menuTip.svelte.js';
	import { LOCKED_MESSAGE, PRODUCTION_STATUSES, VISIBILITIES } from '#lib/textStatus.js';
	import { Scroll, MessageCircleReply, ListUl, Grid, Plus, Feather, Edit, Trash, Key } from '@boxicons/svelte';

	let { data, form } = $props();
	let busy = $state(false);
	let editing = $state(false);
	let draft = $state('');
	let formEl;
	/** @type {HTMLDialogElement | undefined} */
	let personaDialog;
	/** @type {HTMLDialogElement | undefined} */
	let detailDialog;
	/** @type {HTMLDialogElement | undefined} */
	let textDialog;
	/** id of the text whose properties the text modal edits */
	let editTextId = $state('');
	const editText = $derived(data.texts.find((x) => x.id === editTextId));
	/** @type {{ title: string, message: string, confirm: string, run: () => void } | null} */
	let deleteRequest = $state(null);
	/** @type {HTMLFormElement | undefined} */
	let deleteFormEl;
	let deleteId = $state('');
	/** values being edited in the text modal; each field saves when you leave it */
	let tdraft = $state({ title: '', personaId: '', productionStatus: '', visibility: '' });
	/** the field currently open for editing ('' = none: the modal reads like a display) */
	let tfield = $state('');
	/** @type {HTMLFormElement | undefined} */
	let textFormEl;
	function resetDraft() {
		const t = data.texts.find((x) => x.id === editTextId);
		if (t) tdraft = { title: t.title, personaId: t.personaId ?? '', productionStatus: t.productionStatus, visibility: t.visibility };
	}
	function openTextEditor(id) {
		editTextId = id;
		resetDraft();
		tfield = '';
		textDialog?.showModal();
	}
	/** leave a field: save if its value changed, otherwise just close it */
	async function commitField() {
		if (!tfield) return; // already left (e.g. Enter, then the blur from the field going away)
		tfield = '';
		const t = data.texts.find((x) => x.id === editTextId);
		if (!t) return;
		const same = tdraft.title.trim() === t.title && tdraft.personaId === (t.personaId ?? '') && tdraft.productionStatus === t.productionStatus && tdraft.visibility === t.visibility;
		if (same) return;
		await tick(); // the form posts its hidden fields, which must have caught up with the draft first
		textFormEl?.requestSubmit();
	}
	/** a value just clicked becomes its dropdown, focused and already dropped @param {HTMLSelectElement} node */
	function dropped(node) {
		node.focus();
		try {
			node.showPicker();
		} catch {
			// a browser that can't be told to open it: it is focused, and a click or a key opens it
		}
	}
	function cancelField() {
		tfield = '';
		resetDraft();
	}
	/** @type {HTMLFormElement | undefined} */
	let personaDeleteFormEl;
	let personaDeleteId = $state('');
	function askDeletePersona(pa) {
		deleteRequest = {
			title: 'Delete this persona?',
			message: `This deletes the persona "${pa.name}". Your texts written as it go back to "self".`,
			confirm: 'Delete',
			run: () => {
				personaDeleteId = pa.id;
				queueMicrotask(() => personaDeleteFormEl?.requestSubmit());
			}
		};
	}
	function askDelete(t) {
		deleteRequest = {
			title: t.type === 'commentary' ? 'Delete this commentary?' : 'Delete this text?',
			message: `This permanently deletes "${t.title}" and all of its content.`,
			confirm: 'Delete',
			run: () => {
				deleteId = t.id;
				queueMicrotask(() => deleteFormEl?.requestSubmit());
			}
		};
	}
	/** id of the persona whose properties the detail modal shows */
	let detailId = $state('');
	const detail = $derived(data.personae.find((x) => x.id === detailId));
	/** values being edited in the persona modal; each field saves when you leave it */
	let pdraft = $state({ name: '', image: '', description: '', pseudonymous: false });
	/** the field open for editing ('' = none: the modal reads like a display) */
	let pfield = $state('');
	/** @type {HTMLFormElement | undefined} */
	let personaFormEl;
	function resetPersonaDraft() {
		const d = data.personae.find((x) => x.id === detailId);
		if (d) pdraft = { name: d.name, image: d.image ?? '', description: d.description ?? '', pseudonymous: d.pseudonymous };
	}
	function openDetail(id) {
		detailId = id;
		resetPersonaDraft();
		pfield = '';
		detailDialog?.showModal();
	}
	/** leave a field: save if anything changed, otherwise just close it */
	async function commitPersonaField() {
		if (!pfield) return; // already left (e.g. Enter, then the blur from the field going away)
		pfield = '';
		const d = data.personae.find((x) => x.id === detailId);
		if (!d) return;
		const same = pdraft.name.trim() === d.name && pdraft.image.trim() === (d.image ?? '') && pdraft.description.trim() === (d.description ?? '');
		if (same) return;
		await tick(); // as in commitField
		personaFormEl?.requestSubmit();
	}
	/** the pseudonymous box saves as soon as it is changed */
	async function savePseudonymous() {
		await tick(); // as in commitField
		personaFormEl?.requestSubmit();
	}
	function cancelPersonaField() {
		pfield = '';
		resetPersonaDraft();
	}
	const tabs = ['Profile', 'Texts', 'Commentaries', 'Personae', 'Settings'];
	// `?tab=settings` (where /settings leads) opens that tab; clicking another just switches
	const tabFor = (/** @type {URL} */ url) => tabs.find((t) => t.toLowerCase() === url.searchParams.get('tab')) ?? 'Profile';
	let tab = $state(tabFor(page.url));
	// following a link here picks the tab afresh; a form's own navigation (it drops the query) leaves it be
	afterNavigate(({ type, to }) => {
		if (type !== 'form' && to) tab = tabFor(to.url);
	});
	/** 'list' | 'icons' */
	let view = $state(/** @type {'list' | 'icons'} */ ('list'));
	const day = (iso) => new Date(iso).toLocaleDateString(undefined, { dateStyle: 'medium' });
	const typeLabel = { original: 'Original text', commentary: 'Commentary' };
	const fmt = (iso) => new Date(iso).toLocaleString(undefined, { dateStyle: 'long', timeStyle: 'short' });
	const p = $derived(data.profile);
	// commentaries are texts too, but are listed in their own tab only
	const originals = $derived(data.texts.filter((t) => t.type !== 'commentary'));
	const commentaries = $derived(data.texts.filter((t) => t.type === 'commentary'));

	function startEdit() {
		draft = p.name;
		editing = true;
	}
	function cancel() {
		draft = p.name; // so the blur from removing the input doesn't save
		editing = false;
	}
</script>

<svelte:head><title>Profile · Exegeezer</title></svelte:head>

<main class="mx-auto w-full max-w-3xl px-6 py-10">
	<div class="rounded-2xl border border-taupe3 bg-taupe1 p-8 shadow-md">
		<div class="mb-6 flex items-start gap-3">
		<form
			bind:this={formEl}
			method="post"
			action="?/updateProfile"
			use:enhance={() => {
				busy = true;
				return async ({ result, update }) => {
					await update({ reset: false });
					await invalidateAll();
					if (result.type === 'success') editing = false;
					busy = false;
				};
			}}
			class="min-w-0 flex-1"
		>
			{#if editing}
				<!-- svelte-ignore a11y_autofocus -->
				<input
					name="name"
					autocomplete="name"
					autofocus
					bind:value={draft}
					onkeydown={(e) => {
						if (e.key === 'Enter') { e.preventDefault(); formEl.requestSubmit(); }
						else if (e.key === 'Escape') cancel();
					}}
					onblur={() => (draft.trim() === p.name ? cancel() : formEl.requestSubmit())}
					class="w-full rounded-md px-2 py-1 text-2xl font-semibold"
				/>
				<p class="mt-1 text-xs text-grey3">Enter to save, Esc to cancel.</p>
			{:else}
				<h1 class="text-2xl font-semibold text-dark">
					<button
						type="button"
						onclick={startEdit}
						title="Click to edit"
						class="w-full cursor-text rounded-md px-2 py-1 text-left hover:bg-taupe2"
					>
						{#if p.name}{p.name}{:else}<span class="font-normal text-grey3">No name</span>{/if}
					</button>
				</h1>
			{/if}
			{#if form?.message}<p role="alert" class="mt-2 text-sm text-red">{form.message}</p>{/if}
		</form>
		<form method="post" action="/logout" class="shrink-0">
			<button class="inline-flex items-center gap-1.5 rounded-md bg-accent px-3 py-2 text-sm font-medium text-on-accent hover:bg-accent/90"><Key width={18} height={18} class="shrink-0 text-inherit!" aria-hidden="true" />Sign out</button>
		</form>
		</div>

		<div role="tablist" aria-label="Profile sections" class="mb-5 flex flex-wrap gap-1 border-b border-taupe3">
			{#each tabs as t (t)}
				<button
					role="tab"
					id="tab-{t}"
					aria-selected={tab === t}
					aria-controls="panel-{t}"
					onclick={() => (tab = t)}
					class="-mb-px rounded-t-md border-b-2 px-4 py-2 text-sm font-medium {tab === t ? 'border-dark text-dark' : 'border-transparent text-grey3 hover:bg-taupe2'}"
				>
					{t}
				</button>
			{/each}
		</div>

		{#if tab === 'Profile'}
			<div role="tabpanel" id="panel-Profile" aria-labelledby="tab-Profile">
				<AboutMe about={data.about} message={form?.aboutMessage} draftMarkdown={form?.aboutMarkdown} />
				<hr class="my-6 border-taupe3" />
				<div class="flex flex-col gap-1 text-sm">
					<span class="font-medium text-dark">Email</span>
					<span class="text-grey3">{p.email}</span>
					<span class="mt-2 font-medium text-dark">Email confirmed</span>
					<span class="text-grey3">{p.emailVerified ? 'Yes' : 'No'}</span>
				</div>
				<hr class="my-6 border-taupe3" />
				<dl class="grid grid-cols-2 gap-y-2 text-sm">
					<dt class="text-grey3">Member since</dt><dd class="text-right text-dark">{fmt(p.createdAt)}</dd>
					<dt class="text-grey3">Last updated</dt><dd class="text-right text-dark">{fmt(p.updatedAt)}</dd>
					<dt class="text-grey3">Texts</dt><dd class="text-right text-dark">{data.textCount}</dd>
					<dt class="text-grey3">Account ID</dt><dd class="truncate text-right font-mono text-xs text-dark">{p.id}</dd>
				</dl>
			</div>
		{:else if tab === 'Texts'}
			<div role="tabpanel" id="panel-Texts" aria-labelledby="tab-Texts">
				<div class="mb-3 flex items-center justify-between gap-1">
					<a href="/exejeeze?new" aria-label="Create new text" class="group relative rounded-md border border-taupe3 bg-taupe2 p-1 hover:bg-taupe3">
						<Plus width={18} height={18} />
						<span role="tooltip" class="pointer-events-none absolute top-1/2 left-full z-10 ml-2 -translate-y-1/2 rounded-md border border-taupe3 bg-taupe1 px-2 py-1 text-xs whitespace-nowrap text-grey3 opacity-0 shadow-md group-hover:opacity-100 group-focus-visible:opacity-100">Create new text</span>
					</a>
					{#if originals.length}
						{@render viewToggle()}
					{/if}
				</div>
				{#if originals.length}
					<TextsBrowser texts={originals} {view} onselect={(t) => openTextEditor(t.id)} oniconselect={(t) => goto(`/exejeeze?text=${t.id}`)}>
						{#snippet actions(t)}{@render textActions(t)}{/snippet}
					</TextsBrowser>
				{:else}
					<p class="text-sm text-grey3">You have no texts yet.</p>
				{/if}
			</div>
		{:else if tab === 'Commentaries'}
			<div role="tabpanel" id="panel-Commentaries" aria-labelledby="tab-Commentaries">
				{#if commentaries.length}
					<div class="mb-3 flex justify-end">
						{@render viewToggle()}
					</div>
					<TextsBrowser texts={commentaries} glosses {view} onselect={(t) => openTextEditor(t.id)} oniconselect={(t) => goto(`/exejeeze?text=${t.id}`)}>
						{#snippet actions(t)}{@render textActions(t)}{/snippet}
					</TextsBrowser>
				{:else}
					<p class="text-sm text-grey3">You have no commentaries yet. One begins when you first comment on a text.</p>
				{/if}
			</div>
		{:else if tab === 'Settings'}
			<div role="tabpanel" id="panel-Settings" aria-labelledby="tab-Settings">
				<SettingsPane hasPassword={data.hasPassword} message={form?.passwordMessage} saved={form?.passwordSaved} />
			</div>
		{:else}
			<div role="tabpanel" id="panel-Personae" aria-labelledby="tab-Personae">
				<div class="flex justify-end">
					{@render addButton()}
				</div>
				{#if data.personae.length}
					<ul class="my-3 divide-y divide-taupe3 text-sm">
						{#each data.personae as pa (pa.id)}
							<li class="group flex items-start gap-1 px-1 py-1">
								<button type="button" onclick={() => openDetail(pa.id)} class="flex min-w-0 flex-1 items-center gap-3 rounded-md px-2 py-1 text-left hover:bg-taupe2">
									<Feather width={18} height={18} class="shrink-0" />
									<span class="min-w-0 flex-1">
										<span class="block truncate font-medium text-dark">{pa.name}</span>
										{#if pa.description}<span class="block truncate text-xs text-grey3">{pa.description}</span>{/if}
									</span>
									<span class="shrink-0 text-xs text-grey3">{day(pa.createdAt)}</span>
								</button>
								<div class="flex min-w-[2rem] shrink-0 items-center justify-end py-1">
									{#if pa.isSelf}
										<span class="text-xs text-grey3" title="Your default persona; it can't be deleted">default</span>
									{:else if pa.locked}
										<span class="text-xs text-grey3" title="Author of a published, public text, so it can't be deleted">in use</span>
									{:else}
										<!-- appears on hover, or when focused with the keyboard -->
										<button type="button" onclick={() => askDeletePersona(pa)} aria-label="Delete persona {pa.name}" title="Delete" class="rounded-md p-1 opacity-0 group-focus-within:opacity-100 group-hover:opacity-100 hover:bg-taupe3"><Trash width={18} height={18} /></button>
									{/if}
								</div>
							</li>
						{/each}
					</ul>
				{:else}
					<p class="my-3 text-sm text-grey3">You have no personae yet.</p>
				{/if}
				<div class="flex justify-end">
					{@render addButton()}
				</div>
				<dialog
					bind:this={detailDialog}
					onclick={(e) => { if (e.target === detailDialog) detailDialog?.close(); }}
					onclose={() => (pfield = '')}
					class="m-auto w-[min(92vw,30rem)] rounded-lg border border-taupe2 bg-taupe1 p-5 text-dark backdrop:bg-black/40"
				>
					{#if detail}
						<form
							bind:this={personaFormEl}
							method="post"
							action="?/updatePersona"
							use:enhance={() => {
								busy = true;
								return async ({ result, update }) => {
									await update({ reset: false });
									await invalidateAll();
									if (result.type !== 'success') resetPersonaDraft();
									busy = false;
								};
							}}
							class="flex flex-col gap-3 text-sm"
						>
							<input type="hidden" name="id" value={detail.id} />
							<input type="hidden" name="name" value={pdraft.name} />
							<input type="hidden" name="image" value={pdraft.image} />
							<input type="hidden" name="description" value={pdraft.description} />
							<input type="hidden" name="pseudonymous" value={pdraft.pseudonymous ? '1' : '0'} />

							<div class="flex items-center gap-4">
								{#if detail.image}
									<img src={detail.image} alt="" class="size-20 shrink-0 rounded-bubble border-4 border-taupe3 object-cover" />
								{:else}
									<span class="flex size-20 shrink-0 items-center justify-center rounded-bubble border-4 border-taupe3 bg-taupe2"><Feather size="lg" /></span>
								{/if}
								<div class="min-w-0 flex-1">
									<!-- the name: reads as a heading, becomes an input on click (not for "self") -->
									{#if pfield === 'name'}
										<!-- svelte-ignore a11y_autofocus -->
										<input
											autofocus
											bind:value={pdraft.name}
											aria-label="Name"
											onkeydown={(e) => {
												if (e.key === 'Enter') { e.preventDefault(); commitPersonaField(); }
												else if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); cancelPersonaField(); }
											}}
											onblur={commitPersonaField}
											class="w-full rounded-md px-2 py-1 text-lg font-semibold"
										/>
									{:else if detail.isSelf}
										<h2 class="truncate px-2 py-1 text-lg font-semibold" title="Your default persona's name can't be changed">{detail.name}</h2>
									{:else}
										<h2 class="text-lg font-semibold">
											<button type="button" onclick={() => (pfield = 'name')} title="Click to edit" class="w-full cursor-text truncate rounded-md px-2 py-1 text-left hover:bg-taupe2">{detail.name}</button>
										</h2>
									{/if}
									<p class="px-2 text-xs text-grey3">Created {day(detail.createdAt)}{detail.isSelf ? ' · your default persona' : ''}</p>
								</div>
							</div>
							{#if form?.editId === detail.id && form?.personaMessage}<p role="alert" class="px-2 text-red">{form.personaMessage}</p>{/if}

							<div>
								<span class="px-2 text-grey3">Image address</span>
								{#if pfield === 'image'}
									<!-- svelte-ignore a11y_autofocus -->
									<input
										autofocus
										type="url"
										placeholder="https://…"
										bind:value={pdraft.image}
										aria-label="Image address"
										onkeydown={(e) => {
											if (e.key === 'Enter') { e.preventDefault(); commitPersonaField(); }
											else if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); cancelPersonaField(); }
										}}
										onblur={commitPersonaField}
										class="mt-0.5 w-full rounded-md px-2 py-1"
									/>
								{:else}
									<button type="button" onclick={() => (pfield = 'image')} title="Click to edit" class="mt-0.5 block w-full cursor-text truncate rounded-md px-2 py-1 text-left hover:bg-taupe2 {detail.image ? 'text-dark' : 'text-grey3'}">{detail.image || 'None'}</button>
								{/if}
							</div>

							<div>
								<span class="px-2 text-grey3">Description</span>
								{#if pfield === 'description'}
									<!-- svelte-ignore a11y_autofocus -->
									<textarea
										autofocus
										rows="3"
										bind:value={pdraft.description}
										aria-label="Description"
										onkeydown={(e) => { if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); cancelPersonaField(); } }}
										onblur={commitPersonaField}
										class="mt-0.5 w-full rounded-md px-2 py-1"
									></textarea>
								{:else}
									<button type="button" onclick={() => (pfield = 'description')} title="Click to edit" class="mt-0.5 block w-full cursor-text rounded-md px-2 py-1 text-left whitespace-pre-line hover:bg-taupe2 {detail.description ? 'text-dark' : 'text-grey3'}">{detail.description || 'None'}</button>
								{/if}
							</div>

							<div class="px-2">
								{#if detail.isSelf}
									<span class="text-grey3">Pseudonymous</span>
									<p class="mt-0.5 text-xs text-grey3">No: your "self" persona is you.</p>
								{:else}
									<label class="flex items-center gap-2">
										<input type="checkbox" bind:checked={pdraft.pseudonymous} onchange={savePseudonymous} />
										Pseudonymous
									</label>
									<p class="mt-1 text-xs text-grey3">{pdraft.pseudonymous ? "Others aren't shown that this persona is yours." : "This persona's page shows that it is yours, and your page lists it."}</p>
								{/if}
							</div>

							<div class="px-2">
								<TagField kind="persona" id={detail.id} />
							</div>

							<div>
								<span class="px-2 text-grey3">Texts authored ({detail.texts.length})</span>
								{#if detail.texts.length}
									<ul class="mt-1 divide-y divide-taupe3">
										{#each detail.texts as t (t.id)}
											{@const Icon = t.type === 'commentary' ? MessageCircleReply : Scroll}
											<li>
												<a href="/exejeeze?text={t.id}" class="flex items-center gap-2 rounded-md px-2 py-1.5 hover:bg-taupe2">
													<Icon width={18} height={18} class="shrink-0" />
													<span class="min-w-0 flex-1 truncate">{t.title}</span>
													<span class="shrink-0 text-xs text-grey3">{t.productionStatus} · {t.visibility}</span>
												</a>
											</li>
										{/each}
									</ul>
								{:else}
									<p class="mt-1 px-2 text-xs text-grey3">None yet.</p>
								{/if}
							</div>
							<p class="px-2 text-xs text-grey3">Click a value to change it. Changes save when you leave the field; Esc cancels.</p>
							<div class="flex justify-end">
								<button type="button" onclick={() => detailDialog?.close()} class="rounded-md px-3 py-1.5 hover:bg-taupe2">Close</button>
							</div>
						</form>
					{/if}
				</dialog>
				<dialog
					bind:this={personaDialog}
					onclick={(e) => { if (e.target === personaDialog) personaDialog?.close(); }}
					class="m-auto w-[min(92vw,28rem)] rounded-lg border border-taupe2 bg-taupe1 p-5 text-dark backdrop:bg-black/40"
				>
				<form
					method="post"
					action="?/createPersona"
					use:enhance={() => {
						busy = true;
						return async ({ result, update }) => {
							await update({ reset: result.type === 'success' });
							await invalidateAll();
							if (result.type === 'success') personaDialog?.close();
							busy = false;
						};
					}}
					class="flex flex-col gap-2 text-sm"
				>
					<h2 class="text-base font-semibold text-dark">New persona</h2>
					<input name="name" placeholder="Name" value={form?.personaName ?? ''} class="rounded-md px-2 py-1" />
					<textarea name="description" rows="2" placeholder="Description (optional)" class="rounded-md px-2 py-1">{form?.personaDescription ?? ''}</textarea>
					<label class="flex items-center gap-2">
						<input type="checkbox" name="pseudonymous" value="1" checked />
						Pseudonymous
					</label>
					<p class="text-xs text-grey3">Others aren't shown that a pseudonymous persona is yours.</p>
					{#if form?.personaMessage}<p role="alert" class="text-red">{form.personaMessage}</p>{/if}
					<div class="mt-2 flex justify-end gap-2">
						<button type="button" onclick={() => personaDialog?.close()} class="rounded-md px-3 py-1.5 hover:bg-taupe2">Cancel</button>
						<button disabled={busy} class="rounded-md border border-taupe3 bg-taupe2 px-3 py-1.5 font-medium text-dark hover:bg-taupe3 disabled:opacity-50">Create persona</button>
					</div>
				</form>
				</dialog>
			</div>
		{/if}
	</div>
</main>

<ConfirmDialog bind:request={deleteRequest} />
<form
	bind:this={personaDeleteFormEl}
	method="post"
	action="?/deletePersona"
	hidden
	use:enhance={() => async ({ update }) => { await update(); await invalidateAll(); }}
>
	<input type="hidden" name="id" value={personaDeleteId} />
</form>
<form
	bind:this={deleteFormEl}
	method="post"
	action="?/deleteText"
	hidden
	use:enhance={() => async ({ update }) => { await update(); await invalidateAll(); }}
>
	<input type="hidden" name="id" value={deleteId} />
</form>

<dialog
	bind:this={textDialog}
	onclick={(e) => { if (e.target === textDialog) textDialog?.close(); }}
	onclose={() => (tfield = '')}
	class="m-auto w-[min(92vw,28rem)] rounded-lg border border-taupe2 bg-taupe1 p-5 text-dark backdrop:bg-black/40"
>
	{#if editText}
		{@const authorOptions = [...data.authorChoices, ...(editText.coAuthors ?? [])]}
		{@const authorName = authorOptions.find((c) => c.id === (editText.personaId ?? ''))?.name ?? '—'}
		<form
			bind:this={textFormEl}
			method="post"
			action="?/updateText"
			use:enhance={() => {
				busy = true;
				return async ({ result, update }) => {
					await update({ reset: false });
					await invalidateAll();
					if (result.type !== 'success') resetDraft();
					busy = false;
				};
			}}
			class="flex flex-col gap-1 text-sm"
		>
			<input type="hidden" name="id" value={editText.id} />
			<input type="hidden" name="title" value={tdraft.title} />
			<input type="hidden" name="personaId" value={tdraft.personaId} />
			<input type="hidden" name="productionStatus" value={tdraft.productionStatus} />
			<input type="hidden" name="visibility" value={tdraft.visibility} />

			<!-- the title: reads as a heading, becomes an input on click -->
			{#if tfield === 'title'}
				<!-- svelte-ignore a11y_autofocus -->
				<input
					autofocus
					bind:value={tdraft.title}
					maxlength="200"
					aria-label="Title"
					onkeydown={(e) => {
						if (e.key === 'Enter') { e.preventDefault(); commitField(); }
						else if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); cancelField(); }
					}}
					onblur={commitField}
					class="w-full rounded-md px-2 py-1 text-lg font-semibold"
				/>
			{:else}
				<h2 class="text-lg font-semibold">
					<button type="button" onclick={() => (tfield = 'title')} title="Click to edit" class="w-full cursor-text rounded-md px-2 py-1 text-left hover:bg-taupe2">{editText.title}</button>
				</h2>
			{/if}
			{#if form?.textEditId === editText.id && form?.textMessage}<p role="alert" class="px-2 text-red">{form.textMessage}</p>{/if}

			<dl class="mt-2 flex flex-col gap-0.5">
				{#snippet row(/** @type {'personaId' | 'productionStatus' | 'visibility'} */ key, label, shown, options, locked)}
					<div class="grid grid-cols-[8rem_minmax(0,1fr)] items-center">
						<dt class="px-2 text-grey3">{label}</dt>
						<dd>
							{#if tfield === key}
								<select
									use:dropped
									bind:value={tdraft[key]}
									aria-label={label}
									onchange={commitField}
									onfocusout={(e) => {
										// an open dropdown moves focus onto its options, which is not leaving it
										if (tfield === key && !e.currentTarget.contains(/** @type {Node | null} */ (e.relatedTarget))) cancelField();
									}}
									onkeydown={(e) => { if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); cancelField(); } }}
									class="w-full rounded-md px-2 py-1"
								>
									{#each options as o (o.value)}<option value={o.value}>{o.label}</option>{/each}
								</select>
							{:else if locked}
								<span class="block px-2 py-1 text-dark" title={locked}>{shown}</span>
							{:else}
								<button type="button" onclick={() => (tfield = key)} title="Click to edit" class="w-full cursor-pointer rounded-md px-2 py-1 text-left text-dark hover:bg-taupe2">{shown}</button>
							{/if}
						</dd>
					</div>
				{/snippet}
				{@render row('personaId', 'Author', authorName, authorOptions.map((c) => ({ value: c.id, label: c.name })), editText.publicized ? "The author of a published, public text can't be changed" : '')}
				{@render row('productionStatus', 'Production status', editText.productionStatus, PRODUCTION_STATUSES.map((v) => ({ value: v, label: v })), editText.publicized ? LOCKED_MESSAGE : '')}
				{@render row('visibility', 'Visibility', editText.visibility, VISIBILITIES.map((v) => ({ value: v, label: v })), editText.publicized ? LOCKED_MESSAGE : '')}
				<div class="grid grid-cols-[8rem_minmax(0,1fr)] items-center">
					<dt class="px-2 text-grey3">Type</dt><dd class="px-2 py-1 text-dark">{typeLabel[editText.type] ?? editText.type}</dd>
				</div>
				<div class="grid grid-cols-[8rem_minmax(0,1fr)] items-center">
					<dt class="px-2 text-grey3">Created</dt><dd class="px-2 py-1 text-dark">{fmt(editText.createdAt)}</dd>
				</div>
				<div class="grid grid-cols-[8rem_minmax(0,1fr)] items-center">
					<dt class="px-2 text-grey3">Last changed</dt><dd class="px-2 py-1 text-dark">{fmt(editText.updatedAt)}</dd>
				</div>
			</dl>
			<div class="mt-2 px-2">
				<TagField kind="text" id={editText.id} />
			</div>
			<p class="mt-2 px-2 text-xs text-grey3">Click a value to change it. Changes save when you leave the field; Esc cancels.</p>
			<div class="mt-3 flex justify-end">
				<button type="button" onclick={() => textDialog?.close()} class="rounded-md px-3 py-1.5 hover:bg-taupe2">Close</button>
			</div>
		</form>
	{/if}
</dialog>

{#snippet viewToggle()}
	<div class="flex gap-1" role="group" aria-label="View">
		<button onclick={() => (view = 'list')} aria-label="List view" aria-pressed={view === 'list'} use:tip={'List view'} class="rounded-md p-1 {view === 'list' ? 'bg-taupe2' : 'hover:bg-taupe2'}">
			<ListUl width={18} height={18} />
		</button>
		<button onclick={() => (view = 'icons')} aria-label="Icon view" aria-pressed={view === 'icons'} use:tip={'Icon view'} class="rounded-md p-1 {view === 'icons' ? 'bg-taupe2' : 'hover:bg-taupe2'}">
			<Grid width={18} height={18} />
		</button>
	</div>
{/snippet}

<!-- the buttons at the end of a row of texts or commentaries -->
{#snippet textActions(t)}
	<button type="button" onclick={(e) => { e.stopPropagation(); askDelete(t); }} aria-label="Delete {t.title}" use:tip={'Delete'} class="rounded-md p-1 hover:bg-taupe3"><Trash width={18} height={18} /></button>
	<a href="/exejeeze?text={t.id}" onclick={(e) => e.stopPropagation()} aria-label="Open {t.title} in the text editor" use:tip={'Open in the text editor'} class="rounded-md p-1 hover:bg-taupe3"><Edit width={18} height={18} /></a>
{/snippet}

{#snippet addButton()}
	<button
		type="button"
		onclick={() => personaDialog?.showModal()}
		aria-label="Add new persona"
		class="group relative rounded-md p-1 hover:bg-taupe2"
	>
		<Plus width={18} height={18} />
		<span role="tooltip" class="pointer-events-none absolute top-1/2 right-full mr-2 -translate-y-1/2 rounded-md border border-taupe3 bg-taupe1 px-2 py-1 text-xs whitespace-nowrap text-taupe5 opacity-0 shadow-md group-hover:opacity-100 group-focus-visible:opacity-100">Add new persona</span>
	</button>
{/snippet}
