<script>
    import { onMount, tick, untrack } from 'svelte';
    import { slide } from 'svelte/transition';
    import { EXAMPLE_ITEMS, EXAMPLE_TITLE } from '#lib/exampleText.js';
    import MenuTip from '#lib/components/MenuTip.svelte';
    import { tip } from '#lib/utilities/menuTip.svelte.js';
    import { cubicOut } from 'svelte/easing';
    import { replaceState } from '$app/navigation';
    import { ArrowOutDownCircleHalf, Discussion, PencilEditCircle, MapIcon, Queue, BookOpen, Redo, Sitemap, Undo, Mesh, Swatch, StepsDown, Bomb, Explosion, Scroll, Sapling, FlagChequered, TextHeight, Tachometer, Search, FontFamily, LineSpacing, LetterSpacing, MarginLeft, MarginTop, GlobeAlt2, FileCog, CopyPlus, Trash, ToiletRoll, Cog, X, Clipboard, ClipboardPlus } from '@boxicons/svelte';
    import UploadButton from '#lib/components/UploadButton.svelte';
    import SourceButton from '#lib/components/SourceButton.svelte';
    import ParagraphViewer from '#lib/components/ParagraphViewer.svelte';
    import CascadingViewer from '#lib/components/CascadingViewer.svelte';
    import RallySetup from '#lib/components/RallySetup.svelte';
    import RallyViewer from '#lib/components/RallyViewer.svelte';
    import RallyWriter from '#lib/components/RallyWriter.svelte';
    import { emphasis } from '#lib/emphasis.svelte.js';
    import { READ_WPM, SIZES, DEFAULT_SIZE, WRITING_COLOUR } from '#lib/utilities/rallyChunks.js';
    import HierarchyViewer from '#lib/components/HierarchyViewer.svelte';
    import { cleanMarkdown } from '#lib/utilities/cleanMarkdown.js';
    import { splitParagraphs } from '#lib/utilities/splitParagraphs.js';
    import ConfirmDialog from '#lib/components/ConfirmDialog.svelte';
    import CommentDialog from '#lib/components/CommentDialog.svelte';
    import NewTextDialog from '#lib/components/NewTextDialog.svelte';
    import TextSettingsModal from '#lib/components/TextSettingsModal.svelte';
    import NewItemChooser from '#lib/components/NewItemChooser.svelte';
    import EditModal from '#lib/components/EditModal.svelte';
    import MapModal from '#lib/components/MapModal.svelte';
    import OwnTextsDialog from '#lib/components/OwnTextsDialog.svelte';
    import OpenSourcesDialog from '#lib/components/OpenSourcesDialog.svelte';
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
    /** @type {'computer' | 'others' | 'own' | 'web'} */
    let loadSource = $state('computer');
    /** what to tell the user about the text loaded from an open library (e.g. that it was machine-scanned) */
    /** @type {string[]} */
    let loadNotes = $state([]);
    /** where the text in the preview came from and its rights: one entry per work (from an open library, or kept by an own text that was itself imported) */
    /** @type {Record<string, string>[]} */
    let loadDetails = $state([]);
    /** imported details waiting to be saved with the main text (the next autosave sends them) */
    /** @type {Record<string, string>[]} */
    let pendingDetails = $state([]);
    /** the loaded file's name without its extension (names the new text and the ORIGINAL-- copy) */
    let loadName = $state('');
    /** the import question: keep an unaltered copy of the incoming text in the user's own texts (as `ORIGINAL--<name>`)? */
    let keepCopy = $state(false);

    // Runs after a file is loaded: split the newest file into paragraphs
    function onFileLoaded() {
        const latest = uploadedfiles[uploadedfiles.length - 1];
        if (latest) {
            loadSource = 'computer';
            loadNotes = [];
            loadDetails = [];
            loadName = latest.name.replace(/\.[^.]+$/, '');
            // Markdown: drop the table of contents and its {#anchor} header links first
            const isMarkdown = /\.(md|markdown)$/i.test(latest.name);
            previewMarkdown = isMarkdown;
            paragraphs = splitParagraphs(isMarkdown ? cleanMarkdown(latest.text) : latest.text);
            showLoadModal();
            // Text above the first header goes into a Frontmatter section, marked as front matter to begin with
            // (the map beside the preview is where front and back matter are chosen)
            if (paragraphs.some((p) => p.level > 0) && paragraphs[0].level === 0) paragraphs = withFrontmatter(paragraphs);
        }
    }

    let ownTextsOpen = $state(false);
    let openSourcesOpen = $state(false);

    /** A text chosen in the "Open Libraries" modal becomes the text in the preview.
     * @param {{ title: string, markdown: string, details: Record<string, string>[], notes: string[] }} t */
    function onWebTextChosen(t) {
        loadSource = 'web';
        loadName = t.title;
        loadNotes = t.notes ?? [];
        loadDetails = t.details ?? [];
        previewMarkdown = true;
        paragraphs = splitParagraphs(cleanMarkdown(t.markdown));
        showLoadModal();
        // as with a file: text above the first header goes into a Frontmatter section
        if (paragraphs.some((p) => p.level > 0) && paragraphs[0].level === 0) paragraphs = withFrontmatter(paragraphs);
    }

    /** One of the user's own texts, chosen in the "From Your Texts" modal, becomes the text in the preview.
     * @param {{ id: string, title: string, items: any[], importedDetails?: Record<string, string>[] }} saved */
    function onOwnTextChosen(saved) {
        // with no text open (and not seeding), an existing text of one's own is simply opened: there is nothing to preview or choose
        if (noText && !seeding) {
            showSaved(saved.id).catch((err) => {
                console.warn('Could not open the text', err);
                alert('Could not open that text.');
            });
            return;
        }
        loadSource = 'own';
        loadName = saved.title;
        loadNotes = [];
        loadDetails = saved.importedDetails ?? []; // the rights follow the content
        previewMarkdown = saved.items.some((p) => p.level > 0);
        // fresh ids, so the preview shares nothing with the text it came from
        paragraphs = saved.items.map((p, i) => ({ ...p, id: crypto.randomUUID(), originalIndex: i }));
        showLoadModal();
    }

    /** whether the text loaded in the preview is Markdown */
    let previewMarkdown = $state(false);
    /** whether the main text is Markdown, so the linear view renders it */
    let markdown = $state(false);
    /** the preview as the linear view shows it: front and back matter (the Frontmatter section above all) are folded into bubbles above and below the text */
    const previewShown = $derived(withoutMatter(paragraphs));
    const previewMatter = $derived(matterSections(paragraphs));
    /** whether the loaded text has sections to mark as front or back matter (the preview then has the map beside it) */
    const previewHasSections = $derived(paragraphs.some((p) => p.level > 0));

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

    // ---- Front and back matter: chosen on the map beside the preview, which marks the sections as it is clicked ----
    /** the section the map is hovered over: the preview jumps to it */
    /** @type {string | null} */
    let previewSpot = $state(null);

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
    /** the loaded text's default rally type (null: it has none yet, so the rally's setup is offered) */
    /** the loaded text is published and public: it can't be altered, so there is no writing mode */
    let textPublicized = $state(false);
    let textRallyStyle = $state(/** @type {string | null} */ (null));
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
        pendingDetails = []; // those belonged to the text that was showing
        textId = saved.id;
        markdown = saved.items.some((/** @type {any} */ p) => p.level > 0);
        textTitle = saved.title;
        textRallyStyle = saved.rallyStyle ?? null;
        textPublicized = !!saved.publicized;
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
            const wanted = new URLSearchParams(location.search).get('text') ?? rememberedText();
            const pick = texts.find((/** @type {any} */ t) => t.id === wanted) ?? texts[0];
            await showSaved(pick.id);
            return true;
        } catch (err) {
            console.warn('Could not load the saved text', err);
            return false;
        }
    }

    // ---- The open text is remembered, so a refresh (or coming back by the menu) returns to it ----
    const REMEMBER_TEXT = 'exegeezer.text';
    function rememberedText() {
        try {
            return localStorage.getItem(REMEMBER_TEXT);
        } catch {
            return null;
        }
    }
    $effect(() => {
        const id = textId;
        if (!id) return;
        try {
            localStorage.setItem(REMEMBER_TEXT, id);
        } catch {
            // storage is blocked: nothing is remembered
        }
    });

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
            const details = $state.snapshot(pendingDetails);
            try {
                const res = textId
                    ? await fetch(`/api/texts/${textId}`, { method: 'PUT', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ items, addImportedDetails: details }) })
                    : await fetch('/api/texts', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ title: textTitle, visibility: textVisibility, items, importedDetails: details }) });
                if (!res.ok) throw new Error(`${res.status}`);
                pendingDetails = pendingDetails.slice(details.length); // saved with the text
                if (!textId) {
                    textId = (await res.json()).id;
                    replaceState(`/exejeeze?text=${textId}`, {}); // so a refresh stays on it
                }
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
        if (t?.closest('input, textarea, select, [contenteditable]') && !t.hasAttribute('data-text-undo')) return; // the rally writer's line has no undo of its own: Cmd+Z there undoes the text
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
                      message: `This permanently deletes the section heading${info.title.trim() ? ` "${info.title}"` : ''}. Its ${inside} move into the section above it.`,
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
        commit(
            mainText.map((p) => {
                if (p.id !== id) return p;
                if ((p.level ?? 0) === 0 || fields.text === undefined) return { ...p, ...fields };
                // a header edited as markup: its # marks set its level, and it stays a header
                const m = fields.text.match(/^(#{1,6})\s+(.*)$/);
                const level = m ? m[1].length : (p.level ?? 1);
                const title = (m ? m[2] : fields.text.replace(/^#+\s*/, '')).trim();
                return title ? { ...p, ...fields, level, text: `${'#'.repeat(level)} ${title}` } : p;
            })
        );
    }

    /**
     * Bubbles made by Enter that are still waiting for their first content, each with the text as it was
     * just before the bubble was made. A bubble left without any content is dropped again.
     * @type {Map<string, typeof mainText>}
     */
    const fresh = new Map();

    /** An edit in a view ended: a fresh bubble left unchanged is deleted (as if never made). @param {string} id @param {boolean} changed */
    function leftBubble(id, changed) {
        const before = fresh.get(id);
        if (!before) return;
        fresh.delete(id);
        if (changed) return;
        const item = mainText.find((p) => p.id === id);
        if (!item) return;
        const next = (item.level ?? 0) > 0 ? removeSection(mainText, id, false) : removeParagraph(mainText, id);
        if (history.last === before) {
            history.discard(); // the bubble's making was the latest step: take it back rather than add a step
            mainText = next;
        } else commit(next);
        if (focusId === id) focusId = null;
    }

    /** what Enter in an edited bubble is asking: where to show the paragraph-or-section choice, and how to make the pick (default: next to the bubble) */
    /** @type {{ rect: DOMRect, levels: number[], level: number, pick: (kind: 'paragraph' | 'section', level?: number) => void } | null} */
    let chooser = $state(null);
    /** the kind of item made most recently: the choice's first option */
    /** @type {'paragraph' | 'section'} */
    let lastKind = $state('paragraph');

    /**
     * Enter in an edited section or paragraph (any view): ask whether to make a paragraph or a section.
     * @param {string} id @param {DOMRect} rect @param {(kind: 'paragraph' | 'section', level?: number) => void} [pick] how a view makes it itself
     */
    function askNew(id, rect, pick = (kind, level) => createFrom(id, kind, level)) {
        chooser = { rect, pick, ...sectionLevels(id) };
    }

    /**
     * The levels a section made right after the bubble `id` can take, and the one you are in: no deeper than one below the
     * heading before it (a heading 1 when there is none), and the level of the heading at or before the bubble by default.
     * @param {string} id
     */
    function sectionLevels(id) {
        const j = mainText.findIndex((p) => p.id === id);
        const at = gapIndex(mainText, id, 'after', false);
        let max = 1;
        for (let k = Math.min(at, mainText.length) - 1; k >= 0; k--) {
            if ((mainText[k].level ?? 0) > 0) {
                max = Math.min(6, (mainText[k].level ?? 0) + 1);
                break;
            }
        }
        let here = 1;
        for (let k = j; k >= 0; k--) {
            if ((mainText[k].level ?? 0) > 0) {
                here = mainText[k].level ?? 1;
                break;
            }
        }
        return { levels: Array.from({ length: max }, (_, i) => i + 1), level: Math.min(here, max) };
    }

    /** A new empty paragraph or section after the bubble `id` (a paragraph made from a section is its first item), opened for editing. @param {string} id @param {'paragraph' | 'section'} kind @param {number} [level] a section's level */
    function createFrom(id, kind, level) {
        const from = mainText.find((p) => p.id === id);
        if (!from) return;
        const newId = addAtGap({ targetId: id, place: kind === 'paragraph' && (from.level ?? 0) > 0 ? 'inside' : 'after', kind, auto: true, level });
        // once the choice has closed and let go of the focus, so nothing takes it back from the new bubble's editor
        if (newId) setTimeout(() => (startEditId = newId), 0);
    }

    /** a just-injected empty paragraph the view should start editing at once (its body field, or a section's title), or null */
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
     * @param {{ targetId: string, place: 'before' | 'after' | 'inside', kind: 'paragraph' | 'section', auto?: boolean }} req (auto: made by Enter, so dropped again if left empty)
     * @returns {string | undefined} the new item's id (the view centres its bubble)
     */
    function addAtGap({ targetId, place, kind, auto = false, level: chosen }) {
        const before = mainText;
        // 'inside': the first item of a section, right after its header
        const target = mainText.findIndex((p) => p.id === targetId);
        const at = place === 'inside' ? (target === -1 ? -1 : target + 1) : gapIndex(mainText, targetId, place, false);
        if (at === -1) return;
        /** @type {{ id: string, originalIndex: number, text: string, level: number }} */
        let item = { id: crypto.randomUUID(), originalIndex: 0, text: '', level: 0 };
        if (kind === 'section' && place === 'inside') {
            const level = Math.min(6, (mainText[target].level ?? 0) + 1);
            item = { ...item, level, text: `${'#'.repeat(level)} ` };
        } else if (kind === 'section' && chosen) {
            item = { ...item, level: chosen, text: `${'#'.repeat(chosen)} ` };
        } else if (kind === 'section') {
            let level = 1;
            for (let k = mainText.findIndex((p) => p.id === targetId); k >= 0; k--) {
                const lv = mainText[k].level ?? 0;
                if (lv > 0) {
                    level = Math.min(6, k === mainText.findIndex((p) => p.id === targetId) ? lv : lv + 1);
                    break;
                }
            }
            item = { ...item, level, text: `${'#'.repeat(level)} ` };
        }
        if (!commit(insertAt(mainText, at, [item]))) return;
        lastKind = kind;
        if (auto) fresh.set(item.id, before); // made by Enter: dropped again if it is left empty
        return item.id;
    }

    /** where the "Seed a text" button is: not clicked yet, or offering heading levels (a text begins with a section: paragraphs have to be inside sections) */
    /** @type {'idle' | 'choose' | 'level' | 'existing'} */
    let seedStep = $state('idle');
    /** the Load Text modal was opened by seeding (a new text from an existing one): its button seeds a text instead of injecting into this one */
    let seeding = $state(false);
    /** what the seed area shows: with no text loaded it starts as the "Seed a text" button; a loaded text that is merely blank goes straight to the choices */
    /** the first choice made in the tree of buttons with no text open: Seed a text, Load a text, or none yet */
    /** @type {'' | 'seed' | 'load'} */
    let beginRoot = $state('');
    /** the source chosen in the last layer of that tree (it opens a modal, so it stays highlighted beneath it) */
    /** @type {'' | 'computer' | 'own' | 'web'} */
    let beginSource = $state('');
    /** @param {'seed' | 'load'} root */
    function chooseRoot(root) {
        beginRoot = root;
        seedStep = 'idle';
        beginSource = '';
        clearLoaded();
    }
    /** @param {'level' | 'existing'} step */
    function chooseSeedKind(step) {
        seedStep = step;
        beginSource = '';
        clearLoaded();
    }
    /** a choice made again starts the loading over: nothing left from an earlier try waits in the Load Text modal */
    function clearLoaded() {
        injectGap = null;
        paragraphs = [];
        uploadedfiles = [];
    }
    /** @param {'computer'} source @param {boolean} forSeeding */
    function pickSource(source, forSeeding) {
        clearLoaded();
        beginSource = source;
        seeding = forSeeding;
    }
    // a picker closed without choosing a text: the button that opened it is deselected (once a text is chosen the Load Text modal takes over, and its closing deselects)
    $effect(() => {
        if (beginSource && beginSource !== 'computer' && !ownTextsOpen && !openSourcesOpen && paragraphs.length === 0) beginSource = '';
    });
    // once there is a text, the tree starts over next time
    $effect(() => {
        if (!noText) {
            beginRoot = '';
            beginSource = '';
            seedStep = 'idle';
        }
    });
    /**
     * The heading levels a new section may have: 1 up to one deeper than the text already goes
     * (so the first section is a heading 1 and no needless depth is created).
     */
    const seedLevels = $derived(
        Array.from({ length: Math.min(6, mainText.reduce((deepest, p) => Math.max(deepest, p.level ?? 0), 0) + 1) }, (_, i) => i + 1)
    );

    /** Seed from an existing text: the Load Text process (any source), ending in a new text instead of an injection. */

    /**
     * Make a new text from the loaded text (the paragraphs in the preview) and open it: a draft, private until its owner says
     * otherwise. A text loaded from the user's own texts brings no title and no settings; any other is named after what was loaded.
     * As with an import, the user may first keep an unaltered `ORIGINAL--<name>` copy.
     */
    async function seedFromPreview() {
        if (paragraphs.length === 0) return;
        if (keepCopy && loadSource !== 'own') {
            try {
                await saveOriginalCopy();
            } catch (err) {
                console.warn('Could not save the original copy', err);
                if (!confirm('The original copy could not be saved. Seed the text anyway?')) return;
            }
        }
        try {
            let list = paragraphs.map((/** @type {any} */ p, /** @type {number} */ i) => ({ ...p, id: crypto.randomUUID(), originalIndex: i }));
            // text above the first header goes into a Frontmatter section; a text with no headers at all stays as it is
            if (list[0] && (list[0].level ?? 0) === 0 && list.some((p) => (p.level ?? 0) > 0)) list = withFrontmatter(list);
            const title = loadSource === 'own' ? '' : loadName;
            const res = await fetch('/api/texts', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ title, visibility: 'private', items: toItems(list), importedDetails: $state.snapshot(loadDetails) }) });
            if (!res.ok) throw new Error(`${res.status}`);
            await showSaved((await res.json()).id);
            seedStep = 'idle';
            keepCopy = false;
            paragraphs = [];
            loadDetails = [];
            uploadedfiles = [];
            dialogEl?.close();
        } catch (err) {
            console.warn('Could not seed the text', err);
            alert('Could not seed a text from that one.');
        }
    }

    /**
     * Begin a text with one empty section.
     * @param {number} [level] its heading level
     */
    function seedText(level = 1) {
        seedStep = 'idle';
        if (commit([{ id: crypto.randomUUID(), originalIndex: 0, text: `${'#'.repeat(level)} `, level }])) {
            markdown = true;
            lastKind = 'section';
        }
    }

    // ---- Whole-text menu (in the header): settings, delete, wipe clean ----
    /** @type {{ id: string } | null} */
    let settingsRequest = $state(null);

    /** Show no text at all: the viewer as it is when nothing is loaded. */
    /** The X in the title bar: leave this text (it stays saved) and empty the viewer. */
    async function closeText() {
        save(); // any last edits go first
        await queue;
        unloadText();
    }

    function unloadText() {
        pendingDetails = [];
        rallyStarted = false;
        rallyPlaying = false;
        try {
            localStorage.removeItem(REMEMBER_TEXT);
        } catch {
            // storage is blocked
        }
        textId = null;
        textVisibility = '';
        textRallyStyle = null;
        textPublicized = false;
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

    /** After a wipe: the same text stays loaded (title, authors, settings), with no content. */
    function blankText() {
        mainText = [];
        lastSaved = JSON.stringify([]); // so autosave sees nothing to save
        seedStep = 'idle';
        history.clear();
        focusId = null;
        startEditId = null;
    }

    /** @param {string} url @param {'DELETE' | 'POST'} method */
    async function wholeTextCall(url, method) {
        await queue; // let any save in flight finish first
        const res = await fetch(url, { method });
        if (!res.ok) throw new Error(res.status === 409 ? ((await res.json().catch(() => null))?.message ?? `${res.status}`) : `${res.status}`);
    }

    /** A double-click on a paragraph while not writing: switch to writing mode and open that paragraph for editing (the cascading view edits the bubble in place). @param {string} id */
    function writeAt(id) {
        if (!authed || noText || textPublicized) return;
        mode = chosenMode = 'writing';
        if (view !== 'cascading') startEditId = id;
    }

    /** @type {{ excerpt: string, run: (body: string) => Promise<string | void> } | null} */
    let commentRequest = $state(null);

    /** A double-click on a paragraph in commenting mode: ask for a comment on it. The first one creates the commentary. @param {string} id */
    function commentAt(id) {
        const id0 = textId;
        const para = mainText.find((p) => p.id === id);
        if (!authed || !id0 || !para) return;
        commentRequest = {
            excerpt: para.text.replace(/^#+\s*/, '').slice(0, 300),
            run: async (body) => {
                await queue; // let any save in flight finish first, so the paragraph exists on the server
                const res = await fetch(`/api/texts/${id0}/comments`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ paragraphId: id, body }) });
                if (!res.ok) return (await res.json().catch(() => null))?.message ?? 'Could not post the comment.';
            }
        };
    }

    /** a double-click on a paragraph, outside writing: it comments in commenting mode, and starts writing otherwise @param {string} id */
    const onparagraph = (id) => (mode === 'commenting' ? commentAt(id) : writeAt(id));

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
                      run: () => runWhole(`/api/texts/${id}`, 'DELETE', 'delete the text', unloadText)
                  }
                : {
                      title: 'Wipe this text clean?',
                      message: `This permanently erases all of the content of ${name}. The text itself and its settings stay, as a blank slate. This cannot be undone.`,
                      confirm: 'Wipe clean',
                      run: () => runWhole(`/api/texts/${id}/wipe`, 'POST', 'wipe the text', blankText)
                  };
    }

    /** @param {string} url @param {'DELETE' | 'POST'} method @param {string} what @param {() => void} after what the page shows once it has worked */
    async function runWhole(url, method, what, after) {
        try {
            await wholeTextCall(url, method);
        } catch (err) {
            console.warn(`Could not ${what}`, err);
            alert(err instanceof Error && /\s/.test(err.message) ? err.message : `Could not ${what}.`);
            return;
        }
        after();
    }

    // ---- Load Text modal ----
    /** @type {HTMLDialogElement | undefined} */
    let dialogEl;

    /** the Load Text modal, opened when a text has been chosen in the tree of buttons (the pickers open over the tree; this one shows what they chose) */
    function showLoadModal() {
        if (dialogEl && !dialogEl.open) dialogEl.showModal();
    }

    function openModal() {
        seeding = false;
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
        seeding = false;
        beginSource = '';
        previewSpot = null;
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
        const replacing = injectGap === null && (mainText.length === 0 || where === 'replace');
        // one of the user's own texts only ever brings its body: it goes into the current text, which keeps its title and settings
        const makesNewText = replacing && (loadSource !== 'own' || noText); // (with no text open there is nothing for an own text's body to go into: it makes the new text)
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
        // text above the first header goes into a Frontmatter section; a text with no headers at all stays as it is
        if (combined[0] && (combined[0].level ?? 0) === 0 && combined.some((p) => (p.level ?? 0) > 0) && danglingCount(combined) > (replacing ? 0 : danglingCount(mainText))) {
            combined = withFrontmatter(combined);
        }
        // the rights and publication details of what came in are saved with the text (a new text starts with just these)
        pendingDetails = makesNewText ? [...loadDetails] : [...pendingDetails, ...loadDetails];
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
        loadDetails = [];
        uploadedfiles = [];
        dialogEl?.close();
    }


    /** Save the loaded text, unaltered, as a text of its own named `ORIGINAL--<file name>` (fresh ids, so it shares nothing with the working text). */
    async function saveOriginalCopy() {
        const items = toItems(paragraphs.map((/** @type {any} */ p) => ({ ...p, id: crypto.randomUUID() })));
        const res = await fetch('/api/texts', {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify({ title: `ORIGINAL--${loadName}`, visibility: 'private', items, importedDetails: $state.snapshot(loadDetails) })
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
        else if (!authed || (textPublicized && mode === 'writing')) mode = 'reading';
    });
    /** the mode button is locked when there is no text (editing only) or nobody is signed in (reading only) */
    const modeLocked = $derived(noText || !authed);

    // The mode icon changes with a horizontal wipe: the new icon is revealed left to right
    // while the old one is wiped away in the same direction.
    /** @param {Element} _node */
    const wipeIn = (_node) => ({ duration: 280, easing: cubicOut, css: (/** @type {number} */ t) => `clip-path: inset(0 ${(1 - t) * 100}% 0 0)` });
    /** @param {Element} _node */
    const wipeOut = (_node) => ({ duration: 280, easing: cubicOut, css: (/** @type {number} */ t) => `clip-path: inset(0 0 0 ${(1 - t) * 100}%)` });

    // a rally can't run behind the commenting notice
    $effect(() => {
        if (mode === 'commenting') rallyPlaying = false;
    });

    /** the triple toggle (editing, reading, commenting): each click moves to the next mode */
    function cycleMode() {
        if (modeLocked) return;
        const order = textPublicized ? MODES.filter((m) => m !== 'writing') : MODES;
        mode = order[(order.indexOf(mode) + 1) % order.length];
        chosenMode = mode;
    }

    // ---- Remembered across refreshes and visits to other pages: the view, the mode and each view's settings ----
    const REMEMBER = 'exegeezer.editor';
    /** set once the saved settings have been read, so the defaults are not saved over them */
    let restored = $state(false);
    /** the mode the user chose (the mode itself is also forced by having no text or no sign-in, which is not their choice) */
    let chosenMode = $state('reading');

    onMount(() => {
        try {
            const saved = JSON.parse(localStorage.getItem(REMEMBER) ?? '{}');
            if (VIEWS.includes(saved.view)) view = saved.view;
            if (MODES.includes(saved.mode)) {
                chosenMode = saved.mode;
                if (authed) mode = saved.mode;
            }
            if (typeof saved.exploded === 'boolean') exploded = saved.exploded;
            const z = ZOOMS.indexOf(saved.zoom);
            const look = saved.appearance ?? {};
            const at = (/** @type {number[]} */ list, /** @type {unknown} */ v, /** @type {number} */ d) => (list.indexOf(/** @type {number} */ (v)) >= 0 ? list.indexOf(/** @type {number} */ (v)) : d);
            sizeStep = at(SIZE_STEPS, look.size, DEFAULT_SIZE_STEP);
            lineStep = at(LINE_STEPS, look.line, DEFAULT_LINE);
            letterStep = at(LETTER_STEPS, look.letter, DEFAULT_LETTER);
            sideStep = at(MARGIN_STEPS, look.side, DEFAULT_MARGIN);
            if (z >= 0) zoomStep = z;
            // the size is remembered as rem (not as a step), so changing the scale never moves it; an older step-only setting is dropped
            const found = SIZES.indexOf(saved.rallySizeRem);
            if (found >= 0) rallySize = found;
            if (typeof saved.emphasizeFirst === 'boolean') emphasis.first = saved.emphasizeFirst;
            if (typeof saved.emphasizeLast === 'boolean') emphasis.last = saved.emphasizeLast;
            if (Number.isInteger(saved.rallySpeed) && saved.rallySpeed >= 0 && saved.rallySpeed < READ_WPM.length) rallySpeed = saved.rallySpeed;
        } catch {
            // no saved settings (or storage is blocked): the defaults stand
        }
        restored = true;
    });

    $effect(() => {
        const settings = { view, mode: chosenMode, exploded, zoom: ZOOMS[zoomStep], appearance: { size: SIZE_STEPS[sizeStep], line: LINE_STEPS[lineStep], letter: LETTER_STEPS[letterStep], side: MARGIN_STEPS[sideStep] }, rallySizeRem: SIZES[rallySize], rallySpeed, emphasizeFirst: emphasis.first, emphasizeLast: emphasis.last };
        if (!restored) return;
        try {
            localStorage.setItem(REMEMBER, JSON.stringify(settings));
        } catch {
            // storage is blocked: nothing is remembered
        }
    });

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
    /** @type {'linear' | 'hierarchical' | 'cascading' | 'rally'} */
    let view = $state('linear');
    /** cascading view only: every section open at once, zoomed all the way out, colours only */
    let exploded = $state(false);
    /** linear view only: the text's zoom (a step of ZOOMS) and whether its slider is showing */
    const ZOOMS = [0.75, 0.875, 1, 1.25, 1.5, 2];
    let zoomStep = $state(2);
    let zoomOpen = $state(false);

    // ---- Text appearance, in every view: size, line spacing, letter spacing, side margins, top and bottom margins ----
    // each is a step in a list, the default one in the middle-ish; a step is remembered as its value, so changing the lists never moves a choice
    const SIZE_STEPS = [0.7, 0.85, 1, 1.2, 1.4, 1.65, 1.9, 2.2, 2.5];
    const LINE_STEPS = [1.2, 1.35, 1.5, 1.75, 2, 2.4, 2.9, 3.5];
    const LETTER_STEPS = [-0.02, 0, 0.02, 0.05, 0.1, 0.16]; // em
    // side margins, as the share of the page's width left empty on each side of paragraph text: from close to the page's edge (2%) to a skinny
    // column a word or two wide (42%). 12% is the linear view's own margin, the default; the other views' bubbles can only widen from theirs
    const MARGIN_STEPS = [0.02, 0.04, 0.06, 0.09, 0.12, 0.18, 0.26, 0.34, 0.42];
    const DEFAULT_SIZE_STEP = 2;
    const DEFAULT_LINE = 2;
    const DEFAULT_LETTER = 1;
    const DEFAULT_MARGIN = 4;
    let sizeStep = $state(DEFAULT_SIZE_STEP);
    let lineStep = $state(DEFAULT_LINE);
    let letterStep = $state(DEFAULT_LETTER);
    let sideStep = $state(DEFAULT_MARGIN);
    /** the appearance menu: whether its submenu is open, and which slider is showing */
    let appearanceOpen = $state(false);
    /** @type {'size' | 'line' | 'letter' | 'side' | null} */
    let appearanceSlider = $state(null);
    /** the appearance settings apply in every mode, but not in the rally view */
    const appearanceOn = $derived(view !== 'rally');
    const appearanceStyle = $derived(`--ta-size: ${SIZE_STEPS[sizeStep]}; --ta-lh: ${LINE_STEPS[lineStep]}; --ta-ls: ${LETTER_STEPS[letterStep]}em; --ta-mxp: ${(((MARGIN_STEPS[sideStep] - 0.12) / 0.76) * 100).toFixed(3)}%; --ta-mx: ${(Math.max(0, MARGIN_STEPS[sideStep] - 0.12) * 20).toFixed(3)}rem`);
    const APPEARANCE = /** @type {const} */ ([
        { id: 'size', label: 'Font size', steps: SIZE_STEPS },
        { id: 'line', label: 'Line spacing', steps: LINE_STEPS },
        { id: 'letter', label: 'Kerning', steps: LETTER_STEPS },
        { id: 'side', label: 'Side margins', steps: MARGIN_STEPS }
    ]);
    /** @param {string} id */
    const appearanceStep = (id) => (id === 'size' ? sizeStep : id === 'line' ? lineStep : id === 'letter' ? letterStep : sideStep);
    /** @param {string} id @param {number} v */
    function setAppearanceStep(id, v) {
        if (id === 'size') sizeStep = v;
        else if (id === 'line') lineStep = v;
        else if (id === 'letter') letterStep = v;
        else sideStep = v;
    }
    /** the appearance as it was when this text was opened in the viewer: what the revert button goes back to
     * @type {{ size: number, line: number, letter: number, side: number } | null} */
    let appearanceAtOpen = null;
    $effect(() => {
        void textId;
        if (!restored) return;
        untrack(() => (appearanceAtOpen = { size: sizeStep, line: lineStep, letter: letterStep, side: sideStep }));
    });
    function resetAppearance() {
        sizeStep = appearanceAtOpen?.size ?? DEFAULT_SIZE_STEP;
        lineStep = appearanceAtOpen?.line ?? DEFAULT_LINE;
        letterStep = appearanceAtOpen?.letter ?? DEFAULT_LETTER;
        sideStep = appearanceAtOpen?.side ?? DEFAULT_MARGIN;
    }
    /** @type {('linear' | 'hierarchical' | 'cascading' | 'rally')[]} */
    const VIEWS = ['linear', 'hierarchical', 'cascading', 'rally'];
    // rally view's settings: chunk unit, text size step, speed tick (unlabelled; ranges set in rallyChunks.js), and whether it is running
    let rallySize = $state(DEFAULT_SIZE);
    let rallySpeed = $state(6);
    /** the menu's text size and speed sliders: each is revealed by its icon */
    let sizeOpen = $state(false);
    let speedOpen = $state(false);
    let rallyPlaying = $state(false);
    /**
     * Rally writing mode: a one-line markdown line injected at the writer's cursor. Hashtags at the front make it a section
     * (as deep as there are hashtags); anything else is a paragraph.
     * @param {{ gap: { id: string, place: 'before' | 'after' | 'inside' } | null, text: string }} add
     * @returns {{ id: string, kind: 'paragraph' | 'section' } | null}
     */
    function injectLine({ gap, text }) {
        const line = text.replace(/\s+/g, ' ').trim();
        const m = /^(#{1,6})(?:\s+(.*))?$/.exec(line);
        const level = m ? m[1].length : 0;
        const kind = level ? 'section' : 'paragraph';
        const body = level ? `${m?.[1]} ${m?.[2] ?? ''}` : line;
        // a rally begun from nothing starts with an empty section and paragraph: the first things written fill them
        const emptyPara = rallyFillId && mainText.find((p) => p.id === rallyFillId && p.text === '');
        const emptyHead = rallyHeadId && mainText.find((p) => p.id === rallyHeadId && (p.level ?? 0) > 0 && p.text.replace(/^#+\s*/, '') === '');
        if (kind === 'paragraph' && emptyPara) {
            rallyFillId = null;
            commit(mainText.map((p) => (p.id === emptyPara.id ? { ...p, text: body } : p)));
            return { id: emptyPara.id, kind };
        }
        if (kind === 'section' && emptyHead) {
            rallyHeadId = null;
            commit(mainText.map((p) => (p.id === emptyHead.id ? { ...p, text: body, level } : p)));
            return { id: emptyHead.id, kind };
        }
        const target = gap ? mainText.findIndex((p) => p.id === gap.id) : -1;
        const at = !gap || target === -1 ? mainText.length : gap.place === 'inside' ? target + 1 : gapIndex(mainText, gap.id, gap.place, false);
        if (at === -1) return null;
        const item = { id: crypto.randomUUID(), originalIndex: 0, text: body, level };
        return commit(insertAt(mainText, at, [item])) ? { id: item.id, kind } : null;
    }
    /** the rally has been started from its setup (until then the pane is empty and the setup modal offers the flag) */
    let rallyStarted = $state(false);
    /** the empty paragraph a rally from nothing began with (the first thing composed goes into it) */
    let rallyFillId = /** @type {string | null} */ (null);
    /** and its empty section (the first section written takes its place) */
    let rallyHeadId = /** @type {string | null} */ (null);
    let rallySetupOpen = $state(false);
    /** the writer opened the setup themselves (the cog), so a default rally type does not start the rally over it */
    let setupAsked = false;
    $effect(() => {
        if (view !== 'rally') ((rallyStarted = false), (setupAsked = false));
        else if (!rallyStarted) {
            if (untrack(() => editing)) {
                // writing: a loaded text just begins (no setup modal); with no text loaded the setup opens first
                if (!noText) rallyStarted = true;
                else if (!setupAsked) rallySetupOpen = true;
            } else if (!noText) {
                // reading: a text with a default rally type just begins, paused; otherwise the pane shows the flag, which opens the setup
                if (textRallyStyle && !setupAsked) rallyStarted = true;
            }
        }
    });
    async function startRally() {
        rallySetupOpen = false;
        rallyStarted = true; // before the text is made, so arriving with a text does not reopen the setup
        if (textId && !textRallyStyle) {
            // the text's first rally gives it its default rally type
            fetch(`/api/texts/${textId}`, { method: 'PATCH', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ rallyStyle: 'compose' }) }).then((r) => {
                if (r.ok) textRallyStyle = 'compose';
            });
        }
        if (noText) {
            // a rally from nothing: a new text is made (untitled, private; a section with an empty paragraph) and opened in writing mode
            try {
                const items = [
                    { id: crypto.randomUUID(), text: '# ', level: 1 },
                    { id: crypto.randomUUID(), text: '', level: 0 }
                ];
                const res = await fetch('/api/texts', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ title: '', visibility: 'private', rallyStyle: 'compose', items }) });
                if (!res.ok) throw new Error(`${res.status}`);
                await showSaved((await res.json()).id);
                mode = chosenMode = 'writing';
                markdown = true;
                rallyFillId = mainText[mainText.length - 1]?.id ?? null;
                rallyHeadId = mainText[0]?.id ?? null;
                startEditId = null;
            } catch (err) {
                console.warn('Could not begin a text', err);
                alert('Could not begin a new text.');
                rallyStarted = false;
                return;
            }
        }
        rallyPlaying = true;
    }
    $effect(() => {
        if (view !== 'rally') rallyPlaying = false;
    });

    /** the triple toggle (linear, hierarchical, cascading): each click moves to the next view */
    function cycleView() {
        view = VIEWS[(VIEWS.indexOf(view) + 1) % VIEWS.length];
    }

        function onWindowClick(e) {
            if (injectOpen && injectmenu && !injectmenu.contains(e.target)) injectOpen = false;
        }
