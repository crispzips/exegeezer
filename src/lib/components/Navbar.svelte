<script>
	import {ListUlSquare} from '@boxicons/svelte';
	
	let open = $state(false);
	let menu;

	function onWindowClick(e) {
		if (open && menu && !menu.contains(e.target)) open = false;
	}
</script>

<svelte:window onclick={onWindowClick} onkeydown={(e) => e.key === 'Escape' && (open = false)} />

<nav class="border-b border-taupe2 bg-taupe1">
	<div class="flex h-14 items-center justify-between pr-2 pl-6">
		<!-- Logo (left) -->
		<a href="/" class="flex items-center gap-2">
			<!-- <img src="/logo.svg" alt="Company logo" class="h-8 w-8" /> -->
			<span class="font-semibold text-dark">Exegeezer</span>
		</a>

		<!-- Dropdown (right) -->
		<div class="relative z-9999" bind:this={menu}>
			<button
				onclick={() => (open = !open)}
				aria-haspopup="menu"
				aria-expanded={open}
				class="inline-flex items-center gap-1 rounded-md px-3 py-2 text-sm font-medium text-dark hover:bg-taupe2"
			>
				<ListUlSquare />
				<svg class="h-4 w-4 transition-transform {open ? 'rotate-180' : ''}" viewBox="0 0 20 20" fill="currentColor">
					<path d="M5.23 7.21a.75.75 0 011.06.02L10 11.17l3.71-3.94a.75.75 0 111.08 1.04l-4.25 4.5a.75.75 0 01-1.08 0l-4.25-4.5a.75.75 0 01.02-1.06z" />
				</svg>
			</button>

			{#if open}
				<div
					role="menu"
					class="absolute right-0 mt-2 w-48 origin-top-right rounded-md border border-taupe2 bg-taupe1 py-1 shadow-lg"
				>
					<a href="/profile" role="menuitem" class="block px-4 py-2 text-sm text-dark hover:bg-taupe2">Profile</a>
					<a href="/settings" role="menuitem" class="block px-4 py-2 text-sm text-dark hover:bg-taupe2">Settings</a>
					<hr class="my-1 border-taupe2" />
					<a href="/demo/better-auth/login" role="menuitem" class="block px-4 py-2 text-sm text-dark hover:bg-taupe2">Log in</a>
				</div>
			{/if}
		</div>
	</div>
</nav>