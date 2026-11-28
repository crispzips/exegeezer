<script>
	import FollowButton from '#lib/components/FollowButton.svelte';
	import PersonaPicture from '#lib/components/PersonaPicture.svelte';
	import UserCard from '#lib/components/UserCard.svelte';

	let { data, form } = $props();
	const persona = $derived(data.persona);
	const name = $derived(persona.name || 'No name');
	const texts = $derived(`${persona.publicTexts} published text${persona.publicTexts === 1 ? '' : 's'}`);
	const relation = $derived(persona.relations.join(' · '));
</script>

<svelte:head><title>{name} · Exegeezer</title></svelte:head>

<main class="mx-auto w-full max-w-3xl px-6 py-10">
	<div class="rounded-2xl border border-taupe3 bg-taupe1 p-8 shadow-md">
		<div class="flex items-center gap-4">
			<PersonaPicture image={persona.image} colors={persona.colors} size="size-20" />
			<div class="min-w-0 flex-1">
				<h1 class="truncate text-2xl font-semibold text-dark">{name}</h1>
				<p class="text-sm text-grey3">Persona · {texts}{relation ? ` · ${relation}` : ''}</p>
			</div>
			{#if persona.mine}
				<span class="shrink-0 rounded-md border border-taupe3 bg-taupe2 px-1.5 py-0.5 text-xs">Yours</span>
			{:else}
				<FollowButton field="personaId" id={persona.id} {name} following={persona.following} locked={persona.viaUser ? 'Followed with its user (unfollow the user to stop)' : ''} />
			{/if}
		</div>
		{#if form?.message}<p role="alert" class="mt-3 text-sm text-red">{form.message}</p>{/if}
		<p class="mt-4 text-sm whitespace-pre-line text-dark">{persona.bio || 'No description.'}</p>

		<hr class="my-6 border-taupe3" />
		<section aria-label="Who this persona is">
			<h2 class="mb-2 text-sm font-medium text-dark">Persona of</h2>
			{#if data.pseudonymous}
				<p class="text-sm text-grey3">{persona.mine ? "This persona is pseudonymous: others aren't shown that it is yours." : "This persona is pseudonymous: who has it isn't shown."}</p>
			{:else}
				{#if persona.mine}<p class="mb-3 text-sm text-grey3">This persona isn't pseudonymous: others are shown that it is yours.</p>{/if}
				{#if data.users.length}
					<ul class="flex flex-wrap gap-3">
						{#each data.users as u (u.id)}<li><UserCard user={u} /></li>{/each}
					</ul>
				{:else if !persona.mine}
					<p class="text-sm text-grey3">No one has this persona.</p>
				{/if}
			{/if}
		</section>
	</div>
</main>
