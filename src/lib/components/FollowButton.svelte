<script>
	import { enhance } from '$app/forms';
	import { invalidateAll } from '$app/navigation';
	import { UserPlus, UserCheck } from '@boxicons/svelte';
	import { tip } from '#lib/utilities/menuTip.svelte.js';

	/**
	 * Follow or unfollow a user or a persona, by submitting the community page's `follow` action (from any page).
	 * `locked`: why the state can't be changed here (the button then only shows it, with this as its tooltip).
	 *
	 * @type {{ field: 'userId' | 'personaId', id: string, name: string, following: boolean, locked?: string }}
	 */
	let { field, id, name, following, locked = '' } = $props();
</script>

<form
	method="post"
	action="/community?/follow"
	use:enhance={() => async ({ result, update }) => {
		// on success only reload the data: `update` would leave a search's results for the plain page
		if (result.type !== 'success') await update({ reset: false });
		await invalidateAll();
	}}
	class="shrink-0"
>
	<input type="hidden" name={field} value={id} />
	<input type="hidden" name="on" value={following ? '0' : '1'} />
	<button
		type={locked ? 'button' : 'submit'}
		aria-label={locked ? `Following ${name}` : `${following ? 'Unfollow' : 'Follow'} ${name}`}
		aria-pressed={following}
		aria-disabled={locked ? true : undefined}
		use:tip={locked || (following ? 'Following (click to unfollow)' : 'Follow')}
		class="inline-flex items-center gap-1 rounded-md border border-accent px-1.5 py-1 text-xs {following ? 'bg-accent/10 text-accent' : 'bg-accent text-on-accent'} {locked ? 'cursor-default opacity-60' : following ? 'hover:bg-accent/20' : 'hover:bg-accent/90'}"
	>
		<!-- `!` beats the app-wide icon colour, so the icon takes the button's -->
		{#if following}<UserCheck size="sm" class="text-current!" />{:else}<UserPlus size="sm" class="text-current!" />{/if}
	</button>
</form>
