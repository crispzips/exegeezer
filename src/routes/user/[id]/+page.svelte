<script>
	import FollowButton from '#lib/components/FollowButton.svelte';
	import PersonaCard from '#lib/components/PersonaCard.svelte';
	import PersonaPicture from '#lib/components/PersonaPicture.svelte';
	import { definitionsOf, isDefinition, renderMarkdown } from '#lib/utilities/renderMarkdown.js';

	let { data, form } = $props();
	const user = $derived(data.user);
	const name = $derived(user.name || 'No name');
	const since = $derived(new Date(user.memberSince).toLocaleDateString(undefined, { dateStyle: 'long' }));
	const texts = $derived(`${user.publicTexts} published text${user.publicTexts === 1 ? '' : 's'}`);
	const relation = $derived(user.relations.join(' · '));
	const textDefs = $derived(data.about.text ? definitionsOf(data.about.text.items) : undefined);
</script>

<svelte:head><title>{name} · Exegeezer</title></svelte:head>

<main class="mx-auto w-full max-w-3xl px-6 py-10">
	<div class="rounded-2xl border border-taupe3 bg-taupe1 p-8 shadow-md">
		<div class="flex items-center gap-4">
			<PersonaPicture image={user.image} colors={user.colors} size="size-20" />
			<div class="min-w-0 flex-1">
				<h1 class="truncate text-2xl font-semibold text-dark">{name}</h1>
				<p class="text-sm text-grey3">Member since {since} · {texts}{relation ? ` · ${relation}` : ''}</p>
			</div>
			<FollowButton field="userId" id={user.id} {name} following={user.following} />
		</div>
		{#if form?.message}<p role="alert" class="mt-3 text-sm text-red">{form.message}</p>{/if}
		{#if user.bio}<p class="mt-4 text-sm whitespace-pre-line text-dark">{user.bio}</p>{/if}

		<hr class="my-6 border-taupe3" />
		<section aria-label="About" class="text-sm">
			<h2 class="mb-2 font-medium text-dark">About</h2>
			{#if data.about.text}
				<div class="rounded-md border border-taupe3 p-3">
					<p class="mb-2 text-xs text-grey3">From the published text “{data.about.text.title}”</p>
					<div class="md flex flex-col gap-2">
						{#each data.about.text.items as item (item.id)}
							{#if !isDefinition(item.text)}<div>{@html renderMarkdown(item.text, textDefs, `about-${item.id}`)}</div>{/if}
						{/each}
					</div>
				</div>
			{:else if data.about.markdown.trim()}
				<div class="md flex flex-col gap-2">{@html renderMarkdown(data.about.markdown)}</div>
			{:else}
				<p class="text-grey3">Nothing here yet.</p>
			{/if}
		</section>

		{#if data.personae.length}
			<hr class="my-6 border-taupe3" />
			<section aria-label="Personae">
				<h2 class="mb-2 text-sm font-medium text-dark">Personae</h2>
				<ul class="flex flex-wrap gap-3">
					{#each data.personae as p (p.id)}<li><PersonaCard persona={p} /></li>{/each}
				</ul>
			</section>
		{/if}
	</div>
</main>
