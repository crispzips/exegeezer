<script>
	import { invalidateAll } from '$app/navigation';
	import PeoplePicker from '#lib/components/PeoplePicker.svelte';
	import { Trash, X } from '@boxicons/svelte';
	import { tip } from '#lib/utilities/menuTip.svelte.js';

	/**
	 * The texts circulated to the user, and the user's groups to circulate to.
	 *
	 * @type {{
	 *   circulated: { id: string, title: string, authors: string[], privilege: string }[],
	 *   groups: { id: string, name: string, members: { id: string, name: string }[] }[]
	 * }}
	 */
	let { circulated, groups } = $props();

	let name = $state('');
	let message = $state('');

	/** @param {string} url @param {'POST' | 'PATCH' | 'DELETE'} method @param {unknown} [body] */
	async function send(url, method, body) {
		message = '';
		try {
			const res = await fetch(url, { method, ...(body ? { headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) } : {}) });
			if (!res.ok) throw new Error((await res.json().catch(() => null))?.message);
			await invalidateAll();
			return true;
		} catch (err) {
			message = (err instanceof Error && err.message) || 'Could not do that.';
			return false;
		}
	}

	async function create() {
		if (name.trim() && (await send('/api/groups', 'POST', { name }))) name = '';
	}
</script>

<div class="flex flex-col gap-3 text-sm">
	<section aria-label="Circulated to you">
		<h2 class="mb-1 font-medium text-dark">Circulated to you</h2>
		{#if circulated.length}
			<ul class="divide-y divide-taupe3">
				{#each circulated as t (t.id)}
					<li>
						<a href="/exejeeze?text={t.id}" class="flex items-center gap-2 rounded-md px-1 py-2 hover:bg-taupe2">
							<span class="min-w-0 flex-1 truncate text-dark">{t.title}</span>
							<span class="shrink-0 text-xs text-grey3">{t.authors.join(', ')} · {t.privilege}</span>
						</a>
					</li>
				{/each}
			</ul>
		{:else}
			<p class="text-grey3">Nothing has been circulated to you.</p>
		{/if}
	</section>
	<hr class="border-taupe3" />
	<section aria-label="Your groups" class="flex flex-col gap-2">
		<h2 class="font-medium text-dark">Your groups</h2>
		<p class="text-xs text-grey3">Only you see your groups. Circulate a text to one from the text's settings.</p>
		{#each groups as g (g.id)}
			<div class="flex flex-col gap-1 rounded-md border border-taupe3 p-2">
				<div class="flex items-center justify-between gap-2">
					<span class="font-medium text-dark">{g.name}</span>
					<button type="button" onclick={() => confirm(`Delete the group "${g.name}"? Texts circulated to it stop being shared through it.`) && send(`/api/groups/${g.id}`, 'DELETE')} aria-label="Delete {g.name}" use:tip={'Delete group'} class="rounded-md p-1 hover:bg-taupe2"><Trash width={16} height={16} /></button>
				</div>
				{#if g.members.length}
					<ul class="flex flex-wrap gap-1">
						{#each g.members as m (m.id)}
							<li class="flex items-center gap-1 rounded-full border border-taupe3 py-0.5 pr-1 pl-2">
								{m.name}
								<button type="button" onclick={() => send(`/api/groups/${g.id}`, 'PATCH', { userId: m.id, member: false })} aria-label="Take {m.name} out of {g.name}" class="rounded-full p-0.5 hover:bg-taupe2"><X width={12} height={12} /></button>
							</li>
						{/each}
					</ul>
				{:else}
					<p class="text-xs text-grey3">No members yet.</p>
				{/if}
				<PeoplePicker url="/api/search/users" label="Add a member" exclude={g.members.map((m) => m.id)} onpick={(u) => send(`/api/groups/${g.id}`, 'PATCH', { userId: u.id, member: true })} />
			</div>
		{/each}
		<form onsubmit={(e) => { e.preventDefault(); create(); }} class="flex gap-2">
			<input bind:value={name} maxlength="100" placeholder="New group name" aria-label="New group name" class="min-w-0 flex-1 rounded-md px-2 py-1" />
			<button disabled={!name.trim()} class="rounded-md border border-taupe3 bg-taupe2 px-3 py-1 font-medium hover:bg-taupe3 disabled:opacity-50">Make group</button>
		</form>
		{#if message}<p role="alert" class="text-red">{message}</p>{/if}
	</section>
</div>
