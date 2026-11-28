<script>
	import { goto } from '$app/navigation';
	import { Search, ListUl, Grid, X } from '@boxicons/svelte';
	import PersonaCard from '#lib/components/PersonaCard.svelte';
	import Reel from '#lib/components/Reel.svelte';
	import UserCard from '#lib/components/UserCard.svelte';
	import { tip } from '#lib/utilities/menuTip.svelte.js';

	let { data, form } = $props();
	const query = $derived(data.q);
	/** what is in the box: typed over freely, and back to the page's query whenever that changes (the back button) */
	let draft = $derived(query);
	/** 'list' | 'icons': how search results are shown */
	let view = $state(/** @type {'list' | 'icons'} */ ('list'));

	/** Show a search's results (or, for '', the browse rows) from the top, leaving focus where it is. */
	async function show(/** @type {string} */ q) {
		await goto(q ? `/community?q=${encodeURIComponent(q)}` : '/community', { reset: false });
		scrollTo({ top: 0 });
	}
	function search(/** @type {SubmitEvent} */ e) {
		e.preventDefault();
		show(draft.trim());
	}
	function clear() {
		draft = '';
		show('');
	}
</script>

<svelte:head><title>Community · Exegeezer</title></svelte:head>

<main class="mx-auto w-full max-w-5xl px-6 py-10">
	<h1 class="mb-4 text-2xl font-semibold text-dark">Community</h1>

	<!-- the floating header: the search bar stays at the top of the window while the page scrolls under it -->
	<div class="raised sticky top-3 z-20 mb-6 flex items-center gap-2 rounded-xl p-2 shadow-lg">
		<form onsubmit={search} role="search" class="relative flex-1">
			<Search size="sm" class="pointer-events-none absolute top-1/2 left-2.5 -translate-y-1/2" />
			<!-- the browser's own clear cross is hidden: ours also clears the results -->
			<input type="search" bind:value={draft} placeholder="Search users and personae" aria-label="Search users and personae" class="w-full rounded-md py-1.5 pr-8 pl-8 text-sm [&::-webkit-search-cancel-button]:appearance-none" />
			{#if draft}
				<button type="button" onclick={clear} aria-label="Clear search" class="absolute top-1/2 right-1.5 -translate-y-1/2 rounded-md p-0.5 hover:bg-taupe2"><X size="sm" /></button>
			{/if}
		</form>
		{#if data.results}
			<div class="flex gap-1" role="group" aria-label="View">
				<button onclick={() => (view = 'list')} aria-label="List view" aria-pressed={view === 'list'} use:tip={'List view'} data-tip-place="below" class="rounded-md p-1 {view === 'list' ? 'bg-taupe2' : 'hover:bg-taupe2'}"><ListUl width={18} height={18} /></button>
				<button onclick={() => (view = 'icons')} aria-label="Icon view" aria-pressed={view === 'icons'} use:tip={'Icon view'} data-tip-place="below" class="rounded-md p-1 {view === 'icons' ? 'bg-taupe2' : 'hover:bg-taupe2'}"><Grid width={18} height={18} /></button>
			</div>
		{/if}
	</div>
	{#if form?.message}<p role="alert" class="mb-3 text-sm text-red">{form.message}</p>{/if}

	{#if data.results}
		<p class="mb-3 text-sm text-grey3">{data.results.length} {data.results.length === 1 ? 'user' : 'users'} for “{data.q}”</p>
		{#if !data.results.length}
			<p class="text-sm text-grey3">No users found.</p>
		{:else if view === 'list'}
			<div class="grid grid-cols-[2.25rem_9rem_minmax(0,1fr)_7rem_6rem_2rem] gap-x-3 border-b border-taupe3 px-1 pb-1 text-xs text-grey3">
				<span></span><span>Name</span><span>About</span><span>Relation</span><span class="text-right">Member since</span><span></span>
			</div>
			<ul class="divide-y divide-taupe3">
				{#each data.results as u (u.id)}<li><UserCard user={u} variant="row" /></li>{/each}
			</ul>
		{:else}
			<ul class="flex flex-wrap gap-5">
				{#each data.results as u (u.id)}<li><UserCard user={u} variant="icon" /></li>{/each}
			</ul>
		{/if}
		{#if data.personaResults?.length}
			<h2 class="mt-8 mb-3 text-lg font-semibold text-dark">Personae</h2>
			<ul class="flex flex-wrap gap-3">
				{#each data.personaResults as p (p.id)}<li><PersonaCard persona={p} /></li>{/each}
			</ul>
		{/if}
		<hr class="my-8 border-taupe3" />
	{/if}

	<!-- the browse rows, below any search results and narrowed to the same search -->
	{#each data.rows as row (row.key)}
		<section class="mb-8">
			<h2 class="text-lg font-semibold text-dark">{row.title}</h2>
			<p class="mb-3 text-xs text-grey3">{row.note}</p>
			{#if row.users.length || row.personae?.length}
				<!-- a new search starts its reels at the beginning -->
				{#key data.q}
					<Reel label={row.title}>
						{#each row.users as u (u.id)}<li class="shrink-0"><UserCard user={u} /></li>{/each}
						{#each row.personae ?? [] as p (p.id)}<li class="shrink-0"><PersonaCard persona={p} /></li>{/each}
					</Reel>
				{/key}
			{:else}
				<p class="rounded-md border border-dashed border-taupe3 px-3 py-4 text-sm text-grey3">{row.key === 'similarity' ? 'Not yet available.' : data.q ? 'No matches here.' : 'No one here yet.'}</p>
			{/if}
		</section>
	{/each}
</main>
