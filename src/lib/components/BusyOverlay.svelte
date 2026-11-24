<script>
	import RainLoader from './RainLoader.svelte';

	/**
	 * A full-window "please wait" overlay: the rain cloud over a dimmed page, with a short line of what is happening.
	 * It is a manual popover, which lives in the browser's top layer, so it also covers any modal dialog that is open.
	 * It shows while `label` is not empty.
	 * @type {{ label?: string }}
	 */
	let { label = '' } = $props();
	/** @type {HTMLElement | undefined} */
	let el;

	$effect(() => {
		if (!el) return;
		if (label && !el.matches(':popover-open')) el.showPopover();
		else if (!label && el.matches(':popover-open')) el.hidePopover();
	});
</script>

<div
	bind:this={el}
	popover="manual"
	role="status"
	aria-live="polite"
	aria-busy={!!label}
	class="m-0 h-screen w-screen cursor-wait border-0 bg-taupe1/80 p-0 text-dark open:flex open:flex-col open:items-center open:justify-center open:gap-3"
>
	<span class="text-accent"><RainLoader size={96} /></span>
	<p class="text-sm text-taupe4">{label}</p>
</div>
