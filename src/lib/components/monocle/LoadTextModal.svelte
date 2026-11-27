<!-- The Load Text modal: its sources, the preview of what was loaded, and injecting it (or seeding a new text from it) -->
<script>
    import { Swatch, Mesh, GlobeAlt2 } from '@boxicons/svelte';
    import UploadButton from '#lib/components/UploadButton.svelte';
    import SourceButton from '#lib/components/SourceButton.svelte';
    import ParagraphViewer from '#lib/components/ParagraphViewer.svelte';
    import MapModal from '#lib/components/MapModal.svelte';

    /** @type {{ monocle: import('#lib/monocle/monocle.svelte.js').Monocle }} */
    let { monocle } = $props();
    const { doc, load, seeding } = $derived(monocle);
    /** whether Inject asks where (there is a main text, and no gap was chosen) */
    const asksWhere = $derived(doc.items.length > 0 && load.injectGap === null);
    const loaded = $derived(load.paragraphs.length > 0);
</script>

<!-- svelte-ignore a11y_click_events_have_key_events, a11y_no_noninteractive_element_interactions -->
<dialog
    bind:this={load.dialog}
    onclick={load.onDialogClick}
    onclose={load.onClosed}
    class="relative m-auto {!loaded ? 'h-64 w-[min(92vw,26rem)]' : load.previewHasSections ? 'h-[80vh] w-[min(94vw,88rem)]' : 'h-[80vh] w-[min(92vw,64rem)]'} overflow-hidden rounded-lg border border-taupe2 bg-taupe1 p-4 text-dark backdrop:bg-black/40 open:flex open:flex-col"
