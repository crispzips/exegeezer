<!-- the tabs: up to ten texts open at once (only the three most recently used keep their content in memory; the others reload when opened) -->
<script>
    import { tip } from '#lib/utilities/menuTip.svelte.js';
    import { X, Plus } from '@boxicons/svelte';
    import { MAX_TABS, tabLabel } from '#lib/monocle/tabs.svelte.js';

    /** @type {{ monocle: import('#lib/monocle/monocle.svelte.js').Monocle }} */
    let { monocle } = $props();
    const { tabs } = $derived(monocle);
</script>

<div class="relative shrink-0">
    <div role="tablist" aria-label="Open texts" class="flex items-end gap-0.5 overflow-x-auto bg-taupe2 px-3 pt-3">
        {#each tabs.list as t (t.key)}
            {@const on = t.key === tabs.activeKey}
            <div data-tab={t.key} data-loaded={t.items !== null || on} class="flex max-w-56 min-w-0 shrink-0 items-center rounded-t-md border border-b-2 {on ? 'relative z-10 border-2 border-accent border-b-transparent bg-taupe1 text-dark shadow-[0_0_10px_1px_color-mix(in_srgb,var(--color-accent)_60%,transparent)]' : 'border-taupe3 border-b-accent bg-taupe2 text-grey3 hover:bg-taupe1'}">
                <button role="tab" aria-selected={on} onclick={() => tabs.activate(t.key)} use:tip={on ? tabLabel(t) : t.items === null ? `${tabLabel(t)} (not in memory: it loads when opened)` : tabLabel(t)} data-tip-place="below" class="min-w-0 flex-1 truncate py-1 pr-1 pl-3 text-left text-sm {t.items === null && !on ? 'italic' : ''} {on ? 'font-semibold' : ''}">{tabLabel(t)}</button>
                <button onclick={() => tabs.close(t.key)} aria-label="Close tab" use:tip={'Close tab'} data-tip-place="below" class="mr-1 inline-flex shrink-0 items-center justify-center rounded-md p-0.5 hover:bg-taupe2"><X width={16} height={16} /></button>
            </div>
        {/each}
        <button onclick={tabs.add} aria-label="New tab" aria-disabled={tabs.list.length >= MAX_TABS && !tabs.list.some((t) => !t.textId && t.items?.length === 0)} use:tip={tabs.list.length >= MAX_TABS ? 'Ten tabs are open: close one first' : 'New tab'} data-tip-place="below" class="mb-0.5 inline-flex shrink-0 items-center justify-center rounded-md p-1 text-dark hover:bg-taupe3 {tabs.list.length >= MAX_TABS ? 'opacity-50' : ''}"><Plus width={18} height={18} /></button>
    </div>
    <!-- the violet line under the strip, with a fainter shadow than the active tab's; the active tab (z-10) covers it, so the line goes up around that tab -->
    <div aria-hidden="true" class="pointer-events-none absolute inset-x-0 bottom-0 h-0.5 bg-accent shadow-[0_1px_8px_1px_color-mix(in_srgb,var(--color-accent)_45%,transparent)]"></div>
    {#if tabs.notice}
        <p role="status" class="raised absolute top-full right-3 z-20 mt-1 rounded-md px-3 py-1.5 text-sm text-dark shadow-lg">{tabs.notice}</p>
    {/if}
</div>
