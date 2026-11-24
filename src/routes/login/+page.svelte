<script>
	import { enhance } from '$app/forms';

	let { data, form } = $props();

	// the form (after a failed attempt) or the link (?mode=signup) says which side is showing
	let signup = $state(!!(form?.signup ?? data.signup));
	$effect(() => {
		signup = !!(form?.signup ?? data.signup);
	});
	let busy = $state(false);

	const field = 'rounded-md px-3 py-2';
</script>

<svelte:head><title>{signup ? 'Sign up' : 'Sign in'} · Exegeezer</title></svelte:head>

<main class="mx-auto flex min-h-screen w-full max-w-md flex-col justify-center px-6 py-10">
	<div class="rounded-2xl border border-taupe3 bg-taupe1 p-8 shadow-md">
		<h1 class="mb-1 text-2xl font-semibold text-dark">{signup ? 'Create your account' : 'Welcome back'}</h1>
		<p class="mb-6 text-sm text-grey3">{signup ? 'Sign up to load, edit and keep your own texts.' : 'Sign in to open your texts.'}</p>

		<form method="post" action="?/signInGoogle" class="mb-5">
			<button
				class="flex w-full items-center justify-center gap-3 rounded-md border border-taupe3 bg-taupe0/70 px-4 py-2.5 font-medium text-dark hover:bg-taupe2"
			>
				<svg viewBox="0 0 48 48" width="18" height="18" aria-hidden="true">
					<path fill="#EA4335" d="M24 9.5c3.5 0 6.6 1.2 9.1 3.6l6.8-6.8C35.8 2.4 30.3 0 24 0 14.6 0 6.5 5.4 2.6 13.2l7.9 6.1C12.4 13.6 17.7 9.5 24 9.5z" />
					<path fill="#4285F4" d="M46.5 24.5c0-1.6-.1-3.1-.4-4.5H24v9h12.7c-.6 3-2.3 5.5-4.8 7.2l7.6 5.9c4.4-4.1 7-10.1 7-17.6z" />
					<path fill="#FBBC05" d="M10.5 28.7a14.5 14.5 0 0 1 0-9.4l-7.9-6.1a24 24 0 0 0 0 21.6l7.9-6.1z" />
					<path fill="#34A853" d="M24 48c6.5 0 11.9-2.1 15.9-5.8l-7.6-5.9c-2.1 1.4-4.8 2.3-8.3 2.3-6.3 0-11.6-4.1-13.5-9.8l-7.9 6.1C6.5 42.6 14.6 48 24 48z" />
				</svg>
				Continue with Google
			</button>
		</form>

		<div class="mb-5 flex items-center gap-3 text-xs text-grey3">
			<hr class="flex-1 border-taupe3" /> or <hr class="flex-1 border-taupe3" />
		</div>

		<form
			method="post"
			action={signup ? '?/signUpEmail' : '?/signInEmail'}
			use:enhance={() => {
				busy = true;
				return async ({ update }) => {
					await update({ reset: false });
					busy = false;
				};
			}}
			class="flex flex-col gap-4"
		>
			{#if signup}
				<label class="flex flex-col gap-1 text-sm font-medium text-dark">
					Name
					<input name="name" autocomplete="name" value={form?.name ?? ''} class={field} />
				</label>
			{/if}
			<label class="flex flex-col gap-1 text-sm font-medium text-dark">
				Email
				<input type="email" name="email" autocomplete="email" value={form?.email ?? ''} class={field} />
			</label>
			<label class="flex flex-col gap-1 text-sm font-medium text-dark">
				Password
				<input type="password" name="password" autocomplete={signup ? 'new-password' : 'current-password'} class={field} />
				{#if signup}<span class="text-xs font-normal text-grey3">At least 8 characters.</span>{/if}
			</label>

			{#if form?.step === 'verify'}<p class="text-sm text-dark">We sent a confirmation link to {form.email}. Click it, then sign in.</p>{/if}
			{#if form?.message}<p role="alert" class="text-sm text-red">{form.message}</p>{/if}

			<button disabled={busy} class="rounded-md bg-dark px-4 py-2.5 font-medium text-taupe1 hover:bg-taupe5 disabled:opacity-50">
				{signup ? 'Sign up' : 'Sign in'}
			</button>
		</form>

		<p class="mt-6 text-center text-sm text-grey3">
			{#if signup}
				Already have an account? <a href="/login" onclick={(e) => { e.preventDefault(); signup = false; }} class="font-medium text-dark underline">Sign in</a>
			{:else}
				New here? <a href="/login?mode=signup" onclick={(e) => { e.preventDefault(); signup = true; }} class="font-medium text-dark underline">Create an account</a>
			{/if}
		</p>
	</div>
</main>