>
    <div class="flex shrink-0 items-start justify-between">
        <!-- Load sources: each is its own button, centered until a text is loaded, then top-left -->
        <div class={!loaded ? 'pointer-events-none absolute inset-x-0 top-1/2 z-40 flex -translate-y-1/2 justify-center' : 'inline-block'}>
            <div class="pointer-events-auto relative z-50 inline-flex gap-5">
                <!-- a computer file or the web comes in as content for a text that already exists (or to seed a new one), so with no text open only your own texts and other exegeezers' texts are offered -->
                {#if !doc.noText || load.forSeeding}
                <UploadButton bind:uploadedfiles={load.uploadedfiles} onloaded={load.onFileLoaded} small={loaded} active={loaded && load.source === 'computer'} />
                {/if}
                <SourceButton name="From Your Texts" onclick={() => (load.ownTextsOpen = true)} small={loaded} active={loaded && load.source === 'own'}><Swatch width={loaded ? 22 : 40} height={loaded ? 22 : 40} /></SourceButton>
                {#if !doc.noText || load.forSeeding}
                <SourceButton name="From Open Libraries" onclick={() => (load.openSourcesOpen = true)} small={loaded} active={loaded && load.source === 'web'}><GlobeAlt2 width={loaded ? 22 : 40} height={loaded ? 22 : 40} /></SourceButton>
                {/if}
                <SourceButton name="From Other Exegeezers" tipAlign="right" small={loaded}><Mesh width={loaded ? 22 : 40} height={loaded ? 22 : 40} /></SourceButton>
            </div>
        </div>

        <button
            onclick={() => load.dialog?.close()}
            aria-label="Close"
            class="relative z-50 ml-auto rounded-md px-2 py-1 text-lg leading-none text-dark hover:bg-taupe2"
        >
            ×
        </button>
    </div>

    <!-- text preview pane: hidden until a text is loaded -->
    {#if loaded}
    <section class="mt-4 flex min-h-0 flex-1 flex-col overflow-hidden rounded-md border border-taupe2">
        <header class="flex shrink-0 items-center justify-between border-b border-taupe2 bg-taupe2 px-3 py-2">
            <h2 class="text-sm font-semibold text-dark">
                Preview{#if load.notes.length}<span class="ml-2 font-normal text-grey3">— {load.notes.join(' ')}</span>{/if}{#if load.injectGap !== null}<span class="ml-2 font-normal text-grey3">— will be injected at the chosen location</span>{/if}
            </h2>

            <div class="flex items-center gap-4">
            <!-- the import question (not asked for the user's own texts) -->
            {#if load.source !== 'own'}
                <label class="flex items-center gap-1.5 text-xs text-dark" title="Saves an unaltered copy of the incoming text in your texts as ORIGINAL--{load.name}">
                    <input type="checkbox" bind:checked={load.keepCopy} />
                    Keep an original copy in my texts
                </label>
            {/if}

            {#if load.forSeeding}
                <!-- seeding: a new text is made from the loaded one, so there is nothing to ask about where it goes -->
                <button onclick={seeding.fromPreview} class="inline-flex items-center gap-1 rounded-md bg-accent px-3 py-1 text-xs font-medium text-on-accent hover:bg-accent/90">Seed a text</button>
            {:else}
            <!-- Inject Loaded Text dropdown -->
            <div class="relative" bind:this={load.injectMenu}>
                <button
                    onclick={() => (!asksWhere ? load.inject('append') : (load.injectOpen = !load.injectOpen))}
                    disabled={!loaded}
                    aria-haspopup={asksWhere ? 'menu' : undefined}
                    aria-expanded={asksWhere ? load.injectOpen : undefined}
                    class="inline-flex items-center gap-1 rounded-md bg-accent px-3 py-1 text-xs font-medium text-on-accent hover:bg-accent/90 disabled:cursor-not-allowed disabled:opacity-50 disabled:hover:bg-accent"
                >
                    Inject Loaded Text
                    {#if asksWhere}
                        <svg class="h-4 w-4 transition-transform {load.injectOpen ? 'rotate-180' : ''}" viewBox="0 0 20 20" fill="currentColor">
                            <path d="M5.23 7.21a.75.75 0 011.06.02L10 11.17l3.71-3.94a.75.75 0 111.08 1.04l-4.25 4.5a.75.75 0 01-1.08 0l-4.25-4.5a.75.75 0 01.02-1.06z" />
                        </svg>
                    {/if}
                </button>

                {#if load.injectOpen && asksWhere}
                    <div
                        role="menu"
                        class="absolute right-0 z-10 mt-2 w-40 origin-top-right raised rounded-md py-1 shadow-lg"
                    >
                        <button role="menuitem" onclick={() => load.inject('prepend')} class="block w-full px-4 py-2 text-left text-sm text-dark hover:bg-taupe2">Prepend</button>
                        <button role="menuitem" onclick={() => load.inject('append')} class="block w-full px-4 py-2 text-left text-sm text-dark hover:bg-taupe2">Append</button>
                        <button role="menuitem" onclick={() => load.inject('replace')} class="block w-full px-4 py-2 text-left text-sm text-dark hover:bg-taupe2">Replace</button>
                    </div>
                {/if}
            </div>
            {/if}
            </div>
        </header>

        <div class="flex min-h-0 flex-1">
            {#if load.previewHasSections}
                <!-- the map: front and back matter are chosen here, beside the preview, which pans to whatever is hovered -->
                <aside aria-label="Front and back matter" class="flex w-2/5 min-w-64 shrink-0 flex-col border-r border-taupe2 p-3">
                    <MapModal mode="matter" open={true} onchoose={load.applyMatter} onhover={(id) => (load.previewSpot = id)} title={load.name} paragraphs={load.paragraphs} />
                </aside>
            {/if}
            <div class="min-h-0 min-w-0 flex-1">
                <ParagraphViewer paragraphs={load.previewShown} matter={load.previewMatter} markdown={load.previewMarkdown} zoom={0.75} jumpToId={load.previewSpot} emphasizeFirst={false} empty="No text loaded yet." />
            </div>
        </div>
    </section>
    {/if}
</dialog>
