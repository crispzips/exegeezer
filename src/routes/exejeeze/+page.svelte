<script>
    import { onMount, tick } from 'svelte';
    import MenuTip from '#lib/components/MenuTip.svelte';
    import { tip } from '#lib/utilities/menuTip.svelte.js';
    import { cubicOut } from 'svelte/easing';
    import { ArrowOutDownCircleHalf, Discussion, Edit, EyeAlt, MapIcon, Queue, Reading, Redo, Sitemap, Undo, Mesh, Swatch, StepsDown, Bomb, Explosion, Scroll } from '@boxicons/svelte';
    import UploadButton from '#lib/components/UploadButton.svelte';
    import SourceButton from '#lib/components/SourceButton.svelte';
    import ParagraphViewer from '#lib/components/ParagraphViewer.svelte';
    import CascadingViewer from '#lib/components/CascadingViewer.svelte';
    import HierarchyViewer from '#lib/components/HierarchyViewer.svelte';
    import { cleanMarkdown } from '#lib/utilities/cleanMarkdown.js';
    import { splitParagraphs } from '#lib/utilities/splitParagraphs.js';
    import ConfirmDialog from '#lib/components/ConfirmDialog.svelte';
    import EditModal from '#lib/components/EditModal.svelte';
    import MapModal from '#lib/components/MapModal.svelte';
    import { History } from '#lib/utilities/history.svelte.js';
    import { withoutMatter, matterSections } from '#lib/utilities/matter.js';
    import { applyDrop, describeSection, gapIndex, insertAt, moveItem, removeParagraph, removeSection, renameSection } from '#lib/utilities/editText.js';

    /** @type {{ name: string, text: string }[]} */
    let uploadedfiles = $state([]);

    /** @type {{ id: string, originalIndex: number, text: string, level: number }[]} */
    let paragraphs = $state([]);

    /** where the text in the preview came from: this computer, another exegeezer, or the user's own texts */
    /** @type {'computer' | 'others' | 'own'} */
    let loadSource = $state('computer');
    /** the loaded file's name without its extension (names the new text and the ORIGINAL-- copy) */
    let loadName = $state('');
    /** the import question: keep an unaltered copy of the incoming text in the user's own texts (as `ORIGINAL--<name>`)? */
    let keepCopy = $state(false);

    // Runs after a file is loaded: split the newest file into paragraphs
    function onFileLoaded() {
        const latest = uploadedfiles[uploadedfiles.length - 1];
        if (latest) {
            loadSource = 'computer';
            loadName = latest.name.replace(/\.[^.]+$/, '');
            // Markdown: drop the table of contents and its {#anchor} header links first
            const isMarkdown = /\.(md|markdown)$/i.test(latest.name);
            previewMarkdown = isMarkdown;
            paragraphs = splitParagraphs(isMarkdown ? cleanMarkdown(latest.text) : latest.text);
            // Headers present but text above the first one: ask what to do with it
            const hasHeaders = paragraphs.some((p) => p.level > 0);
            // Text above the first header goes into a Frontmatter section (chosen as front matter
            // in the next step); then the front and back matter question
            if (hasHeaders) {
                if (paragraphs[0].level === 0) paragraphs = withFrontmatter(paragraphs);
                askMatter();
            }
        }
    }

    /** whether the text loaded in the preview is Markdown */
    let previewMarkdown = $state(false);
    /** whether the main text is Markdown, so the linear view renders it */
    let markdown = $state(false);

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
            frontmatter: true,
            children: []
        };
        return [header, ...list].map((p, i) => ({ ...p, originalIndex: i }));
    }

    // ---- Front and back matter question: after import, which top-level sections (if any) are which ----
    let matterOpen = $state(false);

    function askMatter() {
        if (paragraphs.some((p) => p.level > 0)) matterOpen = true;
    }

    /** @param {{ front: string[], back: string[] }} choice */
    function applyMatter({ front, back }) {
        paragraphs = paragraphs.map((p) => (p.level > 0 ? { ...p, frontmatter: front.includes(p.id), backmatter: back.includes(p.id) } : p));
    }

    // TEMPORARY fallback: when nothing is saved yet, load Dissertation.md into the main
    // pane with an automatic Frontmatter section (the file is gitignored, so this does
    // nothing where it is missing).
    const dissertationFiles = import.meta.glob('/src/lib/assets/Dissertation.md', { query: '?raw', import: 'default' });

    // ---- Saving: the main text lives in the database ----
    /** id of the saved text the main pane shows (null until it has been saved once) */
    /** @type {string | null} */
    let textId = null;
    let textTitle = $state('Untitled');
    /** autosave starts once the saved text (if any) has been loaded */
    let ready = $state(false);
    /** the list last loaded or saved, as JSON, so an unchanged text is not saved again */
    let lastSaved = '';
    /** saves run one after another */
    let queue = Promise.resolve();

    /** @param {{ id: string, text: string, level: number, frontmatter?: boolean, backmatter?: boolean, title?: string, description?: string }[]} list */
    const toItems = (list) =>
        list.map(({ id, text, level, frontmatter, backmatter, title, description }) => ({
            id,
            text,
            level,
            frontmatter: !!frontmatter,
            backmatter: !!backmatter,
            ...(level === 0 && title ? { title } : {}),
            ...(level === 0 && description ? { description } : {})
        }));

    /** Show the most recently changed saved text, if there is one. */
    async function loadSaved() {
        try {
            const texts = await (await fetch('/api/texts')).json();
            if (!texts.length) return false;
            const saved = await (await fetch(`/api/texts/${texts[0].id}`)).json();
            textId = saved.id;
            markdown = saved.items.some((/** @type {any} */ p) => p.level > 0);
            textTitle = saved.title;
            mainText = saved.items.map((/** @type {any} */ p, /** @type {number} */ i) => ({ ...p, originalIndex: i }));
            lastSaved = JSON.stringify(toItems(mainText));
            return true;
        } catch (err) {
            console.warn('Could not load the saved text', err);
            return false;
        }
    }

    /** Save the main text: create it the first time, replace its contents afterwards. */
    function save() {
        const items = toItems($state.snapshot(mainText));
        const json = JSON.stringify(items);
        if (json === lastSaved || (!items.length && !textId)) return;
        queue = queue.then(async () => {
            try {
                const res = textId
                    ? await fetch(`/api/texts/${textId}`, { method: 'PUT', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ items }) })
                    : await fetch('/api/texts', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ title: textTitle, items }) });
                if (!res.ok) throw new Error(`${res.status}`);
                if (!textId) textId = (await res.json()).id;
                lastSaved = json;
            } catch (err) {
                console.warn('Could not save the text', err);
            }
        });
    }

    // Save shortly after the text stops changing
    $effect(() => {
        if (!ready) return;
        void JSON.stringify(mainText); // depend on every paragraph
        const timer = setTimeout(save, 800);
        return () => clearTimeout(timer);
    });

    onMount(async () => {
        if (!(await loadSaved())) {
            const load = Object.values(dissertationFiles)[0];
            if (load) {
                const list = splitParagraphs(cleanMarkdown(/** @type {string} */ (await load())));
                const hasHeaders = list.some((p) => p.level > 0);
                textTitle = 'Dissertation';
                markdown = true;
                mainText = (hasHeaders && list[0]?.level === 0 ? withFrontmatter(list) : list).map((p, i) => ({
                    ...p,
                    originalIndex: i
                }));
            }
        }
        ready = true;
    });

    /** The main text shown in the main pane */
    /** @type {{ id: string, originalIndex: number, text: string, level: number }[]} */
    let mainText = $state([]);
    /** the text as the views show it: front and back matter stay in the data but are never drawn or compared */
    const shownText = $derived(withoutMatter(mainText));
    /** front and back matter, kept apart: the linear and hierarchical views offer them collapsed */
    const matter = $derived(matterSections(mainText));

    // ---- Undo / redo: one step per edit; kept for the whole session (not reset by changing mode) ----
    /** @type {History<typeof mainText>} */
    const history = new History();

    /** apply an edit to the main text, remembering the text it replaces */
    /** @param {typeof mainText} next */
    function commit(next) {
        history.record(mainText);
        mainText = next;
    }

    function undo() {
        const prev = history.undo(mainText);
        if (prev) mainText = prev;
    }

    function redo() {
        const next = history.redo(mainText);
        if (next) mainText = next;
    }

    /** Cmd/Ctrl+Z (undo) and Shift+Cmd/Ctrl+Z or Ctrl+Y (redo) in editing mode, leaving text fields to their own undo */
    /** @param {KeyboardEvent} e */
    function onKeydown(e) {
        if (!editing || !(e.metaKey || e.ctrlKey) || e.altKey) return;
        const t = /** @type {HTMLElement | null} */ (e.target);
        if (t?.closest('input, textarea, select, [contenteditable]')) return;
        const key = e.key.toLowerCase();
        if (key === 'z' && !e.shiftKey) undo();
        else if ((key === 'z' && e.shiftKey) || key === 'y') redo();
        else return;
        e.preventDefault();
    }

    // ---- Editing: delete a paragraph or section, after confirmation ----
    /** @type {{ title: string, message: string, confirm: string, run: () => void } | null} */
    let deleteRequest = $state(null);

    /** @param {number} n @param {string} word */
    const count = (n, word) => `${n} ${word}${n === 1 ? '' : 's'}`;

    /** @param {{ id: string, kind: 'paragraph' | 'section', scope?: 'only' | 'tree' }} req */
    function requestDelete({ id, kind, scope }) {
        const para = mainText.find((p) => p.id === id);
        if (!para) return;

        if (kind === 'paragraph') {
            const excerpt = para.text.length > 160 ? para.text.slice(0, 160) + '…' : para.text;
            deleteRequest = {
                title: 'Delete this paragraph?',
                message: `${excerpt.trim() ? `"${excerpt}"\n\n` : ''}This permanently deletes the paragraph.`,
                confirm: 'Delete paragraph',
                run: () => commit(removeParagraph(mainText, id))
            };
            return;
        }

        const info = describeSection(mainText, id);
        const inside = `${count(info.paragraphs, 'paragraph')} and ${count(info.sections, 'subsection')}`;
        deleteRequest =
            scope === 'tree'
                ? {
                      title: 'Delete section and all its descendants?',
                      message: `This permanently deletes the section${info.title.trim() ? ` "${info.title}"` : ''} and everything inside it: ${inside}.`,
                      confirm: 'Delete section and descendants',
                      run: () => commit(removeSection(mainText, id, true))
                  }
                : {
                      title: 'Delete just this section?',
                      message: `This permanently deletes the section heading${info.title.trim() ? ` "${info.title}"` : ''}. Its ${inside} stay in place.`,
                      confirm: 'Delete section',
                      run: () => commit(removeSection(mainText, id, false))
                  };
    }

    // ---- Editing: expand a paragraph or section into the editor modal ----
    /** @type {{ id: string, kind: 'paragraph' | 'section', from: DOMRect } | null} */
    let editRequest = $state(null);

    /** @param {{ id: string, title: string | null, position: number, fields?: { text: string, title: string, description: string } }} change */
    function saveEdit({ id, title, position, fields }) {
        let next = mainText;
        if (fields) next = next.map((p) => (p.id === id ? { ...p, ...fields } : p));
        if (title !== null && title.trim()) next = renameSection(next, id, title);
        commit(moveItem(next, id, position));
    }

    /** @param {{ id: string, targetId: string, place: import('#lib/utilities/editText.js').DropPlace }} drop */
    function moveByDrag(drop) {
        commit(applyDrop(mainText, drop, view === 'linear'));
    }

    /** @param {{ id: string, text: string, title?: string, description?: string }} edit only the fields given change */
    function editParagraph({ id, ...fields }) {
        commit(mainText.map((p) => (p.id === id ? { ...p, ...fields } : p)));
    }

    /** a just-injected empty paragraph the view should start editing at once (its body field), or null */
    /** @type {string | null} */
    let startEditId = $state(null);

    // ---- Editing: inject at an interstitial landing zone ----
    /** where the next injection from the Load Text modal goes (a gap in the main text), or null for the usual choice */
    /** @type {number | null} */
    let injectGap = $state(null);

    /** @param {{ targetId: string, place: 'before' | 'after', mode: 'empty' | 'load' }} req */
    function injectRequest({ targetId, place, mode }) {
        const gap = gapIndex(mainText, targetId, place, view === 'linear');
        if (gap === -1) return;
        if (mode === 'empty') {
            const item = { id: crypto.randomUUID(), originalIndex: 0, text: '', level: 0 };
            commit(insertAt(mainText, gap, [item]));
            startEditId = item.id; // the editing cursor goes straight into the new paragraph
        } else {
            injectGap = gap;
            dialogEl?.showModal();
        }
    }

    /**
     * Add an empty paragraph or section at a gap (the cascading view's plus). A new section's
     * level is its sibling's, or one below the section the gap is inside (1 at the top);
     * like any header it takes in what follows it up to the next header of its level or higher.
     * @param {{ targetId: string, place: 'before' | 'after', kind: 'paragraph' | 'section' }} req
     * @returns {string | undefined} the new item's id (the view centres its bubble)
     */
    function addAtGap({ targetId, place, kind }) {
        const at = gapIndex(mainText, targetId, place, false);
        if (at === -1) return;
        /** @type {{ id: string, originalIndex: number, text: string, level: number }} */
        let item = { id: crypto.randomUUID(), originalIndex: 0, text: '', level: 0 };
        if (kind === 'section') {
            let level = 1;
            for (let k = mainText.findIndex((p) => p.id === targetId); k >= 0; k--) {
                const lv = mainText[k].level ?? 0;
                if (lv > 0) {
                    level = Math.min(6, k === mainText.findIndex((p) => p.id === targetId) ? lv : lv + 1);
                    break;
                }
            }
            item = { ...item, level, text: `${'#'.repeat(level)} Untitled section` };
        }
        commit(insertAt(mainText, at, [item]));
        return item.id;
    }

    // ---- Load Text modal ----
    /** @type {HTMLDialogElement | undefined} */
    let dialogEl;

    function openModal() {
        injectGap = null;
        dialogEl?.showModal();
    }

    /** @param {MouseEvent} e */
    function onDialogClick(e) {
        // A click on the dialog element itself (not its contents) is a backdrop click
        // with a drop-down open, a click outside only closes the drop-down (the window's click handler does that)
        if (e.target === dialogEl && !injectOpen) dialogEl?.close();
    }

    function onModalClosed() {
        injectOpen = false;
        injectGap = null;
    }

    /**
     * Add the loaded text (the paragraphs in the preview) to the main text.
     * If the main text is empty, the loaded text simply becomes the main text.
     * 'replace' discards the existing main text and uses the loaded text instead.
     *
     * When the import makes a new text (the main text is empty, or it is replaced, and the
     * text is not going into a gap), the new text is named after the incoming file (without its
     * extension), and the old saved text is left as it is. If the user asked to keep an original
     * copy, the unaltered incoming text is first saved as its own text called `ORIGINAL--<name>`.
     * @param {'prepend' | 'append' | 'replace'} where
     */
    async function inject(where) {
        if (paragraphs.length === 0) return;
        if (keepCopy && loadSource !== 'own') {
            try {
                await saveOriginalCopy();
            } catch (err) {
                console.warn('Could not save the original copy', err);
                if (!confirm('The original copy could not be saved. Import the text anyway?')) return;
            }
        }
        const makesNewText = injectGap === null && (mainText.length === 0 || where === 'replace');
        // Copy with fresh ids so keys stay unique if the same text is injected twice
        const added = paragraphs.map((/** @type {any} */ p) => ({ id: crypto.randomUUID(), originalIndex: 0, text: p.text, level: p.level, ...(p.frontmatter ? { frontmatter: true } : {}), ...(p.backmatter ? { backmatter: true } : {}), ...(p.title ? { title: p.title } : {}), ...(p.description ? { description: p.description } : {}) }));
        const combined =
            injectGap !== null
                ? insertAt(mainText, injectGap, added)
                : mainText.length === 0 || where === 'replace'
                ? added
                : where === 'prepend'
                  ? [...added, ...mainText]
                  : [...mainText, ...added];
        if (makesNewText) {
            // a new text: saved under the incoming file's name on the next autosave
            textId = null;
            textTitle = loadName || 'Untitled';
            lastSaved = '';
        }
        commit(combined.map((p, i) => ({ ...p, originalIndex: i })));
        if (previewMarkdown) markdown = true;
        keepCopy = false; // asked afresh for every import

        // Reset the load pane: drop the loaded text and close the modal
        paragraphs = [];
        uploadedfiles = [];
        dialogEl?.close();
    }


    /** Save the loaded text, unaltered, as a text of its own named `ORIGINAL--<file name>` (fresh ids, so it shares nothing with the working text). */
    async function saveOriginalCopy() {
        const items = toItems(paragraphs.map((/** @type {any} */ p) => ({ ...p, id: crypto.randomUUID() })));
        const res = await fetch('/api/texts', {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify({ title: `ORIGINAL--${loadName}`, items })
        });
        if (!res.ok) throw new Error(`${res.status}`);
    }

    let injectOpen = $state(false);
        /** @type {HTMLDivElement | undefined} */
        let injectmenu;

    // ---- Mode: reading (default), editing, or commenting (the toggle's order) ----
    /** @typedef {'reading' | 'editing' | 'commenting'} Mode */
    /** @type {Mode} */
    let mode = $state('reading');
    /** @type {Mode[]} */
    const MODES = ['reading', 'editing', 'commenting'];
    const editing = $derived(mode === 'editing');
    /** nothing loaded: the app can only be in editing mode (so there is a way to start a text) */
    const noText = $derived(ready && mainText.length === 0);
    $effect(() => {
        if (noText) mode = 'editing';
    });

    // The mode icon changes with a horizontal wipe: the new icon is revealed left to right
    // while the old one is wiped away in the same direction.
    /** @param {Element} _node */
    const wipeIn = (_node) => ({ duration: 280, easing: cubicOut, css: (/** @type {number} */ t) => `clip-path: inset(0 ${(1 - t) * 100}% 0 0)` });
    /** @param {Element} _node */
    const wipeOut = (_node) => ({ duration: 280, easing: cubicOut, css: (/** @type {number} */ t) => `clip-path: inset(0 0 0 ${(1 - t) * 100}%)` });

    /** the triple toggle (editing, reading, commenting): each click moves to the next mode */
    function cycleMode() {
        if (noText) return;
        mode = MODES[(MODES.indexOf(mode) + 1) % MODES.length];
    }

    // ---- Map modal: a navigable map of the text's sections ----
    let mapOpen = $state(false);
    /** @type {HTMLDivElement | undefined} */
    let mainPane;
    /** @type {HierarchyViewer | undefined} */
    let hierarchy;
    /** the paragraph or section last focused or clicked in any view (or by a minimap): every view opens centred on it */
    let focusId = $state(/** @type {string | null} */ (null));

    /** Bring a section (the last of `ids`, outermost first) into view in the current view. */
    /** @param {string[]} ids */
    async function goToSection(ids) {
        focusId = ids[ids.length - 1] ?? focusId;
        if (view !== 'linear') return void hierarchy?.openPath(ids);
        await tick();
        mainPane?.querySelector(`[data-para="${CSS.escape(ids[ids.length - 1])}"]`)?.scrollIntoView({ block: 'start' });
    }

    // ---- Main pane view menu ----
    /** @type {'linear' | 'hierarchical' | 'cascading'} */
    let view = $state('linear');
    let viewOpen = $state(false);
    /** cascading view only: every section open at once, zoomed all the way out, colours only */
    let exploded = $state(false);
        /** @type {HTMLDivElement | undefined} */
        let viewmenu;

    /** @param {'linear' | 'hierarchical' | 'cascading'} v */
    function chooseView(v) {
        view = v;
        viewOpen = false;
    }

        function onWindowClick(e) {
            if (viewOpen && viewmenu && !viewmenu.contains(e.target)) viewOpen = false;
            if (injectOpen && injectmenu && !injectmenu.contains(e.target)) injectOpen = false;
        }
