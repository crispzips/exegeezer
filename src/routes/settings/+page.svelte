<script>
	import { enhance } from '$app/forms';
	import { THEMES, currentTheme, setTheme } from '#lib/theme.js';
	import { onMount } from 'svelte';

	let { data, form } = $props();
	let busy = $state(false);
	const field = 'rounded-md px-3 py-2';
	let theme = $state('taupe');
	const picked = $derived(THEMES.find((t) => t.id === theme));
	onMount(() => (theme = currentTheme()));
</script>

<svelte:head><title>Settings · Exegeezer</title></svelte:head>

<main class="mx-auto w-full max-w-xl bg-taupe1 px-6 py-10">
	<div class="rounded-2xl border border-taupe3 bg-taupe1 p-8 shadow-md">
		<h1 class="mb-6 text-2xl font-semibold text-dark">Settings</h1>

		<h2 class="mb-3 font-medium text-dark">Appearance</h2>
		<div role="radiogroup" aria-label="Theme" class="mb-8 grid grid-cols-3 gap-2 sm:grid-cols-6">
			{#each THEMES as t (t.id)}
				<button
					type="button"
					role="radio"
					aria-checked={theme === t.id}
					onclick={() => { theme = t.id; setTheme(t.id); }}
					data-theme={t.id}
					class="theme-card flex flex-col items-center gap-2 rounded-lg border-2 p-3 text-sm {theme === t.id ? 'selected' : ''}"
				>
					<span class="theme-swatch flex h-10 w-full items-end gap-1 rounded-md border p-1.5" aria-hidden="true">
						<span class="h-full w-1/3 rounded-sm" style="background: var(--sw5)"></span>
						<span class="h-2/3 w-1/3 rounded-sm" style="background: var(--sw3)"></span>
						<span class="h-1/3 w-1/3 rounded-sm" style="background: var(--sw4)"></span>
					</span>
					<span class="text-xs font-medium">{t.label}</span>
				</button>
			{/each}
		</div>
		<p class="-mt-5 mb-8 text-xs text-grey3">
			{picked?.hint}. Remembered on this device.
			{#each picked?.credit ?? [] as c (c.url)}
				<br />Adapted from <a href={c.url} target="_blank" rel="noreferrer" class="underline">{c.text}</a> by {c.by}.
			{/each}
		</p>

		{#if data.hasPassword}
			<h2 class="mb-3 font-medium text-dark">Change password</h2>
			<form
				method="post"
				action="?/changePassword"
				use:enhance={() => {
					busy = true;
					return async ({ update }) => {
						await update();
						busy = false;
					};
				}}
				class="flex flex-col gap-4"
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
				{#if form?.message}<p role="alert" class="text-sm text-red">{form.message}</p>{/if}
				{#if form?.saved}<p class="text-sm text-grey3">Password changed.</p>{/if}
				<button disabled={busy} class="rounded-md bg-dark px-4 py-2.5 font-medium text-taupe1 hover:bg-taupe5 disabled:opacity-50">Change password</button>
			</form>
		{:else}
			<p class="text-sm text-grey3">You sign in with Google, so there is no password to change here.</p>
		{/if}
	</div>
</main>

<style>
	/* Each theme card (the button and the swatch in it) is a fixed picture of its own theme: nothing about it
	   (fill, edge, text, hover) follows the theme that is active. The selected one is marked by a solid edge in its own ink. */
	.theme-card {
		background: var(--sw-bg);
		color: var(--sw5);
		border-color: color-mix(in srgb, var(--sw5) 20%, transparent);
	}
	.theme-card.selected { border-color: var(--sw5); }
	.theme-swatch { border-color: color-mix(in srgb, var(--sw5) 25%, transparent); }
	.theme-card[data-theme='taupe'] { --sw5: #3e2415; --sw4: #9a7b55; --sw3: #d3c3a1; --sw-bg: #fdf6e3; }
	.theme-card[data-theme='soft'] { --sw5: #575279; --sw4: #9893a5; --sw3: #dfdad9; --sw-bg: #faf4ed; }
	.theme-card[data-theme='dark'] { --sw5: #eee8d5; --sw4: #586e75; --sw3: #2a4f5b; --sw-bg: #002b36; }
	.theme-card[data-theme='rose'] { --sw5: #3b3845; --sw4: #dc7fc4; --sw3: #d3a3ab; --sw-bg: #f6d7db; }
	.theme-card[data-theme='fluorescent'] { --sw5: #000000; --sw4: #00b300; --sw3: #0000ff; --sw-bg: #ffffff; }
	.theme-card[data-theme='cyber'] { --sw5: #39ff88; --sw4: #1fb85e; --sw3: #1a4a35; --sw-bg: #090c12; }
</style>
