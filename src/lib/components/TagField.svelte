<script>
	import { untrack } from 'svelte';
	import { cleanTagName, matchForm } from '#lib/tagNames.js';

	/**
	 * The tags on one of the user's texts or personae, and the field for adding more. While a name is being typed, tags
	 * from the global sets that might serve in its place are offered. Changes are saved as they are made.
	 *
	 * @type {{ kind: 'text' | 'persona', id: string }}
	 */
	let { kind, id } = $props();

	/** @typedef {{ id: string, name: string, global: boolean }} Tag */
	/** @typedef {{ id: string, name: string, set: string, broader: string | null, covers: string | null }} Found */

	let tags = $state(/** @type {Tag[]} */ ([]));
	let credits = $state(
		/** @type {{ attribution: string | null, licenseUrl: string | null }[]} */ ([])
	);
	let found = $state(/** @type {Found[]} */ ([]));
	let typed = $state('');
	let message = $state('');
	let loaded = $state(false);
	let busy = $state(false);
	/** @type {HTMLInputElement | undefined} */
	let input = $state();

	const url = $derived(`/api/tags/${kind}/${id}`);
	const clean = $derived(cleanTagName(typed));
	/** whether what is typed is the name of an offered tag (and so there is nothing new to create) */
	const exact = $derived(found.some((t) => matchForm(t.name) === matchForm(clean)));

	$effect(() => {
		const at = url;
		untrack(() => {
			tags = [];
			typed = '';
			loaded = false;
			send(at);
		});
	});

	// search as the name is typed: after a short pause, dropping any answer to an earlier spelling
	$effect(() => {
		const query = clean;
		if (query.length < 2) {
			found = [];
			return;
		}
		const stop = new AbortController();
		const timer = setTimeout(async () => {
			try {
				const res = await fetch(`/api/tags/search?q=${encodeURIComponent(query)}`, {
					signal: stop.signal
				});
				if (res.ok) found = (await res.json()).tags;
			} catch {
				// superseded, or offline: the tag can still be created
			}
		}, 150);
		return () => {
			clearTimeout(timer);
			stop.abort();
		};
	});

	/**
	 * Loads the work's tags, or changes them.
	 * @param {string} at
	 * @param {'GET' | 'POST' | 'DELETE'} [method]
	 * @param {{ tagId?: string, name?: string }} [choice]
	 */
	async function send(at, method = 'GET', choice) {
		message = '';
		try {
			const res = await fetch(at, {
				method,
				headers: choice && { 'content-type': 'application/json' },
				body: choice && JSON.stringify(choice)
			});
			if (!res.ok) throw new Error(`${res.status}`);
			const state = await res.json();
			if (at !== url) return false;
			({ tags, credits } = state);
			loaded = true;
			return true;
		} catch {
			if (at === url)
				message = method === 'GET' ? 'Could not load the tags.' : 'Could not change the tags.';
			return false;
		}
	}

	/** @param {{ tagId?: string, name?: string }} choice */
	async function add(choice) {
		if (busy) return;
		busy = true;
		if (await send(url, 'POST', choice)) typed = '';
		busy = false;
		// the button pressed may be gone: carry on typing
		input?.focus();
	}

	/** @param {Tag} tag */
	async function remove(tag) {
		if (busy) return;
		busy = true;
		await send(url, 'DELETE', { tagId: tag.id });
		busy = false;
		input?.focus();
	}

	/**
	 * Enter does nothing here (a new tag is made only by choosing “Create new tag”) and mustn't submit the form around;
	 * Escape clears what is typed without closing the dialog around.
	 */
	function onkeydown(/** @type {KeyboardEvent} */ e) {
		if (e.key === 'Enter') {
			e.preventDefault();
		} else if (e.key === 'Escape' && typed) {
			e.preventDefault();
			e.stopPropagation();
			typed = '';
		}
	}
</script>

<!-- eslint-disable svelte/no-navigation-without-resolve -- the licence links leave the app for an outside site -->
<div class="flex flex-col gap-1.5 text-sm">
	<span class="text-grey3">Tags</span>
	{#if tags.length}
		<div class="flex flex-wrap items-center gap-1">
			{#each tags as tag (tag.id)}
				<span class="flex items-center gap-1 rounded-full bg-taupe2 py-0.5 pr-1 pl-2 text-xs">
					{tag.name}
					<button
						type="button"
						onclick={() => remove(tag)}
						aria-label="Remove tag {tag.name}"
						class="flex size-4 items-center justify-center rounded-full hover:bg-taupe3">×</button
					>
				</span>
			{/each}
		</div>
	{/if}
	<input
		bind:this={input}
		bind:value={typed}
		{onkeydown}
		disabled={!loaded}
		maxlength="200"
		autocomplete="off"
		aria-label="Add a tag"
		placeholder="Add a tag…"
		class="w-full rounded-md px-2 py-1"
	/>
	{#if clean}
		<ul
			class="raised max-h-56 overflow-y-auto rounded-md py-1"
			aria-label="Tags you could use"
			aria-live="polite"
		>
			{#each found as tag (tag.id)}
				<li class="px-1">
					<button
						type="button"
						onclick={() => add({ tagId: tag.id })}
						disabled={busy || !loaded}
						class="w-full rounded-md px-1 py-1 text-left hover:bg-taupe2 disabled:opacity-50"
					>
						<span class="block break-words">{tag.name}</span>
						<span class="block text-xs text-grey3">
							{tag.broader ? `${tag.broader} · ` : ''}{tag.set}{tag.covers
								? ` · covers “${tag.covers}”`
								: ''}
						</span>
					</button>
				</li>
			{/each}
			{#if !exact}
				<li class="px-1">
					<button
						type="button"
						onclick={() => add({ name: clean })}
						disabled={busy || !loaded}
						class="w-full rounded-md px-1 py-1 text-left hover:bg-taupe2 disabled:opacity-50"
					>
						<span class="block">Create new tag</span>
						<span class="block text-xs break-words text-grey3">{clean}</span>
					</button>
				</li>
			{/if}
		</ul>
	{/if}
	{#if message}<p role="alert" class="text-red">{message}</p>{/if}
	{#if found.length || tags.some((t) => t.global)}
		<p class="text-xs text-grey3">
			{#each credits as credit (credit.attribution)}
				{#if credit.attribution}
					<a href={credit.licenseUrl} target="_blank" rel="noopener noreferrer" class="underline"
						>{credit.attribution}</a
					>
				{/if}
			{/each}
		</p>
	{/if}
</div>
