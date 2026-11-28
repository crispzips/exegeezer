<script>
	/**
	 * A field that finds users or personae by name: type two letters or more and pick from what is offered.
	 *
	 * @type {{ url: string, label: string, onpick: (found: { id: string, name: string }) => void, exclude?: string[] }}
	 */
	let { url, label, onpick, exclude = [] } = $props();

	let typed = $state('');
	let found = $state(/** @type {{ id: string, name: string }[]} */ ([]));
	const offered = $derived(found.filter((f) => !exclude.includes(f.id)));

	// search after a short pause, dropping any answer to an earlier spelling
	$effect(() => {
		const query = typed.trim();
		const at = url;
		if (query.length < 2) {
			found = [];
			return;
		}
		const stop = new AbortController();
		const timer = setTimeout(async () => {
			try {
				const res = await fetch(`${at}?q=${encodeURIComponent(query)}`, { signal: stop.signal });
				if (res.ok) found = (await res.json()).found;
			} catch {
				// superseded, or offline
			}
		}, 150);
		return () => {
			clearTimeout(timer);
			stop.abort();
		};
	});

	/** @param {{ id: string, name: string }} person */
	function pick(person) {
		typed = '';
		found = [];
		onpick(person);
	}
</script>

<div class="flex flex-col gap-1">
	<!-- Enter must not submit the form around the field -->
	<input bind:value={typed} placeholder={label} aria-label={label} onkeydown={(e) => e.key === 'Enter' && e.preventDefault()} class="w-full rounded-md px-2 py-1" />
	{#if offered.length}
		<ul class="raised max-h-40 overflow-y-auto rounded-md py-1 shadow-md">
			{#each offered as f (f.id)}
				<li><button type="button" onclick={() => pick(f)} class="w-full px-2 py-1 text-left hover:bg-taupe2">{f.name}</button></li>
			{/each}
		</ul>
	{/if}
</div>
