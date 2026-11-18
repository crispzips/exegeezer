<script>
    import { onMount } from 'svelte';
    import { ArrowOutDownCircleHalf, EyeAlt, Queue, Sitemap } from '@boxicons/svelte';
    import UploadButton from '#lib/components/UploadButton.svelte';
    import ParagraphViewer from '#lib/components/ParagraphViewer.svelte';
    import HierarchyViewer from '#lib/components/HierarchyViewer.svelte';
    import { cleanMarkdown } from '#lib/utilities/cleanMarkdown.js';
    import { splitParagraphs } from '#lib/utilities/splitParagraphs.js';

    /** @type {{ name: string, text: string }[]} */
    let uploadedfiles = $state([]);

    /** @type {{ id: string, originalIndex: number, text: string, level: number }[]} */
    let paragraphs = $state([]);

    // Runs after a file is loaded: split the newest file into paragraphs
    function onFileLoaded() {
        const latest = uploadedfiles[uploadedfiles.length - 1];
        if (latest) {
            // Markdown: drop the table of contents and its {#anchor} header links first
            const isMarkdown = /\.(md|markdown)$/i.test(latest.name);
            paragraphs = splitParagraphs(isMarkdown ? cleanMarkdown(latest.text) : latest.text);
            // Headers present but text above the first one: ask what to do with it
            const hasHeaders = paragraphs.some((p) => p.level > 0);
            if (hasHeaders && paragraphs[0].level === 0) frontmatterDialog?.showModal();
        }
        open = false;
    }

    /** @type {HTMLDialogElement | undefined} */
    let frontmatterDialog;

    /**
     * Put the text above the first header into a section called "Frontmatter".
     * The section is a header at the shallowest header level present, placed first.
     * @param {{ id: string, originalIndex: number, text: string, level: number, children?: unknown[] }[]} list
     */
    function withFrontmatter(list) {
        const level = Math.min(...list.filter((p) => p.level > 0).map((p) => p.level));
        const header = {
            id: crypto.randomUUID(),
            originalIndex: 0,
            text: `${'#'.repeat(level)} Frontmatter`,
            level,
            children: []
        };
        return [header, ...list].map((p, i) => ({ ...p, originalIndex: i }));
    }

    function wrapFrontmatter() {
        paragraphs = withFrontmatter(paragraphs);
        frontmatterDialog?.close();
    }

    // TEMPORARY: load Dissertation.md into the main pane when the page opens, with
    // an automatic Frontmatter section (the file is gitignored, so this does
    // nothing where it is missing).
    const dissertationFiles = import.meta.glob('/src/lib/assets/Dissertation.md', { query: '?raw', import: 'default' });
    onMount(async () => {
        const load = Object.values(dissertationFiles)[0];
        if (!load || mainText.length > 0) return;
        const list = splitParagraphs(cleanMarkdown(/** @type {string} */ (await load())));
        const hasHeaders = list.some((p) => p.level > 0);
        mainText = (hasHeaders && list[0]?.level === 0 ? withFrontmatter(list) : list).map((p, i) => ({
            ...p,
            originalIndex: i
        }));
    });

    /** The main text shown in the main pane */
    /** @type {{ id: string, originalIndex: number, text: string, level: number }[]} */
    let mainText = $state([]);

    // ---- Load Text modal ----
    /** @type {HTMLDialogElement | undefined} */
    let dialogEl;

    function openModal() {
        dialogEl?.showModal();
    }

    /** @param {MouseEvent} e */
    function onDialogClick(e) {
        // A click on the dialog element itself (not its contents) is a backdrop click
        if (e.target === dialogEl) dialogEl?.close();
    }

    function onModalClosed() {
        open = false;
        injectOpen = false;
    }

    /**
     * Add the loaded text (the paragraphs in the preview) to the main text.
     * If the main text is empty, the loaded text simply becomes the main text.
     * 'replace' discards the existing main text and uses the loaded text instead.
     * @param {'prepend' | 'append' | 'replace'} where
     */
    function inject(where) {
        if (paragraphs.length === 0) return;
        // Copy with fresh ids so keys stay unique if the same text is injected twice
        const added = paragraphs.map((p) => ({ id: crypto.randomUUID(), originalIndex: 0, text: p.text, level: p.level }));
        const combined =
            mainText.length === 0 || where === 'replace'
                ? added
                : where === 'prepend'
                  ? [...added, ...mainText]
                  : [...mainText, ...added];
        mainText = combined.map((p, i) => ({ ...p, originalIndex: i }));

        // Reset the load pane: drop the loaded text and close the modal
        paragraphs = [];
        uploadedfiles = [];
        dialogEl?.close();
    }

    let open = $state(false);
        /** @type {HTMLDivElement | undefined} */
        let importmenu;

    let injectOpen = $state(false);
        /** @type {HTMLDivElement | undefined} */
        let injectmenu;

    // ---- Main pane view menu ----
    /** @type {'linear' | 'hierarchical'} */
    let view = $state('linear');
    let viewOpen = $state(false);
        /** @type {HTMLDivElement | undefined} */
        let viewmenu;

    /** @param {'linear' | 'hierarchical'} v */
    function chooseView(v) {
        view = v;
        viewOpen = false;
    }

        function onWindowClick(e) {
            if (viewOpen && viewmenu && !viewmenu.contains(e.target)) viewOpen = false;
            if (open && importmenu && !importmenu.contains(e.target)) open = false;
            if (injectOpen && injectmenu && !injectmenu.contains(e.target)) injectOpen = false;
        }
