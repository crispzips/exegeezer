<script>
	import FollowButton from '#lib/components/FollowButton.svelte';
	import PersonaPicture from '#lib/components/PersonaPicture.svelte';
	import { tip } from '#lib/utilities/menuTip.svelte.js';

	/**
	 * A compact card for a user, in three layouts:
	 *  - 'card': a small card (picture, name, bio, relation, follow), for the browse rows
	 *  - 'row': one line of a list (the same facts in columns)
	 *  - 'icon': a picture bubble with the name under it, for the icon view
	 * The follow button submits the community page's `follow` action.
	 *
	 * @type {{
	 *   user: { id: string, name: string, image: string | null, colors: Record<string, string> | null, bio: string, publicTexts: number, memberSince: string, relations: string[], following: boolean },
	 *   variant?: 'card' | 'row' | 'icon'
	 * }}
	 */
	let { user, variant = 'card' } = $props();

	const name = $derived(user.name || 'No name');
	const since = $derived(new Date(user.memberSince).toLocaleDateString(undefined, { dateStyle: 'medium' }));
	const texts = $derived(`${user.publicTexts} published text${user.publicTexts === 1 ? '' : 's'}`);
	const relation = $derived(user.relations.join(' · '));
</script>

{#snippet avatar(/** @type {string} */ size)}
	<PersonaPicture image={user.image} colors={user.colors} {size} />
{/snippet}

{#if variant === 'card'}
	<article class="flex w-56 shrink-0 flex-col gap-2 rounded-xl border border-taupe3 bg-taupe1 p-3 shadow-sm">
		<div class="flex items-center gap-2">
			{@render avatar('size-10')}
			<div class="min-w-0 flex-1">
				<p class="truncate text-sm font-medium text-dark">{name}</p>
				<p class="truncate text-xs text-grey3">{texts}</p>
			</div>
		</div>
		<p class="line-clamp-3 min-h-12 text-xs text-dark">{user.bio || '—'}</p>
		<div class="flex items-center justify-between gap-2">
			<span class="min-w-0 truncate text-xs text-grey3" use:tip={relation || 'No relation yet'}>{relation || ' '}</span>
			<FollowButton field="userId" id={user.id} {name} following={user.following} />
		</div>
	</article>
{:else if variant === 'row'}
	<div class="grid grid-cols-[2.25rem_9rem_minmax(0,1fr)_7rem_6rem_2rem] items-center gap-x-3 rounded-md px-1 py-1.5 hover:bg-taupe2">
		{@render avatar('size-9')}
		<span class="truncate text-sm font-medium text-dark">{name}</span>
		<span class="truncate text-xs text-dark" use:tip={user.bio || ''}>{user.bio || '—'}</span>
		<span class="truncate text-xs text-grey3" use:tip={relation || ''}>{relation || '—'}</span>
		<span class="truncate text-right text-xs text-grey3">{since}</span>
		<span class="flex justify-end"><FollowButton field="userId" id={user.id} {name} following={user.following} /></span>
	</div>
{:else}
	<div class="relative flex w-20 flex-col items-center gap-1.5" use:tip={[name, texts, relation].filter(Boolean).join(' · ')}>
		{@render avatar('size-16')}
		<span class="w-full truncate rounded-2xl border border-taupe3 bg-taupe1 px-2 py-1 text-center text-xs text-taupe5 shadow-lg">{name}</span>
		<FollowButton field="userId" id={user.id} {name} following={user.following} />
	</div>
{/if}
