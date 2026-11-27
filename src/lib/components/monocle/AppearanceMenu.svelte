<!-- Text appearance in the menu: under the mode button (and its helpers), in every mode; not shown in the rally view, which has its own size and speed -->
<script>
    import { slide } from 'svelte/transition';
    import { tip } from '#lib/utilities/menuTip.svelte.js';
    import { FontFamily, TextHeight, LineSpacing, LetterSpacing, ParagraphSpacing, MarginLeft } from '@boxicons/svelte';
    import EmphasisToggle from '#lib/components/EmphasisToggle.svelte';
    import { APPEARANCE } from '#lib/monocle/appearance.svelte.js';

    /** @type {{ monocle: import('#lib/monocle/monocle.svelte.js').Monocle }} */
    let { monocle } = $props();
    const { settings, appearance } = $derived(monocle);
</script>

<div class="submenu flex w-full flex-col items-center gap-1 py-1">
    <button
        onclick={() => (appearance.menuOpen = !appearance.menuOpen)}
        aria-label="Text appearance"
        aria-expanded={appearance.menuOpen}
        use:tip={'Text appearance'}
        class="inline-flex items-center justify-center rounded-md p-1 text-dark hover:bg-taupe3 {appearance.menuOpen ? 'bg-taupe3' : ''}"
    >
        <FontFamily />
    </button>
    {#if appearance.menuOpen}
        <div transition:slide={{ duration: 200 }} class="flex w-full flex-col items-center gap-1">
            {#each APPEARANCE.filter((a) => a.id !== 'para' || settings.view === 'linear') as a (a.id)}
                <button onclick={() => (appearance.slider = appearance.slider === a.id ? null : a.id)} aria-label={a.label} aria-expanded={appearance.slider === a.id} use:tip={a.label} class="inline-flex items-center justify-center rounded-md p-1 text-dark hover:bg-taupe3 {appearance.slider === a.id ? 'bg-taupe3' : ''}">
                    {#if a.id === 'size'}<TextHeight />{:else if a.id === 'line'}<LineSpacing />{:else if a.id === 'letter'}<LetterSpacing />{:else if a.id === 'para'}<ParagraphSpacing />{:else}<MarginLeft />{/if}
                </button>
                {#if appearance.slider === a.id}
                    <div transition:slide={{ duration: 200 }} class="flex items-stretch gap-0.5 py-1">
                        <input type="range" min="0" max={a.steps.length - 1} step="1" value={appearance.step(a.id)} oninput={(e) => appearance.setStep(a.id, +e.currentTarget.value)} aria-label={a.label} use:tip={a.label} class="rally-speed" style="height: 5.5rem; --p: {appearance.step(a.id) / (a.steps.length - 1)}" />
                        <!-- the ticks sit on the slider's right, like a ruler: every other one shorter -->
                        <div aria-hidden="true" class="flex flex-col items-end justify-between py-[7px]">{#each a.steps as s, i (s)}<span class="h-px {i % 2 === 0 ? 'w-2' : 'w-1'} bg-taupe4"></span>{/each}</div>
                    </div>
                {/if}
            {/each}
            <EmphasisToggle />
            <button onclick={appearance.reset} aria-label="Revert text appearance" use:tip={'Revert to how it was when you opened this text'} class="inline-flex items-center justify-center rounded-md p-1 text-xs text-dark hover:bg-taupe3">↺</button>
        </div>
    {/if}
</div>
