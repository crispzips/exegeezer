<script>
	import { enhance } from '$app/forms';

	let { data, form } = $props();
	let busy = $state(false);
	const field = 'rounded-md px-3 py-2';
</script>

<svelte:head><title>Settings · Exegeezer</title></svelte:head>

<main class="mx-auto w-full max-w-md px-6 py-10">
	<div class="rounded-2xl border border-taupe3 bg-taupe1 p-8 shadow-md">
		<h1 class="mb-6 text-2xl font-semibold text-dark">Settings</h1>

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
