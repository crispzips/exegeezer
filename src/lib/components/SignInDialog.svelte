<script>
	import { deserialize } from '$app/forms';

	let dialog;
	/** 'email' (ask for the address) → 'signin' (known account: password) or 'signup' (new: name and password) */
	let step = $state('email');
	let email = $state('');
	let message = $state('');
	let busy = $state(false);

	export function show() {
		step = 'email';
		email = '';
		message = '';
		dialog.showModal();
	}

	const field = 'rounded-md border border-taupe3 bg-white/60 px-3 py-2 text-dark outline-none focus:border-grey2';

	/** post the form to a /login action; a redirect (signed in, or off to Google) leaves the page */
	async function submit(e, next) {
		e.preventDefault();
		busy = true;
		message = '';
		try {
			const form = e.currentTarget;
			const res = await fetch(form.action, { method: 'POST', body: new FormData(form), headers: { 'x-sveltekit-action': 'true' } });
			const result = deserialize(await res.text());
			if (result.type === 'redirect') {
				window.location.href = result.location;
				return;
			}
			if (result.type === 'success' && (next || result.data?.step === 'verify')) {
				step = result.data.step;
				email = result.data.email;
			} else if (result.type === 'failure') {
				message = result.data?.message ?? 'Something went wrong.';
			} else if (result.type === 'error') {
				message = 'Something went wrong. Please try again.';
			}
		} finally {
			busy = false;
		}
	}
</script>

<dialog bind:this={dialog} class="m-auto w-full max-w-sm rounded-2xl border border-taupe3 bg-taupe1 p-8 text-dark shadow-xl backdrop:bg-dark/40">
	<div class="mb-1 flex items-start justify-between">
		<h2 class="text-xl font-semibold">Sign In</h2>
		<button onclick={() => dialog.close()} aria-label="Close" class="-mt-1 -mr-2 rounded-md px-2 text-xl text-grey3 hover:bg-taupe2">×</button>
	</div>
	<p class="mb-5 text-sm text-grey3">
		{#if step === 'verify'}We sent a confirmation link to {email}. Click it to finish, then sign in.
		{:else if step === 'signup'}No account for {email} yet. Add your name and a password to create one.
		{:else if step === 'signin'}Welcome back. Enter your password for {email}.
		{:else}Enter your email. We'll sign you in, or set up your account if you're new.{/if}
	</p>

	{#if step === 'email'}
		<form method="post" action="/login?/signInGoogle" onsubmit={(e) => submit(e)} class="mb-4">
			<button disabled={busy} class="flex w-full items-center justify-center gap-3 rounded-md border border-taupe3 bg-white/70 px-4 py-2.5 font-medium hover:bg-taupe2 disabled:opacity-50">
				<svg viewBox="0 0 48 48" width="18" height="18" aria-hidden="true">
					<path fill="#EA4335" d="M24 9.5c3.5 0 6.6 1.2 9.1 3.6l6.8-6.8C35.8 2.4 30.3 0 24 0 14.6 0 6.5 5.4 2.6 13.2l7.9 6.1C12.4 13.6 17.7 9.5 24 9.5z" />
					<path fill="#4285F4" d="M46.5 24.5c0-1.6-.1-3.1-.4-4.5H24v9h12.7c-.6 3-2.3 5.5-4.8 7.2l7.6 5.9c4.4-4.1 7-10.1 7-17.6z" />
					<path fill="#FBBC05" d="M10.5 28.7a14.5 14.5 0 0 1 0-9.4l-7.9-6.1a24 24 0 0 0 0 21.6l7.9-6.1z" />
					<path fill="#34A853" d="M24 48c6.5 0 11.9-2.1 15.9-5.8l-7.6-5.9c-2.1 1.4-4.8 2.3-8.3 2.3-6.3 0-11.6-4.1-13.5-9.8l-7.9 6.1C6.5 42.6 14.6 48 24 48z" />
				</svg>
				Continue with Google
			</button>
		</form>
		<div class="mb-4 flex items-center gap-3 text-xs text-grey3"><hr class="flex-1 border-taupe3" /> or <hr class="flex-1 border-taupe3" /></div>
		<form method="post" action="/login?/checkEmail" onsubmit={(e) => submit(e, true)} class="flex flex-col gap-4">
			<label class="flex flex-col gap-1 text-sm font-medium">
				Email
				<input type="email" name="email" autocomplete="email" bind:value={email} class={field} />
			</label>
			{#if message}<p role="alert" class="text-sm text-red">{message}</p>{/if}
			<button disabled={busy} class="rounded-md bg-dark px-4 py-2.5 font-medium text-taupe1 hover:bg-taupe5 disabled:opacity-50">Continue</button>
		</form>
	{:else if step === 'verify'}
		<button onclick={() => dialog.close()} class="w-full rounded-md bg-dark px-4 py-2.5 font-medium text-taupe1 hover:bg-taupe5">Done</button>
	{:else}
		<form
			method="post"
			action={step === 'signup' ? '/login?/signUpEmail' : '/login?/signInEmail'}
			onsubmit={(e) => submit(e)}
			class="flex flex-col gap-4"
		>
			<input type="hidden" name="email" value={email} />
			{#if step === 'signup'}
				<label class="flex flex-col gap-1 text-sm font-medium">
					Name
					<input name="name" autocomplete="name" class={field} />
				</label>
			{/if}
			<label class="flex flex-col gap-1 text-sm font-medium">
				Password
				<input type="password" name="password" autocomplete={step === 'signup' ? 'new-password' : 'current-password'} class={field} />
				{#if step === 'signup'}<span class="text-xs font-normal text-grey3">At least 8 characters.</span>{/if}
			</label>
			{#if message}<p role="alert" class="text-sm text-red">{message}</p>{/if}
			<button disabled={busy} class="rounded-md bg-dark px-4 py-2.5 font-medium text-taupe1 hover:bg-taupe5 disabled:opacity-50">
				{step === 'signup' ? 'Create account' : 'Sign In'}
			</button>
			<button type="button" onclick={() => { step = 'email'; message = ''; }} class="text-sm text-grey3 underline">Use a different email</button>
		</form>
	{/if}
</dialog>
