<!-- the "repress text" submenu: recanting, derecanting, burning and renouncing, as far as each is open to the user -->
<script>
    import { tip } from '#lib/utilities/menuTip.svelte.js';
    import { EyeSlash } from '@boxicons/svelte';

    /** @type {{ monocle: import('#lib/monocle/monocle.svelte.js').Monocle }} */
    let { monocle } = $props();
    const { doc, whole } = $derived(monocle);

    let open = $state(false);
    /** @type {any} the text's head, with what the user is to it, fetched when the menu opens */
    let head = $state(null);
    let failed = $state(false);
    /** @type {HTMLDivElement | undefined} */
    let box = $state();
    let at = $state({ top: 0, left: 0 });

    /** @param {MouseEvent & { currentTarget: HTMLElement }} e */
    async function toggle(e) {
        if (open) return void (open = false);
        const r = e.currentTarget.getBoundingClientRect();
        // (fixed, so the title bar can't clip it)
        at = { top: r.bottom + 4, left: Math.min(r.left, window.innerWidth - 288) };
        open = true;
        head = null;
        failed = false;
        try {
            const res = await fetch(`/api/texts/${doc.id}/head`);
            if (!res.ok) throw new Error(`${res.status}`);
            head = await res.json();
        } catch {
            failed = true;
        }
    }

    /** @typedef {{ label: string, run: () => void }} Choice */
    const choices = $derived.by(() => {
        if (!head) return /** @type {Choice[]} */ ([]);
        const { me, productionStatus: status, visibility } = head;
        /** @type {Choice[]} */
        const list = [];
        const permanent = visibility === 'public' && ['published', 'recanted', 'burned'].includes(status);
        if (permanent && me.access !== 'reader') {
            // an editor proposes; one of several authors requests
            const ask = (/** @type {string} */ verb, /** @type {string} */ noun) => (me.access === 'editor' ? `Propose ${noun}` : me.coAuthored ? `Request ${noun}` : verb);
            if (status === 'published') list.push({ label: ask('Recant', 'recantation'), run: () => whole.repress('recant', head) });
            if (status === 'recanted') list.push({ label: ask('Derecant', 'derecantation'), run: () => whole.repress('derecant', head) });
            if (status !== 'burned') list.push({ label: ask('Burn', 'burning'), run: () => whole.repress('burn', head) });
        }
        // renouncing is each author persona's own, and only of a co-authored text
        if (me.access === 'author' && me.coAuthored) {
            for (const persona of me.authorPersonae) {
                const as = me.authorPersonae.length > 1 ? ` (${persona.name})` : '';
                list.push({ label: `Renounce authorship${as}`, run: () => whole.repress('renounce', head, persona) });
                list.push({ label: `Renounce with extreme prejudice${as}`, run: () => whole.repress('renounce', head, persona, true) });
            }
        }
        for (const persona of me.renounced) {
            if (persona.extreme) continue;
            list.push({ label: `Undo renunciation (${persona.name})`, run: () => whole.repress('unrenounce', head, persona) });
            list.push({ label: `Renounce with extreme prejudice (${persona.name})`, run: () => whole.repress('renounce', head, persona, true) });
        }
        return list;
    });
</script>

<svelte:window
    onpointerdown={(e) => { if (open && e.target instanceof Node && !box?.contains(e.target)) open = false; }}
    onkeydown={(e) => { if (open && e.key === 'Escape') open = false; }}
/>

<div bind:this={box} class="inline-flex">
    <button role="menuitem" onclick={toggle} aria-label="Repress text" aria-haspopup="menu" aria-expanded={open} use:tip={open ? '' : 'Repress text'} data-tip-place="below" class="inline-flex items-center justify-center rounded-md p-1 hover:bg-taupe2 {open ? 'bg-taupe3' : ''}"><EyeSlash /></button>
    {#if open}
        <div role="menu" aria-label="Repress text" class="raised fixed z-[60] flex w-72 flex-col rounded-md py-1 text-sm shadow-lg" style="top: {at.top}px; left: {at.left}px">
            {#if failed}
                <p role="alert" class="px-3 py-1 text-red">Could not load the menu.</p>
            {:else if !head}
                <p class="px-3 py-1 text-grey3">Loading…</p>
            {:else}
                {#each choices as choice (choice.label)}
                    <button role="menuitem" onclick={() => { open = false; choice.run(); }} class="px-3 py-1.5 text-left hover:bg-taupe2">{choice.label}</button>
                {:else}
                    <p class="px-3 py-1 text-grey3">Nothing can be repressed here.</p>
                {/each}
            {/if}
        </div>
    {/if}
</div>
