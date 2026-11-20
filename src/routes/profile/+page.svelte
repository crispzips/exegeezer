<script>
	import { enhance } from '$app/forms';
	import { invalidateAll } from '$app/navigation';
	import { Scroll, MessageCircleReply, ListUl, Grid } from '@boxicons/svelte';

	let { data, form } = $props();
	let busy = $state(false);
	let editing = $state(false);
	let draft = $state('');
	let formEl;
	const tabs = ['Profile', 'Texts', 'Authors'];
	let tab = $state('Profile');
	/** 'list' | 'icons' */
	let view = $state('list');
	const day = (iso) => new Date(iso).toLocaleDateString(undefined, { dateStyle: 'medium' });
	const typeLabel = { original: 'Original text', commentary: 'Commentary' };
	const fmt = (iso) => new Date(iso).toLocaleString(undefined, { dateStyle: 'long', timeStyle: 'short' });
	const p = $derived(data.profile);

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

<main class="mx-auto w-full max-w-md px-6 py-10">
	<div class="rounded-2xl border border-taupe3 bg-taupe1 p-8 shadow-md">
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
			class="mb-6"
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
					class="w-full rounded-md border border-taupe3 bg-white/60 px-2 py-1 text-2xl font-semibold text-dark outline-none focus:border-grey2"
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
						{p.name}
					</button>
				</h1>
			{/if}
			{#if form?.message}<p role="alert" class="mt-2 text-sm text-red">{form.message}</p>{/if}
		</form>

		<div role="tablist" aria-label="Profile sections" class="mb-5 flex gap-1 border-b border-taupe3">
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
				{#if data.texts.length}
					<div class="mb-3 flex justify-end gap-1" role="group" aria-label="View">
						<button onclick={() => (view = 'list')} aria-label="List view" aria-pressed={view === 'list'} title="List view" class="rounded-md p-1.5 {view === 'list' ? 'bg-taupe2' : 'hover:bg-taupe2'}">
							<ListUl size="md" />
						</button>
						<button onclick={() => (view = 'icons')} aria-label="Icon view" aria-pressed={view === 'icons'} title="Icon view" class="rounded-md p-1.5 {view === 'icons' ? 'bg-taupe2' : 'hover:bg-taupe2'}">
							<Grid size="md" />
						</button>
					</div>
					{#if view === 'list'}
						<ul class="divide-y divide-taupe3 text-sm">
							{#each data.texts as t (t.id)}
								{@const Icon = t.type === 'commentary' ? MessageCircleReply : Scroll}
								<li>
									<a href="/exejeeze?text={t.id}" class="flex items-center gap-3 rounded-md px-2 py-2 hover:bg-taupe2">
										<span title={typeLabel[t.type] ?? t.type} class="shrink-0"><Icon size="sm" /></span>
										<span class="min-w-0 flex-1 truncate font-medium text-dark">{t.title}</span>
										<span class="shrink-0 text-xs text-grey3">{day(t.createdAt)}</span>
									</a>
								</li>
							{/each}
						</ul>
					{:else}
						<ul class="flex flex-wrap gap-5">
							{#each data.texts as t (t.id)}
								{@const Icon = t.type === 'commentary' ? MessageCircleReply : Scroll}
								<li class="w-16">
									<a href="/exejeeze?text={t.id}" title="{t.title} ({typeLabel[t.type] ?? t.type})" class="group flex flex-col items-center gap-1.5">
										<span class="flex size-16 items-center justify-center rounded-bubble border-4 border-taupe3 bg-taupe2 shadow-sm group-hover:bg-taupe3">
											<Icon size="lg" />
										</span>
										<span class="w-full truncate rounded-2xl border border-taupe3 bg-taupe1 px-2 py-1 text-center text-xs text-taupe5 shadow-lg">{t.title}</span>
									</a>
								</li>
							{/each}
						</ul>
					{/if}
				{:else}
					<p class="text-sm text-grey3">You have no texts yet.</p>
				{/if}
			</div>
		{:else}
			<div role="tabpanel" id="panel-Authors" aria-labelledby="tab-Authors">
				<p class="text-sm text-grey3">Nothing here yet.</p>
			</div>
		{/if}
	</div>
</main>
