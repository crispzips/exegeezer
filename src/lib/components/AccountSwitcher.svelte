<script>
	import { Group } from '@boxicons/svelte';

	/** @type {{ switcher: { accounts: { id: string, name: string, email: string }[], impersonating: boolean, adminId: string }, userId: string }} */
	let { switcher, userId } = $props();
	let open = $state(false);
	let busy = $state(false);
	let message = $state('');

	/** @param {object} body */
	async function post(body) {
		const res = await fetch('/switch', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });
		if (!res.ok) throw new Error((await res.json().catch(() => null))?.message ?? 'Could not switch.');
	}
	/** @param {string} id */
	async function switchTo(id) {
		if (id === userId || busy) return;
		busy = true;
		message = '';
		try {
			if (switcher.impersonating) await post({ stop: true });
			if (id !== switcher.adminId) await post({ userId: id });
			location.href = '/profile';
		} catch (e) {
			message = e instanceof Error ? e.message : 'Could not switch.';
			busy = false;
		}
	}
	const label = (/** @type {{ name: string, email: string }} */ a) => a.name || a.email;
</script>

<div class="fixed bottom-3 left-3 z-50 text-sm">
	{#if open}
		<div class="raised mb-2 w-72 rounded-xl p-2 shadow-lg">
			<p class="px-2 py-1 text-xs text-grey3">Switch account (admin)</p>
			<ul>
				{#each switcher.accounts as a (a.id)}
					<li>
						<button type="button" disabled={busy} onclick={() => switchTo(a.id)} aria-current={a.id === userId} class="flex w-full flex-col rounded-md px-2 py-1 text-left hover:bg-taupe2 {a.id === userId ? 'bg-taupe2' : ''}">
							<span class="truncate text-dark">{label(a)}{a.id === switcher.adminId ? ' (you)' : ''}</span>
							{#if a.name}<span class="truncate text-xs text-grey3">{a.email}</span>{/if}
						</button>
					</li>
				{/each}
			</ul>
			{#if message}<p role="alert" class="px-2 py-1 text-xs text-red">{message}</p>{/if}
		</div>
	{/if}
	<button type="button" onclick={() => (open = !open)} aria-expanded={open} class="flex items-center gap-2 rounded-full border border-taupe3 bg-taupe1 px-3 py-1.5 shadow-md hover:bg-taupe2 {switcher.impersonating ? 'text-red' : 'text-dark'}">
		<Group width={18} height={18} />
		{switcher.impersonating ? 'Viewing as another account' : 'Accounts'}
	</button>
</div>
