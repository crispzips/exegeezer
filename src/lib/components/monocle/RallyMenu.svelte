<!-- Rally settings in the menu: the setup and sliders for text size and speed (ticks, no labels) -->
<script>
    import { slide } from 'svelte/transition';
    import { tip } from '#lib/utilities/menuTip.svelte.js';
    import { Cog, TextHeight, Tachometer } from '@boxicons/svelte';
    import EmphasisToggle from '#lib/components/EmphasisToggle.svelte';
    import { READ_WPM, SIZES, WRITING_COLOUR } from '#lib/utilities/rallyChunks.js';

    /** @type {{ monocle: import('#lib/monocle/monocle.svelte.js').Monocle }} */
    let { monocle } = $props();
    const { settings, rally } = $derived(monocle);
    const editing = $derived(settings.editing);
</script>

<div class="submenu flex w-full flex-col items-center gap-1 py-1">
    <button onclick={rally.openSetup} aria-label="Rally setup" use:tip={'Rally setup'} class="inline-flex items-center justify-center rounded-md p-1 text-dark hover:bg-taupe2"><Cog /></button>
    <!-- the rally's reading also sets first and last sentences apart; the same four-way toggle as in text appearance -->
    {#if settings.mode === 'reading'}<EmphasisToggle />{/if}
    <!-- text size and speed: each a vertical slider (smallest / slowest at the bottom, a tick for every step, no labels), shown when its icon is pressed -->
    <button onclick={() => (settings.sizeOpen = !settings.sizeOpen)} aria-label="Text size" aria-expanded={settings.sizeOpen} use:tip={'Text size'} class="inline-flex items-center justify-center rounded-md p-1 text-dark hover:bg-taupe2 {settings.sizeOpen ? 'bg-taupe3' : ''}"><TextHeight /></button>
    {#if settings.sizeOpen}
        <div transition:slide={{ duration: 200 }} class="flex items-stretch gap-0.5 py-1">
            <div aria-hidden="true" class="flex flex-col justify-between py-[7px]">{#each SIZES as s (s)}<span class="h-px w-1.5 bg-taupe4"></span>{/each}</div>
            <input type="range" min="0" max={SIZES.length - 1} step="1" bind:value={settings.rallySize} aria-label="Text size" use:tip={'Text size'} class="rally-speed" style="height: 5.5rem; --p: {settings.rallySize / (SIZES.length - 1)}{editing ? `; --mode: var(--color-${WRITING_COLOUR})` : ''}" />
        </div>
    {/if}
    <button onclick={() => (settings.speedOpen = !settings.speedOpen)} aria-label="Speed" aria-expanded={settings.speedOpen} use:tip={'Speed'} class="inline-flex items-center justify-center rounded-md p-1 text-dark hover:bg-taupe2 {settings.speedOpen ? 'bg-taupe3' : ''}"><Tachometer /></button>
    {#if settings.speedOpen}
        <div transition:slide={{ duration: 200 }} class="flex items-stretch gap-0.5 py-1">
            <div aria-hidden="true" class="flex flex-col justify-between py-[7px]">{#each READ_WPM as _, i (i)}<span class="h-px w-1.5 bg-taupe4"></span>{/each}</div>
            <input type="range" min="0" max={READ_WPM.length - 1} step="1" bind:value={settings.rallySpeed} aria-label="Speed" use:tip={'Speed'} class="rally-speed" style="--p: {settings.rallySpeed / (READ_WPM.length - 1)}{editing ? `; --mode: var(--color-${WRITING_COLOUR})` : ''}" />
        </div>
    {/if}
</div>
