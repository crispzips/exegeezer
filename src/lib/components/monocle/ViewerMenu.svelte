<!-- The vertical menu column: load, map, view and mode, each with the settings particular to it -->
<script>
    import { slide } from 'svelte/transition';
    import { cubicOut } from 'svelte/easing';
    import { tip } from '#lib/utilities/menuTip.svelte.js';
    import { ArrowOutDownCircleHalf, QuoteRightAlt, Rename, MapIcon, CompassTool, Queue, BookOpen, Redo, Sitemap, Undo, StepsDown, Bomb, Explosion, FlagChequered, Search } from '@boxicons/svelte';
    import { ZOOMS } from '#lib/monocle/settings.svelte.js';
    import { WRITING_COLOUR } from '#lib/utilities/rallyChunks.js';
    import RallyMenu from './RallyMenu.svelte';
    import AppearanceMenu from './AppearanceMenu.svelte';

    /** @type {{ monocle: import('#lib/monocle/monocle.svelte.js').Monocle }} */
    let { monocle } = $props();
    const { doc, settings, edits, load } = $derived(monocle);
    const authed = $derived(monocle.authed);
    const view = $derived(settings.view);
    const mode = $derived(settings.mode);
    const editing = $derived(settings.editing);
    const commenting = $derived(settings.commenting);

    // The mode and view icons change with a horizontal wipe: the new icon is revealed left to right
    // while the old one is wiped away in the same direction.
    /** @param {Element} _node */
    // eslint-disable-next-line no-unused-vars
    const wipeIn = (_node) => ({ duration: 280, easing: cubicOut, css: (/** @type {number} */ t) => `clip-path: inset(0 ${(1 - t) * 100}% 0 0)` });
    /** @param {Element} _node */
    // eslint-disable-next-line no-unused-vars
    const wipeOut = (_node) => ({ duration: 280, easing: cubicOut, css: (/** @type {number} */ t) => `clip-path: inset(0 0 0 ${(1 - t) * 100}%)` });
</script>

