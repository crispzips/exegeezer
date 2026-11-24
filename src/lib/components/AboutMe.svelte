<script>
	import { enhance } from '$app/forms';
	import { invalidateAll } from '$app/navigation';
	import { definitionsOf, isDefinition, renderMarkdown } from '#lib/utilities/renderMarkdown.js';
	import { tip } from '#lib/utilities/menuTip.svelte.js';
	import { Edit } from '@boxicons/svelte';

	/**
	 * The user's "about me": Markdown they write (images and code work), or one of their own published, public texts.
	 * @type {{ about: { markdown: string, textId: string | null, text: { id: string, title: string, items: { id: string, text: string }[] } | null, choices: { id: string, title: string }[] }, message?: string, draftMarkdown?: string }}
	 */
	let { about, message, draftMarkdown } = $props();
	let editing = $state(false);
	let busy = $state(false);
	/** 'markdown' (write it here) or 'text' (use a published text) */
	let mode = $state(/** @type {'markdown' | 'text'} */ ('markdown'));
	let markdown = $state('');
	let textId = $state('');
	let preview = $state(false);

	function startEdit() {
		markdown = draftMarkdown ?? about.markdown;
		textId = about.textId ?? about.choices[0]?.id ?? '';
		mode = about.textId ? 'text' : 'markdown';
		preview = false;
		editing = true;
	}
	const written = $derived(about.markdown.trim());
	const textDefs = $derived(about.text ? definitionsOf(about.text.items) : null);
</script>

<section aria-label="About" class="text-sm">
	<div class="mb-2 flex items-center justify-between gap-2">
		<h2 class="font-medium text-dark">About</h2>
		{#if !editing}
			<button type="button" onclick={startEdit} aria-label="Edit about" use:tip={'Edit about'} class="rounded-md p-1 hover:bg-taupe2"><Edit width={18} height={18} /></button>
		{/if}
	</div>

	{#if editing}
		<form
			method="post"
			action="?/updateAbout"
			use:enhance={() => {
				busy = true;
				return async ({ result, update }) => {
					await update({ reset: false });
					await invalidateAll();
					if (result.type === 'success') editing = false;
					busy = false;
				};
			}}
			class="flex flex-col gap-3"
		>
			<input type="hidden" name="mode" value={mode} />
			<div role="group" aria-label="What your about shows" class="flex gap-1">
				<button type="button" aria-pressed={mode === 'markdown'} onclick={() => (mode = 'markdown')} class="rounded-md px-3 py-1 {mode === 'markdown' ? 'bg-taupe3 text-dark' : 'text-grey3 hover:bg-taupe2'}">Write it</button>
				<button type="button" aria-pressed={mode === 'text'} onclick={() => (mode = 'text')} class="rounded-md px-3 py-1 {mode === 'text' ? 'bg-taupe3 text-dark' : 'text-grey3 hover:bg-taupe2'}">Use a published text</button>
			</div>

			{#if mode === 'markdown'}
				<input type="hidden" name="about" value={markdown} />
				<div class="flex gap-1 text-xs">
					<button type="button" aria-pressed={!preview} onclick={() => (preview = false)} class="rounded-md px-2 py-0.5 {!preview ? 'bg-taupe2 text-dark' : 'text-grey3 hover:bg-taupe2'}">Markdown</button>
					<button type="button" aria-pressed={preview} onclick={() => (preview = true)} class="rounded-md px-2 py-0.5 {preview ? 'bg-taupe2 text-dark' : 'text-grey3 hover:bg-taupe2'}">Preview</button>
				</div>
				{#if preview}
					<div class="md min-h-24 rounded-md px-2 py-1">{#if markdown.trim()}{@html renderMarkdown(markdown)}{:else}<span class="text-grey3">Nothing yet.</span>{/if}</div>
				{:else}
					<textarea bind:value={markdown} rows="10" maxlength="50000" placeholder="Write about yourself in Markdown: links, ![images](https://…), and ``` code blocks ```." class="rounded-md px-2 py-1 font-mono text-sm"></textarea>
				{/if}
				<p class="text-xs text-grey3">Images are added by web address.</p>
			{:else if about.choices.length}
				<input type="hidden" name="about" value={markdown} />
				<label class="flex flex-col gap-1">
					<span class="text-grey3">One of your published, public texts</span>
					<select name="textId" bind:value={textId} class="rounded-md px-2 py-1">
						{#each about.choices as c (c.id)}<option value={c.id}>{c.title}</option>{/each}
					</select>
				</label>
			{:else}
				<p class="text-grey3">You have no published, public texts yet. A text appears here once its production status is "published" and its visibility is "public".</p>
			{/if}

			{#if message}<p role="alert" class="text-red">{message}</p>{/if}
			<div class="flex gap-2">
				<button disabled={busy || (mode === 'text' && !about.choices.length)} class="rounded-md bg-accent px-3 py-1.5 font-medium text-on-accent hover:bg-accent/90 disabled:opacity-50">Save</button>
				<button type="button" onclick={() => (editing = false)} class="rounded-md px-3 py-1.5 hover:bg-taupe2">Cancel</button>
			</div>
		</form>
	{:else if about.text && textDefs}
		<div class="rounded-md border border-taupe3 p-3">
			<p class="mb-2 text-xs text-grey3">From the published text <a href="/exejeeze?text={about.text.id}" class="underline">{about.text.title}</a></p>
			<div class="md flex flex-col gap-2">
				{#each about.text.items as item (item.id)}
					{#if !isDefinition(item.text)}<div>{@html renderMarkdown(item.text, textDefs, `about-${item.id}`)}</div>{/if}
				{/each}
			</div>
		</div>
	{:else if written}
		<div class="md flex flex-col gap-2 px-2">{@html renderMarkdown(about.markdown)}</div>
	{:else}
		<p class="px-2 text-grey3">Nothing here yet.</p>
	{/if}
</section>
