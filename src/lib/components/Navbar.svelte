<script>
	import { page } from '$app/state';
	import { Superset, UserIdCard, Gear } from '@boxicons/svelte';
	import { tip } from '#lib/utilities/menuTip.svelte.js';
	import SignInDialog from './SignInDialog.svelte';

	/** @type {{ user: { name: string, email: string } | null }} */
	let { user = null } = $props();
	let signIn;

	const pages = [
		{ href: '/exejeeze', label: 'Texts', Icon: Superset },
		{ href: '/profile', label: 'Profile', Icon: UserIdCard },
		{ href: '/settings', label: 'Settings', Icon: Gear }
	];
	const current = $derived(pages.find((p) => page.url.pathname.startsWith(p.href))?.href ?? '/exejeeze');
</script>

<!-- The vertical menu column: always at the right edge of every page. Pages put their own buttons at its top (the text viewer does); at its bottom is the triple toggle between the text viewer, the profile and the settings -->
<div class="fixed inset-y-0 right-0 z-40 w-12 border-l border-taupe2 bg-taupe1">
	<div class="absolute right-0 bottom-5 left-0 flex flex-col items-center gap-1">
		<div role="group" aria-label="Page" class="sunk-gutter flex flex-col gap-0.5 p-0.5">
			{#each pages as { href, label, Icon } (href)}
				<a
					{href}
					aria-label={label}
					aria-current={current === href ? 'page' : undefined}
					use:tip={label}
					class="inline-flex items-center justify-center rounded-md p-1 text-dark {current === href ? 'bg-taupe3' : ''}"
				><Icon /></a>
			{/each}
		</div>
		{#if !user}
			<button onclick={() => signIn.show()} class="rounded-md bg-dark px-2 py-1 text-xs font-medium text-taupe1 hover:bg-taupe5">Sign In</button>
		{/if}
	</div>
</div>

<SignInDialog bind:this={signIn} />
