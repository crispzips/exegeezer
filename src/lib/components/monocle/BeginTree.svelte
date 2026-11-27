<!-- Nothing is loaded: a tree of round buttons to begin. Each choice opens the next layer beneath it (the layers stay, with the choices made in violet) until a modal has to open, which appears over the tree.
     Layer 1: Seed a text, Load a text. Seed a text leads to a fresh text (then its first heading level) or seeding from an existing text (then where it comes from); Load a text leads to your own texts or other exegeezers' texts. -->
<script>
    import { ArrowOutDownCircleHalf, Swatch, Sapling, Mesh, GlobeAlt2, Clipboard, ClipboardPlus } from '@boxicons/svelte';
    import UploadButton from '#lib/components/UploadButton.svelte';
    import SourceButton from '#lib/components/SourceButton.svelte';

    /** @type {{ monocle: import('#lib/monocle/monocle.svelte.js').Monocle }} */
    let { monocle } = $props();
    const { doc, settings, seeding, load, rally } = $derived(monocle);
</script>

<div class="pointer-events-none absolute inset-x-0 top-0 bottom-0 z-10 flex items-start justify-center overflow-y-auto pt-[12%]">
    {#if doc.id && settings.view !== 'rally'}
        <!-- a blank text is open: only its first heading level is left to choose -->
        <div class="pointer-events-auto flex items-center gap-5">
            {#each seeding.levels as n (n)}
                <SourceButton name="Heading {n}" onclick={() => seeding.seedText(n)}><span class="flex h-10 w-10 items-center justify-center text-3xl leading-none font-semibold" style="font-family: Georgia, serif">{'#'.repeat(n)}</span></SourceButton>
            {/each}
        </div>
    {:else}
        <div class="pointer-events-auto flex flex-col items-center gap-14">
            <div class="pop-in flex items-center gap-6">
                <SourceButton name="Seed a text or commentary" active={seeding.root === 'seed'} onclick={() => (settings.view === 'rally' ? (rally.setupOpen = true) : seeding.chooseRoot('seed'))}><Sapling width={36} height={36} /></SourceButton>
                <SourceButton name="Load a text" active={seeding.root === 'load'} onclick={() => seeding.chooseRoot('load')}><ArrowOutDownCircleHalf width={36} height={36} /></SourceButton>
            </div>

            {#if seeding.root === 'seed'}
                <div class="pop-in flex items-center gap-6">
                    <SourceButton name="A fresh text" active={seeding.step === 'level'} onclick={() => seeding.chooseKind('level')}><Clipboard width={36} height={36} /></SourceButton>
                    <SourceButton name="Seed from an existing text" active={seeding.step === 'existing'} onclick={() => seeding.chooseKind('existing')}><ClipboardPlus width={36} height={36} /></SourceButton>
                </div>
                {#if seeding.step === 'level'}
                    <div class="pop-in flex items-center gap-6">
                        {#each seeding.levels as n (n)}
                            <SourceButton name="Heading {n}" onclick={() => seeding.seedText(n)}><span class="flex h-9 w-9 items-center justify-center text-3xl leading-none font-semibold" style="font-family: Georgia, serif">{'#'.repeat(n)}</span></SourceButton>
                        {/each}
                    </div>
                {:else if seeding.step === 'existing'}
                    <div class="pop-in flex items-center gap-6">
                        <UploadButton bind:uploadedfiles={load.uploadedfiles} onclick={seeding.pickComputer} oncancel={() => (seeding.source = '')} onloaded={load.onFileLoaded} active={seeding.source === 'computer'} />
                        <SourceButton name="From Your Texts" active={seeding.source === 'own'} onclick={() => seeding.openPicker('own', true)}><Swatch width={36} height={36} /></SourceButton>
                        <SourceButton name="From Open Libraries" active={seeding.source === 'web'} onclick={() => seeding.openPicker('web', true)}><GlobeAlt2 width={36} height={36} /></SourceButton>
                        <SourceButton name="From Other Exegeezers"><Mesh width={36} height={36} /></SourceButton>
                    </div>
                {/if}
            {:else if seeding.root === 'load'}
                <!-- with no text open, only your own texts and other exegeezers' texts: a computer file or the web comes in as content for a text that exists -->
                <div class="pop-in flex items-center gap-6">
                    <SourceButton name="From Your Texts" active={seeding.source === 'own'} onclick={() => seeding.openPicker('own', false)}><Swatch width={36} height={36} /></SourceButton>
                    <SourceButton name="From Other Exegeezers"><Mesh width={36} height={36} /></SourceButton>
                </div>
            {/if}
        </div>
    {/if}
</div>