<nav aria-label="Menu" class="fixed top-0 right-0 z-50 flex w-12 flex-col items-center gap-1 overflow-y-auto pt-2 {authed ? 'bottom-[10rem]' : 'bottom-[12.5rem]'}">
    <!-- with no text open there is nothing to load into: the Seed a text button starts one -->
    <!-- loading puts text into the open one, so not while commenting -->
    {#if !doc.noText}
    <button
        onclick={load.open}
        aria-label="Load text"
        aria-disabled={!authed || commenting || doc.publicized}
        use:tip={!authed ? 'Load text (sign in first)' : doc.publicized ? "Load text (this text can't be changed)" : commenting ? "Load text (the text can't be changed while commenting)" : 'Load text'}
        class="inline-flex items-center justify-center rounded-md p-1 text-dark {authed && !commenting && !doc.publicized ? 'hover:bg-taupe2' : 'cursor-not-allowed opacity-60'}"
    >
        <ArrowOutDownCircleHalf />
    </button>
    {/if}

    <button
        onclick={() => (edits.mapOpen = true)}
        aria-label="Map"
        use:tip={'Map'}
        class="inline-flex items-center justify-center rounded-md p-1 text-dark hover:bg-taupe2"
    >
        {#if editing}<CompassTool />{:else}<MapIcon />{/if}
    </button>

    <!-- View toggle: each click moves to the next view, the icon wiping across like the mode button's -->
    <button
        onclick={settings.cycleView}
        aria-label="Change view"
        use:tip={`${view[0].toUpperCase() + view.slice(1)} view`}
        class="inline-grid items-center justify-center rounded-md p-1 text-dark hover:bg-taupe2"
    >
        {#key view}
            <span in:wipeIn out:wipeOut class="inline-flex [grid-area:1/1]">
                {#if view === 'hierarchical'}<Sitemap />{:else if view === 'cascading'}<StepsDown />{:else if view === 'rally'}<FlagChequered />{:else}<Queue />{/if}
            </span>
        {/key}
    </button>

    {#if view === 'linear'}
        <!-- Linear settings: the zoom, a vertical slider (smallest at the bottom, a tick for every step) revealed by its icon -->
        <div class="submenu flex w-full flex-col items-center gap-1 py-1">
            <button onclick={() => (settings.zoomOpen = !settings.zoomOpen)} aria-label="Zoom" aria-expanded={settings.zoomOpen} use:tip={'Zoom'} class="inline-flex items-center justify-center rounded-md p-1 text-dark hover:bg-taupe2 {settings.zoomOpen ? 'bg-taupe3' : ''}"><Search /></button>
            {#if settings.zoomOpen}
                <div transition:slide={{ duration: 200 }} class="flex items-stretch gap-0.5 py-1">
                    <div aria-hidden="true" class="flex flex-col justify-between py-[7px]">{#each ZOOMS as z (z)}<span class="h-px w-1.5 bg-taupe4"></span>{/each}</div>
                    <input type="range" min="0" max={ZOOMS.length - 1} step="1" bind:value={settings.zoomStep} aria-label="Zoom" use:tip={'Zoom'} class="rally-speed" style="height: 5.5rem; --p: {settings.zoomStep / (ZOOMS.length - 1)}{editing ? `; --mode: var(--color-${WRITING_COLOUR})` : ''}" />
                </div>
            {/if}
        </div>
    {/if}

    {#if view === 'cascading'}
        <!-- View-particular settings: shown under the view button, only in this view -->
        <div class="submenu flex w-full flex-col items-center gap-1 py-1">
            <button
                onclick={() => (settings.exploded = !settings.exploded)}
                aria-label={settings.exploded ? 'Unexplode' : 'Explode'}
                aria-pressed={settings.exploded}
                use:tip={settings.exploded ? 'Unexplode' : 'Explode'}
                class="inline-flex items-center justify-center rounded-md p-1 text-dark hover:bg-taupe2 {settings.exploded ? 'bg-taupe3' : ''}"
            >
                {#if settings.exploded}<Explosion />{:else}<Bomb />{/if}
            </button>
        </div>
    {/if}

    {#if view === 'rally' && mode !== 'commenting'}
        <RallyMenu {monocle} />
    {/if}

    <button
        onclick={settings.cycleMode}
        aria-label="Mode"
        use:tip={!authed ? 'Reading mode (sign in to edit)' : doc.noText ? 'Writing mode (no text is loaded)' : `${mode[0].toUpperCase() + mode.slice(1)} mode`}
        aria-disabled={settings.modeLocked}
        class="inline-grid items-center justify-center rounded-md p-1 text-dark {settings.modeLocked ? 'cursor-not-allowed opacity-60' : 'hover:bg-taupe2'}"
    >
        {#key mode}
            <span in:wipeIn out:wipeOut class="inline-flex [grid-area:1/1]">
                {#if mode === 'writing'}<Rename />{:else if mode === 'commenting'}<QuoteRightAlt />{:else}<BookOpen />{/if}
            </span>
        {/key}
    </button>

    {#if editing}
        <!-- Writing helpers: shown under the mode button, only in writing mode -->
        <div class="submenu flex w-full flex-col items-center gap-1 py-1">
            <button onclick={doc.undo} disabled={!doc.history.canUndo} aria-label="Undo" use:tip={'Undo'} class="inline-flex items-center justify-center rounded-md p-1 text-dark hover:bg-taupe2 disabled:opacity-30 disabled:hover:bg-transparent"><Undo /></button>
            <button onclick={doc.redo} disabled={!doc.history.canRedo} aria-label="Redo" use:tip={'Redo'} class="inline-flex items-center justify-center rounded-md p-1 text-dark hover:bg-taupe2 disabled:opacity-30 disabled:hover:bg-transparent"><Redo /></button>
        </div>
    {/if}
    {#if view !== 'rally'}
        <AppearanceMenu {monocle} />
    {/if}
</nav>