</script>

<!-- Main pane -->
<div class="flex h-[calc(100vh-57px)] bg-taupe1">
    <div class="min-w-0 flex-1">
        {#if view === 'linear'}
            <ParagraphViewer paragraphs={mainText} empty="No main text yet." synopsis />
        {:else}
            <HierarchyViewer paragraphs={mainText} empty="No main text yet." />
        {/if}
    </div>

    <!-- Vertical menu column -->
    <nav aria-label="Menu" class="flex w-12 shrink-0 flex-col items-center gap-1 border-l border-taupe2 bg-taupe1 py-2">
        <button
            onclick={openModal}
            aria-label="Load text"
            title="Load text"
            class="inline-flex items-center justify-center rounded-md p-1 text-dark hover:bg-taupe2"
        >
            <ArrowOutDownCircleHalf />
        </button>

        <!-- View menu: choices pop out to the left -->
        <div class="relative" bind:this={viewmenu}>
            <button
                onclick={() => (viewOpen = !viewOpen)}
                aria-label="Change view"
                title="Change view"
                aria-haspopup="menu"
                aria-expanded={viewOpen}
                class="inline-flex items-center justify-center rounded-md p-1 text-dark hover:bg-taupe2 {viewOpen ? 'bg-taupe2' : ''}"
            >
                <EyeAlt />
            </button>

            {#if viewOpen}
                <div
                    role="menu"
                    class="absolute right-full top-0 z-10 mr-2 flex gap-1 rounded-md border border-taupe2 bg-taupe1 p-1 shadow-lg"
                >
                    <button
                        role="menuitemradio"
                        aria-checked={view === 'linear'}
                        aria-label="Linear"
                        title="Linear"
                        onclick={() => chooseView('linear')}
                        class="inline-flex items-center justify-center rounded-md p-1 text-dark hover:bg-taupe2 {view === 'linear' ? 'bg-taupe2' : ''}"
                    >
                        <Queue />
                    </button>
                    <button
                        role="menuitemradio"
                        aria-checked={view === 'hierarchical'}
                        aria-label="Hierarchical"
                        title="Hierarchical"
                        onclick={() => chooseView('hierarchical')}
                        class="inline-flex items-center justify-center rounded-md p-1 text-dark hover:bg-taupe2 {view === 'hierarchical' ? 'bg-taupe2' : ''}"
                    >
                        <Sitemap />
                    </button>
                </div>
            {/if}
        </div>
    </nav>
</div>

<!-- Load Text modal -->
<!-- svelte-ignore a11y_click_events_have_key_events, a11y_no_noninteractive_element_interactions -->
<dialog
    bind:this={dialogEl}
    onclick={onDialogClick}
    onclose={onModalClosed}
    class="m-auto h-[80vh] w-[min(92vw,64rem)] overflow-hidden rounded-lg border border-taupe2 bg-taupe1 p-4 text-dark backdrop:bg-black/40 open:flex open:flex-col"
>
    <div class="flex shrink-0 items-start justify-between">
        <!-- Load Text dropdown -->
        <div class="relative z-50 inline-block" bind:this={importmenu}>
            <button
                onclick={() => (open = !open)}
                aria-haspopup="menu"
                aria-expanded={open}
                class="inline-flex items-center gap-1 rounded-md px-3 py-2 text-sm font-medium text-dark hover:bg-taupe2"
            >
                Load Text
                <svg class="h-4 w-4 transition-transform {open ? 'rotate-180' : ''}" viewBox="0 0 20 20" fill="currentColor">
                    <path d="M5.23 7.21a.75.75 0 011.06.02L10 11.17l3.71-3.94a.75.75 0 111.08 1.04l-4.25 4.5a.75.75 0 01-1.08 0l-4.25-4.5a.75.75 0 01.02-1.06z" />
                </svg>
            </button>

            {#if open}
                <div
                    role="menu"
                    class="absolute left-0 z-50 mt-2 w-48 origin-top-left rounded-md border border-taupe2 bg-taupe1 py-1 shadow-lg"
                >
                    <UploadButton bind:uploadedfiles onloaded={onFileLoaded} />
                </div>
            {/if}
        </div>

        <button
            onclick={() => dialogEl?.close()}
            aria-label="Close"
            class="rounded-md px-2 py-1 text-lg leading-none text-dark hover:bg-taupe2"
        >
            ×
        </button>
    </div>

    <!-- text preview pane -->
    <section class="mt-4 flex min-h-0 flex-1 flex-col overflow-hidden rounded-md border border-taupe2">
        <header class="flex shrink-0 items-center justify-between border-b border-taupe2 bg-taupe2 px-3 py-2">
            <h2 class="text-sm font-semibold text-dark">Preview</h2>

            <!-- Inject Loaded Text dropdown -->
            <div class="relative" bind:this={injectmenu}>
                <button
                    onclick={() => (mainText.length === 0 ? inject('append') : (injectOpen = !injectOpen))}
                    disabled={paragraphs.length === 0}
                    aria-haspopup={mainText.length > 0 ? 'menu' : undefined}
                    aria-expanded={mainText.length > 0 ? injectOpen : undefined}
                    class="inline-flex items-center gap-1 rounded-md bg-violet px-3 py-1 text-xs font-medium text-white hover:bg-violet/90 disabled:cursor-not-allowed disabled:opacity-50 disabled:hover:bg-violet"
                >
                    Inject Loaded Text
                    {#if mainText.length > 0}
                        <svg class="h-4 w-4 transition-transform {injectOpen ? 'rotate-180' : ''}" viewBox="0 0 20 20" fill="currentColor">
                            <path d="M5.23 7.21a.75.75 0 011.06.02L10 11.17l3.71-3.94a.75.75 0 111.08 1.04l-4.25 4.5a.75.75 0 01-1.08 0l-4.25-4.5a.75.75 0 01.02-1.06z" />
                        </svg>
                    {/if}
                </button>

                {#if injectOpen && mainText.length > 0}
                    <div
                        role="menu"
                        class="absolute right-0 z-10 mt-2 w-40 origin-top-right rounded-md border border-taupe2 bg-taupe1 py-1 shadow-lg"
                    >
                        <button role="menuitem" onclick={() => inject('prepend')} class="block w-full px-4 py-2 text-left text-sm text-dark hover:bg-taupe2">Prepend</button>
                        <button role="menuitem" onclick={() => inject('append')} class="block w-full px-4 py-2 text-left text-sm text-dark hover:bg-taupe2">Append</button>
                        <button role="menuitem" onclick={() => inject('replace')} class="block w-full px-4 py-2 text-left text-sm text-dark hover:bg-taupe2">Replace</button>
                    </div>
                {/if}
            </div>
        </header>

        <div class="min-h-0 flex-1">
            <ParagraphViewer {paragraphs} empty="No text loaded yet." />
        </div>
    </section>
</dialog>

<!-- Frontmatter question -->
<dialog
    bind:this={frontmatterDialog}
    class="m-auto w-[min(92vw,26rem)] rounded-lg border border-taupe2 bg-taupe1 p-5 text-dark backdrop:bg-black/40"
>
    <h2 class="text-base font-semibold">Content above the first section</h2>
    <p class="mt-2 text-sm">
        This file has text before its first section header. Place that content in a section called "Frontmatter"?
    </p>
    <div class="mt-4 flex justify-end gap-2">
        <button
            onclick={() => frontmatterDialog?.close()}
            class="rounded-md px-3 py-1.5 text-sm hover:bg-taupe2"
        >
            No, leave it
        </button>
        <button
            onclick={wrapFrontmatter}
            class="rounded-md bg-violet px-3 py-1.5 text-sm font-medium text-white hover:bg-violet/90"
        >
            Yes, create Frontmatter
        </button>
    </div>
</dialog>

<svelte:window onclick={onWindowClick} onkeydown={(e) => e.key === 'Escape' && (open = false)} />
