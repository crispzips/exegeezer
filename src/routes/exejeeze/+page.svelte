<script>
    import { onMount, tick } from 'svelte';
    import { EXAMPLE_ITEMS, EXAMPLE_TITLE } from '#lib/exampleText.js';
    import MenuTip from '#lib/components/MenuTip.svelte';
    import { tip } from '#lib/utilities/menuTip.svelte.js';
    import { cubicOut } from 'svelte/easing';
    import { replaceState } from '$app/navigation';
    import { ArrowOutDownCircleHalf, Discussion, PencilEditCircle, EyeAlt, MapIcon, Queue, Reading, Redo, Sitemap, Undo, Mesh, Swatch, StepsDown, Bomb, Explosion, Scroll, Sapling, FileCog, CopyPlus, Trash, ToiletRoll } from '@boxicons/svelte';
    import UploadButton from '#lib/components/UploadButton.svelte';
    import SourceButton from '#lib/components/SourceButton.svelte';
    import ParagraphViewer from '#lib/components/ParagraphViewer.svelte';
    import CascadingViewer from '#lib/components/CascadingViewer.svelte';
    import HierarchyViewer from '#lib/components/HierarchyViewer.svelte';
    import { cleanMarkdown } from '#lib/utilities/cleanMarkdown.js';
    import { splitParagraphs } from '#lib/utilities/splitParagraphs.js';
    import ConfirmDialog from '#lib/components/ConfirmDialog.svelte';
    import NewTextDialog from '#lib/components/NewTextDialog.svelte';
    import TextSettingsModal from '#lib/components/TextSettingsModal.svelte';
    import EditModal from '#lib/components/EditModal.svelte';
    import MapModal from '#lib/components/MapModal.svelte';
    import { History } from '#lib/utilities/history.svelte.js';
    import { withoutMatter, matterSections } from '#lib/utilities/matter.js';
    import { applyDrop, danglingCount, describeSection, gapIndex, insertAt, moveItem, removeParagraph, removeSection, renameSection } from '#lib/utilities/editText.js';

    /** the layout's data: `user` is the signed-in user, or null (then the app shows the example text and nothing else works) */
    let { data } = $props();
    const authed = $derived(!!data.user);

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
        const headers = list.filter((p) => p.level > 0).map((p) => p.level);
        const level = headers.length ? Math.min(...headers) : 1;
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
    let textId = $state(null);
    let textTitle = $state('Untitled');
    /** the names the loaded text is by (empty: none shown) */
    /** @type {string[]} */
    let textAuthors = $state([]);
    /** 'private' | 'public', chosen in the new-text dialog before a text is first saved */
    let textVisibility = '';
    /** @type {{ title: string, run: (v: { title: string, visibility: string }) => void } | null} */
    let newTextRequest = $state(null);
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

    /** Replace what the main pane shows with a saved text. @param {string} id */
    async function showSaved(id) {
        const res = await fetch(`/api/texts/${id}`);
        if (!res.ok) throw new Error(`${res.status}`);
        const saved = await res.json();
        textId = saved.id;
        markdown = saved.items.some((/** @type {any} */ p) => p.level > 0);
        textTitle = saved.title;
        textAuthors = saved.authors ?? [];
        mainText = saved.items.map((/** @type {any} */ p, /** @type {number} */ i) => ({ ...p, originalIndex: i }));
        lastSaved = JSON.stringify(toItems(mainText));
        history.clear();
        focusId = null;
        startEditId = null;
        replaceState(`/exejeeze?text=${saved.id}`, {});
    }

    /** Make an identical copy (COPYOF--<name>) and show it in place of the original. */
    async function duplicate() {
        const id = textId;
        if (!id) return;
        try {
            await queue; // let any save in flight finish first
            const res = await fetch(`/api/texts/${id}/duplicate`, { method: 'POST' });
            if (!res.ok) throw new Error(`${res.status}`);
            await showSaved((await res.json()).id);
        } catch (err) {
            console.warn('Could not duplicate the text', err);
            alert('Could not duplicate the text.');
        }
    }

    /** Show the most recently changed saved text, if there is one. */
    async function loadSaved() {
        try {
            const texts = await (await fetch('/api/texts')).json();
            if (!texts.length) return false;
            // ?text=<id> (from the profile page) picks which text to open; otherwise the most recent
            const wanted = new URLSearchParams(location.search).get('text');
            const pick = texts.find((/** @type {any} */ t) => t.id === wanted) ?? texts[0];
            await showSaved(pick.id);
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
        if (!textId && !textVisibility) {
            // a new text: ask for its name and visibility first, then save
            if (!newTextRequest) {
                newTextRequest = {
                    title: textTitle,
                    run: ({ title, visibility }) => {
                        textTitle = title;
                        textVisibility = visibility;
                        save();
                    }
                };
            }
            return;
        }
        queue = queue.then(async () => {
            try {
                const res = textId
                    ? await fetch(`/api/texts/${textId}`, { method: 'PUT', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ items }) })
                    : await fetch('/api/texts', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ title: textTitle, visibility: textVisibility, items }) });
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
        if (!authed) {
            // signed out: the example text, read-only; nothing is loaded or saved (`ready` stays false)
            textTitle = EXAMPLE_TITLE;
            markdown = true;
            mainText = EXAMPLE_ITEMS.map((p) => ({ ...p }));
            return;
        }
        // ?new (from the profile page): start a blank text, in writing mode
        const startNew = new URLSearchParams(location.search).has('new');
        if (!startNew && !(await loadSaved())) {
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

    /**
     * Apply an edit to the main text, remembering the text it replaces. Paragraphs have to be inside sections, in
     * every view: an edit that would leave a new paragraph dangling (above the first section) is refused.
     * @param {typeof mainText} next
     * @returns {boolean} whether the edit was applied
     */
    function commit(next) {
        if (danglingCount(next) > danglingCount(mainText)) {
            alert('Paragraphs have to be inside a section. Add a section first.');
            return false;
        }
        history.record(mainText);
        mainText = next;
        return true;
    }

    function undo() {
        const prev = history.undo(mainText);
        if (prev) mainText = prev;
    }

    function redo() {
        const next = history.redo(mainText);
        if (next) mainText = next;
    }

    /** Cmd/Ctrl+Z (undo) and Shift+Cmd/Ctrl+Z or Ctrl+Y (redo) in writing mode, leaving text fields to their own undo */
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

    /** @param {{ id: string, title: string }} change a section's new title */
    function renameSectionTitle({ id, title }) {
        if (title.trim()) commit(renameSection(mainText, id, title));
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

    /** Enter in a paragraph: a new empty paragraph directly below it, opened for writing. @param {string} id */
    function newParagraphBelow(id) {
        const at = mainText.findIndex((p) => p.id === id) + 1;
        if (at === 0) return;
        const item = { id: crypto.randomUUID(), originalIndex: 0, text: '', level: 0 };
        if (commit(insertAt(mainText, at, [item]))) startEditId = item.id;
    }

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
            if (commit(insertAt(mainText, gap, [item]))) startEditId = item.id; // the editing cursor goes straight into the new paragraph
        } else {
            injectGap = gap;
            dialogEl?.showModal();
        }
    }

    /**
     * Add an empty paragraph or section at a gap (the cascading view's plus). A new section's
     * level is its sibling's, or one below the section the gap is inside (1 at the top);
     * like any header it takes in what follows it up to the next header of its level or higher.
     * @param {{ targetId: string, place: 'before' | 'after' | 'inside', kind: 'paragraph' | 'section' }} req
     * @returns {string | undefined} the new item's id (the view centres its bubble)
     */
    function addAtGap({ targetId, place, kind }) {
        // 'inside': the first item of a section, right after its header
        const target = mainText.findIndex((p) => p.id === targetId);
        const at = place === 'inside' ? (target === -1 ? -1 : target + 1) : gapIndex(mainText, targetId, place, false);
        if (at === -1) return;
        /** @type {{ id: string, originalIndex: number, text: string, level: number }} */
        let item = { id: crypto.randomUUID(), originalIndex: 0, text: '', level: 0 };
        if (kind === 'section' && place === 'inside') {
            const level = Math.min(6, (mainText[target].level ?? 0) + 1);
            item = { ...item, level, text: `${'#'.repeat(level)} Untitled section` };
        } else if (kind === 'section') {
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
        return commit(insertAt(mainText, at, [item])) ? item.id : undefined;
    }

    /** where the "Seed a text" button is: not clicked yet, or offering heading levels (a text begins with a section: paragraphs have to be inside sections) */
    /** @type {'idle' | 'level'} */
    let seedStep = $state('idle');
    /** what the seed area shows: with no text loaded it starts as the "Seed a text" button; a loaded text that is merely blank goes straight to the choices */
    const seedPhase = $derived(seedStep === 'idle' && textId ? 'level' : seedStep);
    /**
     * The heading levels a new section may have: 1 up to one deeper than the text already goes
     * (so the first section is a heading 1 and no needless depth is created).
     */
    const seedLevels = $derived(
        Array.from({ length: Math.min(6, mainText.reduce((deepest, p) => Math.max(deepest, p.level ?? 0), 0) + 1) }, (_, i) => i + 1)
    );

    /**
     * Begin a text with one empty section.
     * @param {number} [level] its heading level
     */
    function seedText(level = 1) {
        seedStep = 'idle';
        if (commit([{ id: crypto.randomUUID(), originalIndex: 0, text: `${'#'.repeat(level)} Untitled section`, level }])) markdown = true;
    }

    // ---- Whole-text menu (in the header): settings, delete, wipe clean ----
    /** @type {{ id: string } | null} */
    let settingsRequest = $state(null);

    /** Show no text at all: the viewer as it is when nothing is loaded. */
    function unloadText() {
        textId = null;
        textVisibility = '';
        textTitle = 'Untitled';
        textAuthors = [];
        lastSaved = '';
        mainText = [];
        seedStep = 'idle';
        history.clear();
        focusId = null;
        startEditId = null;
        replaceState('/exejeeze?new', {});
    }

    /** @param {string} url @param {'DELETE' | 'POST'} method */
    async function wholeTextCall(url, method) {
        await queue; // let any save in flight finish first
        const res = await fetch(url, { method });
        if (!res.ok) throw new Error(`${res.status}`);
    }

    /** @param {'delete' | 'wipe'} kind */
    function requestWhole(kind) {
        const id = textId;
        if (!id) return;
        const name = textTitle.trim() ? `"${textTitle}"` : 'this text';
        deleteRequest =
            kind === 'delete'
                ? {
                      title: 'Delete this whole text?',
                      message: `This permanently deletes ${name}, its content and its settings. This cannot be undone.`,
                      confirm: 'Delete text',
                      run: () => runWhole(`/api/texts/${id}`, 'DELETE', 'delete the text')
                  }
                : {
                      title: 'Wipe this text clean?',
                      message: `This permanently erases all of the content of ${name}. The text itself and its settings stay, as a blank slate. This cannot be undone.`,
                      confirm: 'Wipe clean',
                      run: () => runWhole(`/api/texts/${id}/wipe`, 'POST', 'wipe the text')
                  };
    }

    /** @param {string} url @param {'DELETE' | 'POST'} method @param {string} what */
    async function runWhole(url, method, what) {
        try {
            await wholeTextCall(url, method);
        } catch (err) {
            console.warn(`Could not ${what}`, err);
            alert(`Could not ${what}.`);
            return;
        }
        unloadText();
    }

    // ---- Load Text modal ----
    /** @type {HTMLDialogElement | undefined} */
    let dialogEl;

    function openModal() {
        if (!authed) return;
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
        let combined =
            injectGap !== null
                ? insertAt(mainText, injectGap, added)
                : mainText.length === 0 || where === 'replace'
                ? added
                : where === 'prepend'
                  ? [...added, ...mainText]
                  : [...mainText, ...added];
        // paragraphs have to be inside sections: text with none above its first header goes into a Frontmatter section
        if (combined[0] && (combined[0].level ?? 0) === 0 && danglingCount(combined) > (makesNewText ? 0 : danglingCount(mainText))) {
            combined = withFrontmatter(combined);
        }
        if (makesNewText) {
            // a new text: saved under the incoming file's name on the next autosave
            textId = null;
            textVisibility = ''; // asked again for the new text
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
            body: JSON.stringify({ title: `ORIGINAL--${loadName}`, visibility: 'private', items })
        });
        if (!res.ok) throw new Error(`${res.status}`);
    }

    let injectOpen = $state(false);
        /** @type {HTMLDivElement | undefined} */
        let injectmenu;

    // ---- Mode: reading (default), editing, or commenting (the toggle's order) ----
    /** @typedef {'reading' | 'writing' | 'commenting'} Mode */
    /** @type {Mode} */
    let mode = $state('reading');
    /** @type {Mode[]} */
    const MODES = ['reading', 'writing', 'commenting'];
    /** whether the text can be changed (writing mode) */
    const editing = $derived(mode === 'writing');
    /** nothing loaded: the app can only be in writing mode (so there is a way to start a text) */
    const noText = $derived(ready && mainText.length === 0);
    $effect(() => {
        if (noText) mode = 'writing';
        else if (!authed) mode = 'reading';
    });
    /** the mode button is locked when there is no text (editing only) or nobody is signed in (reading only) */
    const modeLocked = $derived(noText || !authed);

    // The mode icon changes with a horizontal wipe: the new icon is revealed left to right
    // while the old one is wiped away in the same direction.
    /** @param {Element} _node */
    const wipeIn = (_node) => ({ duration: 280, easing: cubicOut, css: (/** @type {number} */ t) => `clip-path: inset(0 ${(1 - t) * 100}% 0 0)` });
    /** @param {Element} _node */
    const wipeOut = (_node) => ({ duration: 280, easing: cubicOut, css: (/** @type {number} */ t) => `clip-path: inset(0 0 0 ${(1 - t) * 100}%)` });

    /** the triple toggle (editing, reading, commenting): each click moves to the next mode */
    function cycleMode() {
        if (modeLocked) return;
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
            {#if authed && textId && textAuthors.length}
                <!-- the byline: names in the sans font, the connecting words in the script font -->
                <p class="min-w-0 truncate py-1 text-lg font-semibold">
                    <span class="font-script text-2xl leading-none font-normal">by</span><span class="ml-2">{#each textAuthors as name, i (i)}{#if i > 0}{#if i === textAuthors.length - 1}{#if textAuthors.length > 2}<span class="font-script text-2xl leading-none font-normal">,</span>{/if}<span class="font-script mx-2 text-2xl leading-none font-normal">and</span>{:else}<span class="font-script mr-2 text-2xl leading-none font-normal">,</span>{/if}{/if}{name}{/each}</span>
                </p>
            {/if}
            {#if authed && textId}
                <!-- the whole-text menu -->
                <span aria-hidden="true" class="shrink-0 cursor-default text-xl leading-none font-bold whitespace-pre text-taupe5 select-none">· · ·</span>
                <div role="menu" aria-label="Whole text" class="flex shrink-0 items-center gap-1">
                    <button role="menuitem" onclick={() => (settingsRequest = { id: /** @type {string} */ (textId) })} aria-label="Text settings" use:tip={'Text settings'} data-tip-place="below" class="inline-flex items-center justify-center rounded-md p-1 hover:bg-taupe2"><FileCog /></button>
                    <button role="menuitem" onclick={duplicate} aria-label="Duplicate text" use:tip={'Duplicate text'} data-tip-place="below" class="inline-flex items-center justify-center rounded-md p-1 hover:bg-taupe2"><CopyPlus /></button>
                    <button role="menuitem" onclick={() => requestWhole('delete')} aria-label="Delete text" use:tip={'Delete text'} data-tip-place="below" class="inline-flex items-center justify-center rounded-md p-1 hover:bg-taupe2"><Trash /></button>
                    <button role="menuitem" onclick={() => requestWhole('wipe')} aria-label="Wipe clean" use:tip={'Wipe clean'} data-tip-place="below" class="inline-flex items-center justify-center rounded-md p-1 hover:bg-taupe2"><ToiletRoll /></button>
                </div>
            {/if}
            {#if !authed}
                <span class="ml-auto flex shrink-0 items-center gap-3 text-sm text-grey3">
                    <span class="hidden sm:inline">You're viewing an example text.</span>
                </span>
            {/if}
        </header>
        <div class="relative min-h-0 flex-1">
        {#if noText && authed}
            <!-- nothing is loaded: one button to begin -->
            <div class="pointer-events-none absolute inset-0 z-10 flex items-center justify-center">
                {#if seedPhase === 'level'}
                    <!-- the heading levels on offer: only as deep as the text already goes, plus one -->
                    <div class="pointer-events-auto flex items-center gap-5">
                        {#each seedLevels as n (n)}
                            <button onclick={() => seedText(n)} aria-label="Heading {n}" use:tip={`Heading ${n}`} data-tip-place="below" class="pop-in flex h-16 w-16 items-center justify-center rounded-full border border-taupe3 bg-taupe1 text-taupe5 [box-shadow:0_3px_3px_var(--color-taupe4)] hover:bg-taupe2">
                                <span class="text-3xl leading-none font-semibold" style="font-family: Georgia, serif">{'#'.repeat(n)}</span>
                            </button>
                        {/each}
                    </div>
                {:else}
                    <button onclick={() => (seedStep = 'level')} class="pop-in pointer-events-auto inline-flex items-center gap-2 rounded-md bg-violet px-5 py-3 text-lg font-medium text-taupe1 hover:bg-violet/90">
                        <Sapling class="text-taupe1!" /> Seed a text
                    </button>
                {/if}
            </div>
        {/if}
        {#if view === 'linear'}
            <ParagraphViewer onnewbelow={editing ? newParagraphBelow : undefined} paragraphs={shownText} {startEditId} onstartedit={() => (startEditId = null)} {focusId} onfocusitem={(id) => (focusId = id)} {matter} {markdown} empty="" synopsis ondelete={editing ? requestDelete : undefined} onexpand={editing ? (r) => (editRequest = r) : undefined} onmove={editing ? moveByDrag : undefined} oninject={editing ? injectRequest : undefined} onedit={editing ? editParagraph : undefined} />
        {:else if view === 'cascading'}
            <CascadingViewer bind:this={hierarchy} onrename={editing ? renameSectionTitle : undefined} {focusId} onfocusitem={(id) => (focusId = id)} {exploded} paragraphs={shownText} empty="" onmove={editing ? moveByDrag : undefined} onadd={editing ? addAtGap : undefined} onedit={editing ? editParagraph : undefined} />
        {:else}
            <HierarchyViewer onnewbelow={editing ? newParagraphBelow : undefined} bind:this={hierarchy} {startEditId} onstartedit={() => (startEditId = null)} {focusId} onfocusitem={(id) => (focusId = id)} paragraphs={shownText} {matter} empty="" ondelete={editing ? requestDelete : undefined} onexpand={editing ? (r) => (editRequest = r) : undefined} onmove={editing ? moveByDrag : undefined} oninject={editing ? injectRequest : undefined} onedit={editing ? editParagraph : undefined} />
        {/if}
        </div>
    </div>

    <!-- Vertical menu column -->
    <nav aria-label="Menu" class="flex w-12 shrink-0 flex-col items-center gap-1 border-l border-taupe2 bg-taupe1 py-2">
        <button
            onclick={openModal}
            aria-label="Load text"
            aria-disabled={!authed}
            use:tip={authed ? 'Load text' : 'Load text (sign in first)'}
            class="inline-flex items-center justify-center rounded-md p-1 text-dark {authed ? 'hover:bg-taupe2' : 'cursor-not-allowed opacity-60'}"
        >
            <ArrowOutDownCircleHalf />
        </button>

        <!-- View menu: the choices open below the button, set off by thin lines like the editing helpers -->
        <div class="flex w-full flex-col items-center gap-1" bind:this={viewmenu}>
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
                    class="flex w-full flex-col items-center gap-1 border-y border-taupe2 py-1"
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
            use:tip={!authed ? 'Reading mode (sign in to edit)' : noText ? 'Writing mode (no text is loaded)' : `${mode[0].toUpperCase() + mode.slice(1)} mode`}
            aria-disabled={modeLocked}
            class="inline-grid items-center justify-center rounded-md p-1 text-dark {modeLocked ? 'cursor-not-allowed opacity-60' : 'hover:bg-taupe2'}"
        >
            {#key mode}
                <span in:wipeIn out:wipeOut class="inline-flex [grid-area:1/1]">
                    {#if mode === 'writing'}<PencilEditCircle />{:else if mode === 'commenting'}<Discussion />{:else}<Reading />{/if}
                </span>
            {/key}
        </button>

        {#if editing}
            <!-- Writing helpers: shown under the mode button, only in writing mode -->
            <div class="flex w-full flex-col items-center gap-1 border-y border-taupe2 py-1">
                <button onclick={undo} disabled={!history.canUndo} aria-label="Undo" use:tip={'Undo'} class="inline-flex items-center justify-center rounded-md p-1 text-dark hover:bg-taupe2 disabled:opacity-30 disabled:hover:bg-transparent"><Undo /></button>
                <button onclick={redo} disabled={!history.canRedo} aria-label="Redo" use:tip={'Redo'} class="inline-flex items-center justify-center rounded-md p-1 text-dark hover:bg-taupe2 disabled:opacity-30 disabled:hover:bg-transparent"><Redo /></button>
            </div>
        {/if}
    </nav>
</div>

<MenuTip />
<ConfirmDialog bind:request={deleteRequest} />
<NewTextDialog bind:request={newTextRequest} />
<TextSettingsModal bind:request={settingsRequest} onsaved={({ title, authors }) => ((textTitle = title), (textAuthors = authors))} />
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
                        class="absolute right-0 z-10 mt-2 w-40 origin-top-right raised rounded-md py-1 shadow-lg"
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
