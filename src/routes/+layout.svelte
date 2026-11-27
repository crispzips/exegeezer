<script>
	import favicon from '#lib/assets/favicon.svg';
	import Navbar from '#lib/components/Navbar.svelte';
	import AccountSwitcher from '#lib/components/AccountSwitcher.svelte';
	import MenuTip from '#lib/components/MenuTip.svelte';
	import "../app.css";
	let { children, data } = $props();
</script>

<svelte:head>
	<link rel="icon" href={favicon} />
</svelte:head>

<Navbar user={data.user} />
{#if data.switcher && data.user}<AccountSwitcher switcher={data.switcher} userId={data.user.id} />{/if}

<div class="pr-12">
	{@render children()}
</div>

<!-- the bubble every `use:tip` shows, on whichever page -->
<MenuTip />


