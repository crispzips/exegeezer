<script>
	import { invalidateAll } from '$app/navigation';

	/**
	 * What is waiting for agreement (the user's, or others' on something the user asked), and the renunciations the
	 * user's personae have made.
	 *
	 * @type {{
	 *   requests: { id: string, textId: string | null, title: string | null, authors: string[], persona: string | null, what: string, mine: boolean, agreed: number, needed: number, awaitingMe: boolean }[],
	 *   renunciations: { textId: string, personaId: string, persona: string, title: string, visibility: string, extreme: boolean, createdAt: string }[]
	 * }}
	 */
	let { requests, renunciations } = $props();

	let message = $state('');
	let busy = $state(false);
	const day = (/** @type {string} */ iso) => new Date(iso).toLocaleDateString(undefined, { dateStyle: 'medium' });

	/** @param {string} url @param {unknown} body */
	async function send(url, body) {
		if (busy) return;
		busy = true;
		message = '';
		try {
			const res = await fetch(url, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });
			const answer = await res.json().catch(() => null);
			if (!res.ok || answer?.message) message = answer?.message ?? 'Could not do that.';
			await invalidateAll();
		} catch {
			message = 'Could not do that.';
		} finally {
			busy = false;
		}
	}

	/** @param {(typeof requests)[number]} r */
	function agree(r) {
		const burning = r.what === 'Burn' || r.what.includes('extreme prejudice');
		if (burning && !confirm(`${r.what}: this can never be undone. Agree?`)) return;
		if (r.what.includes('“published”') && !confirm('Publishing is for good: a published, public text can never be deleted. Agree?')) return;
		send(`/api/proposals/${r.id}`, { agree: true });
	}
</script>

<div class="flex flex-col gap-3 text-sm">
	{#if message}<p role="status">{message}</p>{/if}
	<section aria-label="Waiting for agreement">
		<h2 class="mb-1 font-medium text-dark">Waiting for agreement</h2>
		{#if requests.length}
			<ul class="divide-y divide-taupe3">
				{#each requests as r (r.id)}
					<li class="flex flex-wrap items-center gap-2 py-2">
						<div class="min-w-0 flex-1">
							<p class="text-dark">{r.what}{r.persona ? `, as ${r.persona}` : ''}</p>
							<p class="text-xs text-grey3">
								{#if r.textId}<a href="/exejeeze?text={r.textId}" class="underline">{r.title}</a>{r.authors.length ? ` by ${r.authors.join(', ')}` : ''} · {/if}{r.agreed} of {r.needed} agreed
							</p>
						</div>
						{#if r.awaitingMe}
							<button type="button" disabled={busy} onclick={() => agree(r)} class="rounded-md bg-accent px-3 py-1 font-medium text-on-accent hover:bg-accent/90 disabled:opacity-50">Agree</button>
							<button type="button" disabled={busy} onclick={() => send(`/api/proposals/${r.id}`, { agree: false })} class="rounded-md border border-taupe3 px-3 py-1 hover:bg-taupe2">Decline</button>
						{:else}
							<button type="button" disabled={busy} onclick={() => send(`/api/proposals/${r.id}`, { agree: false })} class="rounded-md border border-taupe3 px-3 py-1 hover:bg-taupe2">{r.mine ? 'Withdraw' : 'Decline'}</button>
						{/if}
					</li>
				{/each}
			</ul>
		{:else}
			<p class="text-grey3">Nothing is waiting.</p>
		{/if}
	</section>

	{#if renunciations.length}
		<hr class="border-taupe3" />
		<section aria-label="Renunciations">
			<h2 class="mb-1 font-medium text-dark">Renunciations</h2>
			<ul class="divide-y divide-taupe3">
				{#each renunciations as r (r.textId + r.personaId)}
					<li class="flex flex-wrap items-center gap-2 py-2">
						<div class="min-w-0 flex-1">
							<p>{#if r.visibility === 'public'}<a href="/exejeeze?text={r.textId}" class="text-dark underline">{r.title}</a>{:else}<span class="text-dark">{r.title}</span>{/if}</p>
							<p class="text-xs text-grey3">{r.persona}, {day(r.createdAt)}{r.extreme ? ' · with extreme prejudice' : ''}</p>
						</div>
						{#if !r.extreme}
							<button type="button" disabled={busy} onclick={() => send(`/api/texts/${r.textId}/repress`, { action: 'unrenounce', personaId: r.personaId })} class="rounded-md border border-taupe3 px-3 py-1 hover:bg-taupe2">Undo</button>
						{/if}
					</li>
				{/each}
			</ul>
		</section>
	{/if}
</div>
