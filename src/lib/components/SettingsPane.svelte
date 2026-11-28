<script>
	// the profile page's Settings tab: appearance, and the password (its form posts to that page's `changePassword` action)
	import { ChevronDown, Biceps } from '@boxicons/svelte';
	import { slide } from 'svelte/transition';
	import { enhance } from '$app/forms';
	import { THEMES, currentTheme, setTheme } from '#lib/theme.js';
	import { onMount } from 'svelte';

	/** @type {{ hasPassword: boolean, message?: string, saved?: boolean }} */
	let { hasPassword, message, saved } = $props();
	let busy = $state(false);
	// the password form is an accordion: closed at first, open to show an error, closed again once the change succeeds
	let changing = $derived(Boolean(message));
	const field = 'rounded-md px-3 py-2';
	// The palette shown in the active theme card, read live from the theme variables in app.css.
	const BASE = ['taupe0', 'taupe1', 'taupe2', 'taupe3', 'taupe4', 'taupe5'];
	const ACCENTS = ['red', 'orange', 'yellow', 'green', 'cyan', 'blue', 'violet', 'magenta'];
	let theme = $state('taupe');
	const picked = $derived(THEMES.find((t) => t.id === theme));
	onMount(() => (theme = currentTheme()));
</script>

<h2 class="mb-3 font-medium text-dark">Appearance</h2>
<div role="radiogroup" aria-label="Theme" class="mb-8 grid grid-cols-3 items-start gap-2 sm:flex">
	{#each THEMES as t (t.id)}
		<button
			type="button"
			role="radio"
			aria-checked={theme === t.id}
			onclick={() => { theme = t.id; setTheme(t.id); }}
			data-theme={t.id}
			class="theme-card flex flex-col items-center gap-2 rounded-lg border-2 px-1.5 py-3 text-sm sm:w-20 {theme === t.id ? 'selected' : ''}"
		>
			<span class="theme-swatch flex h-10 w-full items-end gap-1 rounded-md border p-1.5" aria-hidden="true">
				<span class="h-full w-1/3 rounded-sm" style="background: var(--sw5)"></span>
				<span class="h-2/3 w-1/3 rounded-sm" style="background: var(--sw3)"></span>
				<span class="h-1/3 w-1/3 rounded-sm" style="background: var(--sw4)"></span>
			</span>
			<span class="text-xs font-medium">{t.label}</span>
			{#if theme === t.id}
				<span class="flex w-max flex-col gap-2" aria-hidden="true">
					<span class="flex">
						{#each BASE as name (name)}
							<span class="theme-chip h-3 flex-1 border-y first:rounded-l-sm first:border-l last:rounded-r-sm last:border-r" style="background: var(--color-{name})"></span>
						{/each}
					</span>
					<span class="grid grid-cols-4 gap-1">
						{#each ACCENTS as name (name)}
							<span class="theme-chip size-2.5 rounded-full border" style="background: var(--color-{name})"></span>
						{/each}
					</span>
				</span>
			{/if}
		</button>
	{/each}
</div>
<p class="-mt-5 mb-8 text-xs text-grey3">
	{picked?.hint}. Remembered on this device.
	{#each picked?.credit ?? [] as c (c.url)}
		<br />Adapted from <a href={c.url} target="_blank" rel="noreferrer" class="underline">{c.text}</a> by {c.by}.
	{/each}
</p>

<h2 class="mb-3 font-medium text-dark">Account</h2>
{#if hasPassword}
	<button
		type="button"
		onclick={() => (changing = !changing)}
		aria-expanded={changing}
		aria-controls="change-password"
		class="inline-flex items-center gap-2 rounded-md border border-taupe3 px-4 py-2.5 font-medium text-dark hover:bg-taupe2"
	>
		{#if saved}<Biceps pack="filled" width={18} height={18} class="pop-in shrink-0 text-green!" aria-hidden="true" />{/if}
		Change password
		<ChevronDown width={18} height={18} class="shrink-0 text-inherit! transition-transform {changing ? 'rotate-180' : ''}" aria-hidden="true" />
	</button>
	<span role="status" class="sr-only">{saved ? 'Password changed.' : ''}</span>
	{#if changing}
		<form
			id="change-password"
			transition:slide={{ duration: 200 }}
			method="post"
			action="?/changePassword"
			use:enhance={() => {
				busy = true;
				return async ({ result, update }) => {
					await update({ navigate: false }); // stay on this page and tab
					if (result.type === 'success') changing = false;
					busy = false;
				};
			}}
			class="flex flex-col gap-4 pt-4"
		>
			<label class="flex flex-col gap-1 text-sm font-medium text-dark">
				Current password
				<input type="password" name="current" autocomplete="current-password" class={field} />
			</label>
			<label class="flex flex-col gap-1 text-sm font-medium text-dark">
				New password
				<input type="password" name="next" autocomplete="new-password" class={field} />
				<span class="text-xs font-normal text-grey3">At least 8 characters.</span>
			</label>
			{#if message}<p role="alert" class="text-sm text-red">{message}</p>{/if}
			<button disabled={busy} class="rounded-md bg-accent px-4 py-2.5 font-medium text-on-accent hover:bg-accent/90 disabled:opacity-50">Save new password</button>
		</form>
	{/if}
{:else}
	<p class="text-sm text-grey3">You sign in with Google, so there is no password to change here.</p>
{/if}

<style>
	/* Each theme card (the button and the swatch in it) is a fixed picture of its own theme: nothing about it
	   (fill, edge, text, hover) follows the theme that is active. The selected one is marked by a solid edge in its own ink. */
	.theme-card {
		background: var(--sw-bg);
		color: var(--sw5);
		border-color: color-mix(in srgb, var(--sw5) 20%, transparent);
	}
	.theme-card.selected { border-color: var(--sw-edge, var(--sw5)); }
	.theme-swatch, .theme-chip { border-color: color-mix(in srgb, var(--sw5) 25%, transparent); }
	.theme-card[data-theme='taupe'] { --sw5: #3e2415; --sw4: #9a7b55; --sw3: #d3c3a1; --sw-bg: #fdf6e3; --sw-edge: #6c71c4; }
	.theme-card[data-theme='soft'] { --sw5: #575279; --sw4: #9893a5; --sw3: #dfdad9; --sw-bg: #faf4ed; }
	.theme-card[data-theme='dark'] { --sw5: #eee8d5; --sw4: #586e75; --sw3: #2a4f5b; --sw-bg: #002b36; }
	.theme-card[data-theme='rose'] { --sw5: #3b3845; --sw4: #dc7fc4; --sw3: #d3a3ab; --sw-bg: #f6d7db; }
	.theme-card[data-theme='fluorescent'] { --sw5: #000000; --sw4: #00ff00; --sw3: #0000ff; --sw-bg: #ffffff; }
	.theme-card[data-theme='cyber'] { --sw5: #39ff88; --sw4: #1fb85e; --sw3: #1a4a35; --sw-bg: #090c12; }
</style>
