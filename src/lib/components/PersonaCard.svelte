<script>
	import FollowButton from '#lib/components/FollowButton.svelte';
	import PersonaPicture from '#lib/components/PersonaPicture.svelte';

	/**
	 * A compact card for a persona (picture, name, description, relation). The name opens the persona's page.
	 * Another user's persona has a follow button; one followed through its user can only be unfollowed there.
	 *
	 * @type {{ persona: { id: string, name: string, image: string | null, colors: Record<string, string> | null, bio: string, publicTexts: number, mine: boolean, relations: string[], following: boolean, viaUser: boolean } }}
	 */
	let { persona } = $props();

	const texts = $derived(`${persona.publicTexts} published text${persona.publicTexts === 1 ? '' : 's'}`);
	const name = $derived(persona.name || 'No name');
	const relation = $derived(persona.relations.join(' · '));
</script>

<article class="flex w-56 shrink-0 flex-col gap-2 rounded-xl border border-taupe3 bg-taupe1 p-3 shadow-sm">
	<div class="flex items-center gap-2">
		<PersonaPicture image={persona.image} colors={persona.colors} size="size-10" />
		<div class="min-w-0 flex-1">
			<a href="/persona/{persona.id}" class="block truncate text-sm font-medium text-dark hover:underline">{name}</a>
			<p class="truncate text-xs text-grey3">{texts}</p>
		</div>
		{#if persona.mine}<span class="shrink-0 rounded-md border border-taupe3 bg-taupe2 px-1.5 py-0.5 text-xs">Yours</span>{/if}
	</div>
	<p class="line-clamp-3 min-h-12 text-xs text-dark">{persona.bio || '—'}</p>
	<div class="flex items-center justify-between gap-2">
		<p class="min-w-0 text-xs text-grey3">{relation}</p>
		{#if !persona.mine}
			<FollowButton field="personaId" id={persona.id} {name} following={persona.following} locked={persona.viaUser ? 'Followed with its user (unfollow the user to stop)' : ''} />
		{/if}
	</div>
</article>