</script>

<!-- Main pane -->
<div class="flex h-[calc(100vh-57px)] bg-taupe1">
    <div class="flex min-w-0 flex-1 flex-col" bind:this={mainPane}>
        <!-- the text's title: floats above every view, never part of the text; there is none until a text has been seeded -->
        {#if !noText}
        <header class="flex shrink-0 items-center gap-2 border-b border-taupe2 bg-taupe1 px-6 py-2 text-dark">
            <Scroll class="shrink-0" />
            <h1 class="truncate text-lg font-semibold {textTitle ? '' : 'text-grey3'}" title={textTitle}>{textTitle || 'Untitled text'}</h1>
            {#if authed && textId && textAuthors.length}
                <!-- the byline: names in the sans font, the connecting words in the script font -->
                <p class="min-w-0 truncate py-1 text-lg font-semibold">
                    <span class="font-script text-xs leading-none font-normal">by</span><span class="ml-2">{#each textAuthors as name, i (i)}{#if i > 0}{#if i === textAuthors.length - 1}{#if textAuthors.length > 2}<span class="font-script text-xs leading-none font-normal">,</span>{/if}<span class="font-script mx-2 text-xs leading-none font-normal">and</span>{:else}<span class="font-script mr-2 text-xs leading-none font-normal">,</span>{/if}{/if}{name}{/each}</span>
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
                <!-- exit this text: empties the viewer (the text stays saved) -->
                <button onclick={closeText} aria-label="Close text" use:tip={'Close text'} data-tip-place="below" class="ml-auto inline-flex shrink-0 items-center justify-center rounded-md p-1 hover:bg-taupe2"><X /></button>
            {/if}
            {#if !authed}
                <span class="ml-auto flex shrink-0 items-center gap-3 text-sm text-grey3">
                    <span class="hidden sm:inline">You're viewing an example text.</span>
                </span>
            {/if}
        </header>
        {/if}
        <div class="relative min-h-0 flex-1">
        {#if noText && authed && !(view === 'rally' && rallyStarted)}
            <!-- nothing is loaded: a tree of round buttons to begin. Each choice opens the next layer beneath it (the layers stay, with the choices made in violet) until a modal has to open, which appears over the tree -->
            <div class="pointer-events-none absolute inset-x-0 top-0 bottom-0 z-10 flex items-start justify-center overflow-y-auto pt-[12%]">
                {#if textId && view !== 'rally'}
                    <!-- a blank text is open: only its first heading level is left to choose -->
                    <div class="pointer-events-auto flex items-center gap-5">
                        {#each seedLevels as n (n)}
                            <SourceButton name="Heading {n}" onclick={() => seedText(n)}><span class="flex h-10 w-10 items-center justify-center text-3xl leading-none font-semibold" style="font-family: Georgia, serif">{'#'.repeat(n)}</span></SourceButton>
                        {/each}
                    </div>
                {:else}
                    {@render beginTree()}
                {/if}
            </div>
        {/if}
        <!-- Text appearance (every view): the settings reach the views as CSS variables, which app.css turns into sizes and spacing -->
        <div class="h-full {appearanceOn ? 'appearance' : ''} {appearanceOn && lineStep !== DEFAULT_LINE ? 'ta-line' : ''}" style={appearanceOn ? appearanceStyle : undefined}>
        {#if view === 'linear'}
            <ParagraphViewer onleave={leftBubble} onwrite={authed && !editing ? onparagraph : undefined} onnewitem={editing ? askNew : undefined} paragraphs={shownText} {startEditId} onstartedit={() => (startEditId = null)} {focusId} onfocusitem={(id) => (focusId = id)} {matter} {markdown} zoom={ZOOMS[zoomStep]} empty="" synopsis ondelete={editing ? requestDelete : undefined} onexpand={editing ? (r) => (editRequest = r) : undefined} onmove={editing ? moveByDrag : undefined} oninject={editing ? injectRequest : undefined} onedit={editing ? editParagraph : undefined} />
        {:else if view === 'rally' && mode === 'commenting'}
            <!-- commenting isn't available in rally view yet: the view stays inactive and says so -->
            <div class="flex h-full items-center justify-center px-8 text-center text-grey3" role="status">
                <p class="max-w-sm">Commenting isn't available in Rally view yet. Switch to another view to comment.</p>
            </div>
        {:else if view === 'rally'}
            <!-- with no text there is nothing to pace, or to write into: only the Seed a text button shows -->
            {#if rallyStarted}
                {#if editing}
                    <RallyWriter paragraphs={shownText} size={rallySize} bind:speed={rallySpeed} bind:playing={rallyPlaying} oninject={injectLine} ondelete={requestDelete} {focusId} onfocusitem={(id) => (focusId = id)} />
                {:else}
                    <RallyViewer paragraphs={shownText} size={rallySize} bind:speed={rallySpeed} bind:playing={rallyPlaying} {focusId} onfocusitem={(id) => (focusId = id)} empty="" />
                {/if}
            {:else if !noText}
                <!-- the rally has not started: an empty pane with the violet flag, which opens the setup -->
                <div class="flex h-full items-center justify-center">
                    <button onclick={() => (rallySetupOpen = true)} aria-label="Rally on!" use:tip={'Rally on!'} data-tip-place="below" class="inline-flex items-center justify-center rounded-md bg-violet px-6 py-3 text-taupe1 hover:bg-violet/90"><FlagChequered class="text-taupe1!" width={28} height={28} /></button>
                </div>
            {/if}
        {:else if view === 'cascading'}
            <CascadingViewer ondelete={editing ? requestDelete : undefined} onleave={leftBubble} onwrite={authed && !editing ? onparagraph : undefined} bind:this={hierarchy} onrename={editing ? renameSectionTitle : undefined} {focusId} onfocusitem={(id) => (focusId = id)} {exploded} paragraphs={shownText} empty="" onmove={editing ? moveByDrag : undefined} onadd={editing ? addAtGap : undefined} onnewitem={editing ? askNew : undefined} onedit={editing ? editParagraph : undefined} />
        {:else}
            <HierarchyViewer onleave={leftBubble} onwrite={authed && !editing ? onparagraph : undefined} onrename={editing ? renameSectionTitle : undefined} onnewitem={editing ? askNew : undefined} bind:this={hierarchy} {startEditId} onstartedit={() => (startEditId = null)} {focusId} onfocusitem={(id) => (focusId = id)} paragraphs={shownText} {matter} empty="" ondelete={editing ? requestDelete : undefined} onexpand={editing ? (r) => (editRequest = r) : undefined} onmove={editing ? moveByDrag : undefined} oninject={editing ? injectRequest : undefined} onedit={editing ? editParagraph : undefined} />
        {/if}
        </div>
        </div>
    </div>

    <!-- Vertical menu column -->
    <nav aria-label="Menu" class="flex w-12 shrink-0 flex-col items-center gap-1 border-l border-taupe2 bg-taupe1 py-2">
        <!-- with no text open there is nothing to load into: the Seed a text button starts one -->
        {#if !noText}
        <button
            onclick={openModal}
            aria-label="Load text"
            aria-disabled={!authed}
            use:tip={!authed ? 'Load text (sign in first)' : 'Load text'}
            class="inline-flex items-center justify-center rounded-md p-1 text-dark {authed ? 'hover:bg-taupe2' : 'cursor-not-allowed opacity-60'}"
        >
            <ArrowOutDownCircleHalf />
        </button>
        {/if}

        <button
            onclick={() => (mapOpen = true)}
            aria-label="Map"
            use:tip={'Map'}
            class="inline-flex items-center justify-center rounded-md p-1 text-dark hover:bg-taupe2"
        >
            <MapIcon />
        </button>

        <!-- View toggle: each click moves to the next view, the icon wiping across like the mode button's -->
        <button
            onclick={cycleView}
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
                <button onclick={() => (zoomOpen = !zoomOpen)} aria-label="Zoom" aria-expanded={zoomOpen} use:tip={'Zoom'} class="inline-flex items-center justify-center rounded-md p-1 text-dark hover:bg-taupe2 {zoomOpen ? 'outline-2 -outline-offset-2 outline-taupe4' : ''}"><Search /></button>
                {#if zoomOpen}
                    <div transition:slide={{ duration: 200 }} class="flex items-stretch gap-0.5 py-1">
                        <div aria-hidden="true" class="flex flex-col justify-between py-[7px]">{#each ZOOMS as _, i (i)}<span class="h-px w-1.5 bg-taupe4"></span>{/each}</div>
                        <input type="range" min="0" max={ZOOMS.length - 1} step="1" bind:value={zoomStep} aria-label="Zoom" use:tip={'Zoom'} class="rally-speed" style="height: 5.5rem; --p: {zoomStep / (ZOOMS.length - 1)}{editing ? `; --mode: var(--color-${WRITING_COLOUR})` : ''}" />
                    </div>
                {/if}
            </div>
        {/if}

        {#if view === 'cascading'}
            <!-- View-particular settings: shown under the view button, only in this view -->
            <div class="submenu flex w-full flex-col items-center gap-1 py-1">
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

        {#if view === 'rally' && mode !== 'commenting'}
            <!-- Rally settings: the setup and sliders for text size and speed (ticks, no labels) -->
            <div class="submenu flex w-full flex-col items-center gap-1 py-1">
                <button onclick={() => ((rallyPlaying = false), (setupAsked = true), (rallyStarted = false), (rallySetupOpen = true))} aria-label="Rally setup" use:tip={'Rally setup'} class="inline-flex items-center justify-center rounded-md p-1 text-dark hover:bg-taupe2"><Cog /></button>
                <!-- text size and speed: each a vertical slider (smallest / slowest at the bottom, a tick for every step, no labels), shown when its icon is pressed -->
                <button onclick={() => (sizeOpen = !sizeOpen)} aria-label="Text size" aria-expanded={sizeOpen} use:tip={'Text size'} class="inline-flex items-center justify-center rounded-md p-1 text-dark hover:bg-taupe2 {sizeOpen ? 'outline-2 -outline-offset-2 outline-taupe4' : ''}"><TextHeight /></button>
                {#if sizeOpen}
                    <div transition:slide={{ duration: 200 }} class="flex items-stretch gap-0.5 py-1">
                        <div aria-hidden="true" class="flex flex-col justify-between py-[7px]">{#each SIZES as _, i (i)}<span class="h-px w-1.5 bg-taupe4"></span>{/each}</div>
                        <input type="range" min="0" max={SIZES.length - 1} step="1" bind:value={rallySize} aria-label="Text size" use:tip={'Text size'} class="rally-speed" style="height: 5.5rem; --p: {rallySize / (SIZES.length - 1)}{editing ? `; --mode: var(--color-${WRITING_COLOUR})` : ''}" />
                    </div>
                {/if}
                <button onclick={() => (speedOpen = !speedOpen)} aria-label="Speed" aria-expanded={speedOpen} use:tip={'Speed'} class="inline-flex items-center justify-center rounded-md p-1 text-dark hover:bg-taupe2 {speedOpen ? 'outline-2 -outline-offset-2 outline-taupe4' : ''}"><Tachometer /></button>
                {#if speedOpen}
                    <div transition:slide={{ duration: 200 }} class="flex items-stretch gap-0.5 py-1">
                        <div aria-hidden="true" class="flex flex-col justify-between py-[7px]">{#each READ_WPM as _, i (i)}<span class="h-px w-1.5 bg-taupe4"></span>{/each}</div>
                        <input type="range" min="0" max={READ_WPM.length - 1} step="1" bind:value={rallySpeed} aria-label="Speed" use:tip={'Speed'} class="rally-speed" style="--p: {rallySpeed / (READ_WPM.length - 1)}{editing ? `; --mode: var(--color-${WRITING_COLOUR})` : ''}" />
                    </div>
                {/if}
            </div>
        {/if}

        <button
            onclick={cycleMode}
            aria-label="Mode"
            use:tip={!authed ? 'Reading mode (sign in to edit)' : noText ? 'Writing mode (no text is loaded)' : `${mode[0].toUpperCase() + mode.slice(1)} mode`}
            aria-disabled={modeLocked}
            class="inline-grid items-center justify-center rounded-md p-1 text-dark {modeLocked ? 'cursor-not-allowed opacity-60' : 'hover:bg-taupe2'}"
        >
            {#key mode}
                <span in:wipeIn out:wipeOut class="inline-flex [grid-area:1/1]">
                    {#if mode === 'writing'}<PencilEditCircle />{:else if mode === 'commenting'}<Discussion />{:else}<BookOpen />{/if}
                </span>
            {/key}
        </button>

        {#if editing}
            <!-- Writing helpers: shown under the mode button, only in writing mode -->
            <div class="submenu flex w-full flex-col items-center gap-1 py-1">
                <button onclick={undo} disabled={!history.canUndo} aria-label="Undo" use:tip={'Undo'} class="inline-flex items-center justify-center rounded-md p-1 text-dark hover:bg-taupe2 disabled:opacity-30 disabled:hover:bg-transparent"><Undo /></button>
                <button onclick={redo} disabled={!history.canRedo} aria-label="Redo" use:tip={'Redo'} class="inline-flex items-center justify-center rounded-md p-1 text-dark hover:bg-taupe2 disabled:opacity-30 disabled:hover:bg-transparent"><Redo /></button>
            </div>
        {/if}
        {#if view !== 'rally'}
            <!-- Text appearance: under the mode button (and its helpers), in every mode; hidden in the rally view, which has its own size and speed -->
            <div class="submenu flex w-full flex-col items-center gap-1 py-1">
                <button
                    onclick={() => (appearanceOpen = !appearanceOpen)}
                    aria-label="Text appearance"
                    aria-expanded={appearanceOpen}
                    use:tip={'Text appearance'}
                    class="inline-flex items-center justify-center rounded-md p-1 text-dark hover:bg-taupe3 {appearanceOpen ? 'outline-2 -outline-offset-2 outline-taupe4' : ''}"
                >
                    <FontFamily />
                </button>
                {#if appearanceOpen}
                    <div transition:slide={{ duration: 200 }} class="flex w-full flex-col items-center gap-1">
                        {#each APPEARANCE as a (a.id)}
                            <button onclick={() => (appearanceSlider = appearanceSlider === a.id ? null : a.id)} aria-label={a.label} aria-expanded={appearanceSlider === a.id} use:tip={a.label} class="inline-flex items-center justify-center rounded-md p-1 text-dark hover:bg-taupe3 {appearanceSlider === a.id ? 'outline-2 -outline-offset-2 outline-taupe4' : ''}">
                                {#if a.id === 'size'}<TextHeight />{:else if a.id === 'line'}<LineSpacing />{:else if a.id === 'letter'}<LetterSpacing />{:else}<MarginLeft />{/if}
                            </button>
                            {#if appearanceSlider === a.id}
                                <div transition:slide={{ duration: 200 }} class="flex items-stretch gap-0.5 py-1">
                                    <input type="range" min="0" max={a.steps.length - 1} step="1" value={appearanceStep(a.id)} oninput={(e) => setAppearanceStep(a.id, +e.currentTarget.value)} aria-label={a.label} use:tip={a.label} class="rally-speed" style="height: 5.5rem; --p: {appearanceStep(a.id) / (a.steps.length - 1)}" />
                                    <!-- the ticks sit on the slider's right, like a ruler: every other one shorter -->
                                    <div aria-hidden="true" class="flex flex-col items-end justify-between py-[7px]">{#each a.steps as _, i (i)}<span class="h-px {i % 2 === 0 ? 'w-2' : 'w-1'} bg-taupe4"></span>{/each}</div>
                                </div>
                            {/if}
                        {/each}
                        <button onclick={resetAppearance} aria-label="Revert text appearance" use:tip={'Revert to how it was when you opened this text'} class="inline-flex items-center justify-center rounded-md p-1 text-xs text-dark hover:bg-taupe3">↺</button>
                    </div>
                {/if}
            </div>
        {/if}
    </nav>
</div>

<MenuTip />
{#if chooser}
    <!-- the const keeps the props steady while the choice is closing (chooser is already null by then) -->
    {@const c = chooser}
    <NewItemChooser
        rect={c.rect}
        first={lastKind}
        levels={c.levels}
        level={c.level}
        oncancel={() => (chooser = null)}
        onpick={(kind, level) => {
            const pick = chooser?.pick;
            chooser = null;
            pick?.(kind, level);
        }}
    />
{/if}
<RallySetup bind:open={rallySetupOpen} writing={editing} bind:size={rallySize} bind:speed={rallySpeed} onstart={startRally} />
<ConfirmDialog bind:request={deleteRequest} />
<CommentDialog bind:request={commentRequest} />
<NewTextDialog bind:request={newTextRequest} />
<TextSettingsModal bind:request={settingsRequest} onsaved={({ title, authors, publicized }) => ((textTitle = title), (textAuthors = authors), (textPublicized = publicized))} />
<MapModal bind:open={mapOpen} title={textTitle} paragraphs={shownText} onnavigate={goToSection} />
<OwnTextsDialog bind:open={ownTextsOpen} onchoose={onOwnTextChosen} />
<OpenSourcesDialog bind:open={openSourcesOpen} onchoose={onWebTextChosen} />
<EditModal bind:request={editRequest} list={mainText} onsave={saveEdit} />

<!-- With no text open: the tree of round buttons. Layer 1: Seed a text, Load a text. Seed a text leads to a fresh text (then its first heading level) or seeding from an existing text
     (then where it comes from); Load a text leads to your own texts or other exegeezers' texts. Each layer stays visible beneath the one above it, the choices made in violet. -->
{#snippet beginTree()}
    <div class="pointer-events-auto flex flex-col items-center gap-14">
        <div class="pop-in flex items-center gap-6">
            <SourceButton name="Seed a text or commentary" active={beginRoot === 'seed'} onclick={() => (view === 'rally' ? (rallySetupOpen = true) : chooseRoot('seed'))}><Sapling width={36} height={36} /></SourceButton>
            <SourceButton name="Load a text" active={beginRoot === 'load'} onclick={() => chooseRoot('load')}><ArrowOutDownCircleHalf width={36} height={36} /></SourceButton>
        </div>

        {#if beginRoot === 'seed'}
            <div class="pop-in flex items-center gap-6">
                <SourceButton name="A fresh text" active={seedStep === 'level'} onclick={() => chooseSeedKind('level')}><Clipboard width={36} height={36} /></SourceButton>
                <SourceButton name="Seed from an existing text" active={seedStep === 'existing'} onclick={() => chooseSeedKind('existing')}><ClipboardPlus width={36} height={36} /></SourceButton>
            </div>
            {#if seedStep === 'level'}
                <div class="pop-in flex items-center gap-6">
                    {#each seedLevels as n (n)}
                        <SourceButton name="Heading {n}" onclick={() => seedText(n)}><span class="flex h-9 w-9 items-center justify-center text-3xl leading-none font-semibold" style="font-family: Georgia, serif">{'#'.repeat(n)}</span></SourceButton>
                    {/each}
                </div>
            {:else if seedStep === 'existing'}
                <div class="pop-in flex items-center gap-6">
                    <UploadButton bind:uploadedfiles onclick={() => pickSource('computer', true)} oncancel={() => (beginSource = '')} onloaded={onFileLoaded} active={beginSource === 'computer'} />
                    <SourceButton name="From Your Texts" active={beginSource === 'own'} onclick={() => (clearLoaded(), (beginSource = 'own'), (seeding = true), (ownTextsOpen = true))}><Swatch width={36} height={36} /></SourceButton>
                    <SourceButton name="From Open Libraries" active={beginSource === 'web'} onclick={() => (clearLoaded(), (beginSource = 'web'), (seeding = true), (openSourcesOpen = true))}><GlobeAlt2 width={36} height={36} /></SourceButton>
                    <SourceButton name="From Other Exegeezers"><Mesh width={36} height={36} /></SourceButton>
                </div>
            {/if}
        {:else if beginRoot === 'load'}
            <!-- with no text open, only your own texts and other exegeezers' texts: a computer file or the web comes in as content for a text that exists -->
            <div class="pop-in flex items-center gap-6">
                <SourceButton name="From Your Texts" active={beginSource === 'own'} onclick={() => (clearLoaded(), (beginSource = 'own'), (seeding = false), (ownTextsOpen = true))}><Swatch width={36} height={36} /></SourceButton>
                <SourceButton name="From Other Exegeezers"><Mesh width={36} height={36} /></SourceButton>
            </div>
        {/if}
    </div>
{/snippet}

<!-- Load Text modal -->
<!-- svelte-ignore a11y_click_events_have_key_events, a11y_no_noninteractive_element_interactions -->
<dialog
    bind:this={dialogEl}
    onclick={onDialogClick}
    onclose={onModalClosed}
    class="relative m-auto {paragraphs.length === 0 ? 'h-64 w-[min(92vw,26rem)]' : previewHasSections ? 'h-[80vh] w-[min(94vw,88rem)]' : 'h-[80vh] w-[min(92vw,64rem)]'} overflow-hidden rounded-lg border border-taupe2 bg-taupe1 p-4 text-dark backdrop:bg-black/40 open:flex open:flex-col"
>
    <div class="flex shrink-0 items-start justify-between">
        <!-- Load sources: each is its own button, centered until a text is loaded, then top-left -->
        <div class={paragraphs.length === 0 ? 'pointer-events-none absolute inset-x-0 top-1/2 z-40 flex -translate-y-1/2 justify-center' : 'inline-block'}>
            <div class="pointer-events-auto relative z-50 inline-flex gap-5">
                <!-- a computer file or the web comes in as content for a text that already exists (or to seed a new one), so with no text open only your own texts and other exegeezers' texts are offered -->
                {#if !noText || seeding}
                <UploadButton bind:uploadedfiles onloaded={onFileLoaded} small={paragraphs.length > 0} active={paragraphs.length > 0 && loadSource === 'computer'} />
                {/if}
                <SourceButton name="From Your Texts" onclick={() => (ownTextsOpen = true)} small={paragraphs.length > 0} active={paragraphs.length > 0 && loadSource === 'own'}><Swatch width={paragraphs.length > 0 ? 22 : 40} height={paragraphs.length > 0 ? 22 : 40} /></SourceButton>
                {#if !noText || seeding}
                <SourceButton name="From Open Libraries" onclick={() => (openSourcesOpen = true)} small={paragraphs.length > 0} active={paragraphs.length > 0 && loadSource === 'web'}><GlobeAlt2 width={paragraphs.length > 0 ? 22 : 40} height={paragraphs.length > 0 ? 22 : 40} /></SourceButton>
                {/if}
                <SourceButton name="From Other Exegeezers" tipAlign="right" small={paragraphs.length > 0}><Mesh width={paragraphs.length > 0 ? 22 : 40} height={paragraphs.length > 0 ? 22 : 40} /></SourceButton>
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
                Preview{#if loadNotes.length}<span class="ml-2 font-normal text-grey3">— {loadNotes.join(' ')}</span>{/if}{#if injectGap !== null}<span class="ml-2 font-normal text-grey3">— will be injected at the chosen location</span>{/if}
            </h2>

            <div class="flex items-center gap-4">
            <!-- the import question (not asked for the user's own texts) -->
            {#if loadSource !== 'own'}
                <label class="flex items-center gap-1.5 text-xs text-dark" title="Saves an unaltered copy of the incoming text in your texts as ORIGINAL--{loadName}">
                    <input type="checkbox" bind:checked={keepCopy} />
                    Keep an original copy in my texts
                </label>
            {/if}

            {#if seeding}
                <!-- seeding: a new text is made from the loaded one, so there is nothing to ask about where it goes -->
                <button onclick={seedFromPreview} class="inline-flex items-center gap-1 rounded-md bg-violet px-3 py-1 text-xs font-medium text-white hover:bg-violet/90">Seed a text</button>
            {:else}
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
            {/if}
            </div>
        </header>

        <div class="flex min-h-0 flex-1">
            {#if previewHasSections}
                <!-- the map: front and back matter are chosen here, beside the preview, which pans to whatever is hovered -->
                <aside aria-label="Front and back matter" class="flex w-2/5 min-w-64 shrink-0 flex-col border-r border-taupe2 p-3">
                    <MapModal mode="matter" open={true} onchoose={applyMatter} onhover={(id) => (previewSpot = id)} title={loadName} paragraphs={paragraphs} />
                </aside>
            {/if}
            <div class="min-h-0 min-w-0 flex-1">
                <ParagraphViewer paragraphs={previewShown} matter={previewMatter} markdown={previewMarkdown} zoom={0.75} jumpToId={previewSpot} emphasizeEnds={false} empty="No text loaded yet." />
            </div>
        </div>
    </section>
    {/if}
</dialog>

<svelte:window onclick={onWindowClick} onkeydown={(e) => {
        onKeydown(e);
    }} />
