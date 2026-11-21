<script>
	import { Check, ChevronDown } from '@boxicons/svelte';

	/**
	 * A dropdown for choosing several options. The button shows the choices; clicking it drops
	 * the options down in a popover (top layer, so a dialog's edges never clip it). Click an option
	 * to add or remove it. `value` keeps the order the options were chosen in.
	 *
	 * @type {{
	 *   options: { value: string, label: string }[],
	 *   value: string[],
	 *   placeholder?: string,
	 *   disabled?: boolean,
	 *   label?: string,
	 * }}
	 */
	let { options, value = $bindable([]), placeholder = 'Choose…', disabled = false, label = '' } = $props();

	/** @type {HTMLButtonElement | undefined} */
	let button = $state();
	/** @type {HTMLElement | undefined} */
	let pop = $state();
	let open = $state(false);
	let pos = $state({ top: 0, left: 0, width: 0 });

	const shown = $derived(value.map((v) => options.find((o) => o.value === v)?.label).filter(Boolean).join(', '));

	function toggleOpen() {
		if (disabled || !button || !pop) return;
		if (open) return pop.hidePopover();
		const r = button.getBoundingClientRect();
		pos = { top: r.bottom + 4, left: r.left, width: r.width };
		pop.showPopover();
	}

	/** @param {string} v */
	function toggle(v) {
		value = value.includes(v) ? value.filter((x) => x !== v) : [...value, v];
	}
</script>

<button
	bind:this={button}
	type="button"
	onclick={toggleOpen}
	{disabled}
	aria-haspopup="listbox"
	aria-expanded={open}
	aria-label={label || undefined}
	class="flex w-full items-center justify-between gap-2 rounded-md border border-taupe3 bg-taupe1 px-2 py-1 text-left text-taupe5 disabled:opacity-60"
>
	<span class="truncate {shown ? '' : 'text-taupe4'}">{shown || placeholder}</span>
	<ChevronDown class="shrink-0" />
</button>

<div
	bind:this={pop}
	popover="auto"
	ontoggle={(e) => (open = e.newState === 'open')}
	role="listbox"
	aria-multiselectable="true"
	class="raised m-0 max-h-64 overflow-y-auto rounded-md p-1 text-sm text-taupe5 shadow-lg"
	style="position: fixed; inset: auto; top: {pos.top}px; left: {pos.left}px; width: {pos.width}px"
>
	{#each options as o (o.value)}
		{@const on = value.includes(o.value)}
		<button
			type="button"
			role="option"
			aria-selected={on}
			onclick={() => toggle(o.value)}
			class="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left hover:bg-taupe2 {on ? 'bg-taupe2' : ''}"
		>
			<span class="inline-flex w-4 shrink-0">{#if on}<Check />{/if}</span>
			<span class="truncate">{o.label}</span>
		</button>
	{/each}
</div>