</script>

<!-- Main pane -->
<div class="flex h-[calc(100vh-57px)] bg-taupe1">
    <div class="flex min-w-0 flex-1 flex-col" bind:this={mainPane}>
        <!-- the text's title: floats above every view, never part of the text -->
        <header class="flex shrink-0 items-center gap-2 border-b border-taupe2 bg-taupe1 px-6 py-2 text-dark">
            <Scroll class="shrink-0" />
            <h1 class="truncate text-lg font-semibold" title={textTitle}>{textTitle}</h1>
        </header>
        <div class="min-h-0 flex-1">
        {#if view === 'linear'}
            <ParagraphViewer paragraphs={shownText} {startEditId} onstartedit={() => (startEditId = null)} {focusId} onfocusitem={(id) => (focusId = id)} {matter} {markdown} empty="No main text yet." synopsis ondelete={editing ? requestDelete : undefined} onexpand={editing ? (r) => (editRequest = r) : undefined} onmove={editing ? moveByDrag : undefined} oninject={editing ? injectRequest : undefined} onedit={editing ? editParagraph : undefined} />
        {:else if view === 'cascading'}
            <CascadingViewer bind:this={hierarchy} onsettings={(r) => (editRequest = r)} {focusId} onfocusitem={(id) => (focusId = id)} {exploded} paragraphs={shownText} empty="No main text yet." onmove={editing ? moveByDrag : undefined} onadd={editing ? addAtGap : undefined} onedit={editing ? editParagraph : undefined} />
        {:else}
            <HierarchyViewer bind:this={hierarchy} {startEditId} onstartedit={() => (startEditId = null)} {focusId} onfocusitem={(id) => (focusId = id)} paragraphs={shownText} {matter} empty="No main text yet." ondelete={editing ? requestDelete : undefined} onexpand={editing ? (r) => (editRequest = r) : undefined} onmove={editing ? moveByDrag : undefined} oninject={editing ? injectRequest : undefined} onedit={editing ? editParagraph : undefined} />
        {/if}
        </div>
    </div>

    <!-- Vertical menu column -->
    <nav aria-label="Menu" class="flex w-12 shrink-0 flex-col items-center gap-1 border-l border-taupe2 bg-taupe1 py-2">
        <button
            onclick={openModal}
            aria-label="Load text"
            use:tip={'Load text'}
            class="inline-flex items-center justify-center rounded-md p-1 text-dark hover:bg-taupe2"
        >
            <ArrowOutDownCircleHalf />
        </button>

        <!-- View menu: choices pop out to the left -->
        <div class="relative" bind:this={viewmenu}>
            <button
                onclick={() => (viewOpen = !viewOpen)}
                aria-label="Change view"
                use:tip={'Change view'}
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
                        use:tip={'Linear'}
                        onclick={() => chooseView('linear')}
                        class="inline-flex items-center justify-center rounded-md p-1 text-dark hover:bg-taupe2 {view === 'linear' ? 'bg-taupe2' : ''}"
                    >
                        <Queue />
                    </button>
                    <button
                        role="menuitemradio"
                        aria-checked={view === 'hierarchical'}
                        aria-label="Hierarchical"
                        use:tip={'Hierarchical'}
                        onclick={() => chooseView('hierarchical')}
                        class="inline-flex items-center justify-center rounded-md p-1 text-dark hover:bg-taupe2 {view === 'hierarchical' ? 'bg-taupe2' : ''}"
                    >
                        <Sitemap />
                    </button>
                    <button
                        role="menuitemradio"
                        aria-checked={view === 'cascading'}
                        aria-label="Cascading"
                        use:tip={'Cascading'}
                        onclick={() => chooseView('cascading')}
                        class="inline-flex items-center justify-center rounded-md p-1 text-dark hover:bg-taupe2 {view === 'cascading' ? 'bg-taupe2' : ''}"
                    >
                        <StepsDown />
                    </button>
                </div>
            {/if}
        </div>

        {#if view === 'cascading'}
            <!-- View-particular settings: shown under the view button, only in this view -->
            <div class="flex w-full flex-col items-center gap-1 border-y border-taupe2 py-1">
                <button
                    onclick={() => (exploded = !exploded)}
                    aria-label={exploded ? 'Unexplode' : 'Explode'}
                    aria-pressed={exploded}
                    use:tip={exploded ? 'Unexplode' : 'Explode'}
                    class="inline-flex items-center justify-center rounded-md p-1 text-dark hover:bg-taupe2 {exploded ? 'bg-taupe2' : ''}"
                >
                    {#if exploded}<Explosion />{:else}<Bomb />{/if}
                </button>
            </div>
        {/if}

        <button
            onclick={() => (mapOpen = true)}
            aria-label="Map"
            use:tip={'Map'}
            class="inline-flex items-center justify-center rounded-md p-1 text-dark hover:bg-taupe2"
        >
            <MapIcon />
        </button>

        <button
            onclick={cycleMode}
            aria-label="Mode"
            use:tip={noText ? 'Editing mode (no text is loaded)' : `${mode[0].toUpperCase() + mode.slice(1)} mode`}
            aria-disabled={noText}
            class="inline-grid items-center justify-center rounded-md p-1 text-dark {noText ? 'cursor-not-allowed opacity-60' : 'hover:bg-taupe2'}"
        >
            {#key mode}
                <span in:wipeIn out:wipeOut class="inline-flex [grid-area:1/1]">
                    {#if mode === 'editing'}<Edit />{:else if mode === 'commenting'}<Discussion />{:else}<Reading />{/if}
                </span>
            {/key}
        </button>

        {#if editing}
            <!-- Editing helpers: shown under the mode button, only in editing mode -->
            <div class="flex w-full flex-col items-center gap-1 border-y border-taupe2 py-1">
                <button onclick={undo} disabled={!history.canUndo} aria-label="Undo" use:tip={'Undo'} class="inline-flex items-center justify-center rounded-md p-1 text-dark hover:bg-taupe2 disabled:opacity-30 disabled:hover:bg-transparent"><Undo /></button>
                <button onclick={redo} disabled={!history.canRedo} aria-label="Redo" use:tip={'Redo'} class="inline-flex items-center justify-center rounded-md p-1 text-dark hover:bg-taupe2 disabled:opacity-30 disabled:hover:bg-transparent"><Redo /></button>
            </div>
        {/if}
    </nav>
</div>

<MenuTip />
<ConfirmDialog bind:request={deleteRequest} />
<MapModal bind:open={mapOpen} title={textTitle} paragraphs={shownText} onnavigate={goToSection} />
<MapModal mode="matter" bind:open={matterOpen} onchoose={applyMatter} title={loadName} paragraphs={paragraphs} />
<EditModal bind:request={editRequest} list={mainText} onsave={saveEdit} />

<!-- Load Text modal -->
<!-- svelte-ignore a11y_click_events_have_key_events, a11y_no_noninteractive_element_interactions -->
<dialog
    bind:this={dialogEl}
    onclick={onDialogClick}
    onclose={onModalClosed}
    class="relative m-auto {paragraphs.length === 0 ? 'h-64 w-[min(92vw,26rem)]' : 'h-[80vh] w-[min(92vw,64rem)]'} overflow-hidden rounded-lg border border-taupe2 bg-taupe1 p-4 text-dark backdrop:bg-black/40 open:flex open:flex-col"
>
    <div class="flex shrink-0 items-start justify-between">
        <!-- Load sources: each is its own button, centered until a text is loaded, then top-left -->
        <div class={paragraphs.length === 0 ? 'pointer-events-none absolute inset-0 z-40 flex items-center justify-center' : 'inline-block'}>
            <div class="pointer-events-auto relative z-50 inline-flex gap-5">
                <UploadButton bind:uploadedfiles onloaded={onFileLoaded} />
                <SourceButton name="From Your Texts"><Swatch width={40} height={40} /></SourceButton>
                <SourceButton name="From Other Exegeezers"><Mesh width={40} height={40} /></SourceButton>
            </div>
        </div>

        <button
            onclick={() => dialogEl?.close()}
            aria-label="Close"
            class="relative z-50 ml-auto rounded-md px-2 py-1 text-lg leading-none text-dark hover:bg-taupe2"
        >
            ×
        </button>
    </div>

    <!-- text preview pane: hidden until a text is loaded -->
    {#if paragraphs.length > 0}
    <section class="mt-4 flex min-h-0 flex-1 flex-col overflow-hidden rounded-md border border-taupe2">
        <header class="flex shrink-0 items-center justify-between border-b border-taupe2 bg-taupe2 px-3 py-2">
            <h2 class="text-sm font-semibold text-dark">
                Preview{#if injectGap !== null}<span class="ml-2 font-normal text-grey3">— will be injected at the chosen location</span>{/if}
            </h2>

            <div class="flex items-center gap-4">
            <!-- the import question (not asked for the user's own texts) -->
            {#if loadSource !== 'own'}
                <label class="flex items-center gap-1.5 text-xs text-dark" title="Saves an unaltered copy of the incoming text in your texts as ORIGINAL--{loadName}">
                    <input type="checkbox" bind:checked={keepCopy} class="accent-violet" />
                    Keep an original copy in my texts
                </label>
            {/if}

            <!-- Inject Loaded Text dropdown -->
            <div class="relative" bind:this={injectmenu}>
                <button
                    onclick={() => (mainText.length === 0 || injectGap !== null ? inject('append') : (injectOpen = !injectOpen))}
                    disabled={paragraphs.length === 0}
                    aria-haspopup={mainText.length > 0 && injectGap === null ? 'menu' : undefined}
                    aria-expanded={mainText.length > 0 && injectGap === null ? injectOpen : undefined}
                    class="inline-flex items-center gap-1 rounded-md bg-violet px-3 py-1 text-xs font-medium text-white hover:bg-violet/90 disabled:cursor-not-allowed disabled:opacity-50 disabled:hover:bg-violet"
                >
                    Inject Loaded Text
                    {#if mainText.length > 0 && injectGap === null}
                        <svg class="h-4 w-4 transition-transform {injectOpen ? 'rotate-180' : ''}" viewBox="0 0 20 20" fill="currentColor">
                            <path d="M5.23 7.21a.75.75 0 011.06.02L10 11.17l3.71-3.94a.75.75 0 111.08 1.04l-4.25 4.5a.75.75 0 01-1.08 0l-4.25-4.5a.75.75 0 01.02-1.06z" />
                        </svg>
                    {/if}
                </button>

                {#if injectOpen && mainText.length > 0 && injectGap === null}
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
            </div>
        </header>

        <div class="min-h-0 flex-1">
            <ParagraphViewer {paragraphs} markdown={previewMarkdown} empty="No text loaded yet." />
        </div>
    </section>
    {/if}
</dialog>

<svelte:window onclick={onWindowClick} onkeydown={(e) => {
        onKeydown(e);
    }} />
