<script>
	import { goto } from '$app/navigation';
	import { Search, ListUl, Grid, X } from '@boxicons/svelte';
	import UserCard from '#lib/components/UserCard.svelte';
	import { tip } from '#lib/utilities/menuTip.svelte.js';

	let { data, form } = $props();
	let draft = $state(data.q);
	/** 'list' | 'icons': how search results are shown */
	let view = $state(/** @type {'list' | 'icons'} */ ('list'));

	function search(/** @type {SubmitEvent} */ e) {
		e.preventDefault();
		const q = draft.trim();
		goto(q ? `/community?q=${encodeURIComponent(q)}` : '/community', { keepFocus: true });
	}
	function clear() {
		draft = '';
		goto('/community', { keepFocus: true });
	}
</script>

<svelte:head><title>Community · Exegeezer</title></svelte:head>

<main class="mx-auto w-full max-w-5xl px-6 py-10">
	<h1 class="mb-4 text-2xl font-semibold text-dark">Community</h1>

	<div class="mb-6 flex items-center gap-2">
		<form onsubmit={search} role="search" class="relative flex-1">
			<Search size="sm" class="pointer-events-none absolute top-1/2 left-2.5 -translate-y-1/2" />
			<input type="search" bind:value={draft} placeholder="Search users by name, about or persona" aria-label="Search users" class="w-full rounded-md py-1.5 pr-8 pl-8 text-sm" />
			{#if draft}
				<button type="button" onclick={clear} aria-label="Clear search" class="absolute top-1/2 right-1.5 -translate-y-1/2 rounded-md p-0.5 hover:bg-taupe2"><X size="sm" /></button>
			{/if}
		</form>
		{#if data.results}
			<div class="flex gap-1" role="group" aria-label="View">
				<button onclick={() => (view = 'list')} aria-label="List view" aria-pressed={view === 'list'} use:tip={'List view'} class="rounded-md p-1 {view === 'list' ? 'bg-taupe2' : 'hover:bg-taupe2'}"><ListUl width={18} height={18} /></button>
				<button onclick={() => (view = 'icons')} aria-label="Icon view" aria-pressed={view === 'icons'} use:tip={'Icon view'} class="rounded-md p-1 {view === 'icons' ? 'bg-taupe2' : 'hover:bg-taupe2'}"><Grid width={18} height={18} /></button>
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
	{:else}
		{#each data.rows ?? [] as row (row.key)}
			<section class="mb-8">
				<h2 class="text-lg font-semibold text-dark">{row.title}</h2>
				<p class="mb-3 text-xs text-grey3">{row.note}</p>
				{#if row.users.length}
					<ul class="flex gap-3 overflow-x-auto pb-2">
						{#each row.users as u (u.id)}<li class="shrink-0"><UserCard user={u} /></li>{/each}
					</ul>
				{:else}
					<p class="rounded-md border border-dashed border-taupe3 px-3 py-4 text-sm text-grey3">{row.key === 'similarity' ? 'Not yet available.' : 'No one here yet.'}</p>
				{/if}
			</section>
		{/each}
	{/if}
</main>
