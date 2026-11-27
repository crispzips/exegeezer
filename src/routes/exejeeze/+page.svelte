<script>
    import { onMount, tick, untrack } from 'svelte';
    import { slide } from 'svelte/transition';
    import { EXAMPLE_ITEMS, EXAMPLE_TITLE } from '#lib/exampleText.js';
    import { tip } from '#lib/utilities/menuTip.svelte.js';
    import { cubicOut } from 'svelte/easing';
    import { replaceState } from '$app/navigation';
    import { page } from '$app/state';
    import { ParagraphSpacing, ArrowOutDownCircleHalf, QuoteRightAlt, Rename, MapIcon, CompassTool, Queue, BookOpen, Redo, Sitemap, Undo, Mesh, Swatch, StepsDown, Bomb, Explosion, Scroll, Sapling, FlagChequered, TextHeight, Tachometer, Search, FontFamily, LineSpacing, LetterSpacing, MarginLeft, MarginTop, GlobeAlt2, FileCog, CopyPlus, Trash, ToiletRoll, Cog, X, Clipboard, ClipboardPlus, Plus } from '@boxicons/svelte';
    import UploadButton from '#lib/components/UploadButton.svelte';
    import SourceButton from '#lib/components/SourceButton.svelte';
    import ParagraphViewer from '#lib/components/ParagraphViewer.svelte';
    import CascadingViewer from '#lib/components/CascadingViewer.svelte';
    import RallySetup from '#lib/components/RallySetup.svelte';
    import EmphasisToggle from '#lib/components/EmphasisToggle.svelte';
    import BusyOverlay from '#lib/components/BusyOverlay.svelte';
    import RallyViewer from '#lib/components/RallyViewer.svelte';
    import RallyWriter from '#lib/components/RallyWriter.svelte';
    import { emphasis } from '#lib/emphasis.svelte.js';
    import { READ_WPM, SIZES, DEFAULT_SIZE, WRITING_COLOUR } from '#lib/utilities/rallyChunks.js';
    import HierarchyViewer from '#lib/components/HierarchyViewer.svelte';
    import { cleanMarkdown } from '#lib/utilities/cleanMarkdown.js';
    import { splitParagraphs } from '#lib/utilities/splitParagraphs.js';
    import ConfirmDialog from '#lib/components/ConfirmDialog.svelte';
    import { anchorComments, sectionParagraphs } from '#lib/utilities/comments.js';
    import { CommentEditor, DRAFT_ID, provideCommentEditor } from '#lib/utilities/commentEditor.svelte.js';
    import { ancestorsOf, buildSections } from '#lib/utilities/buildSections.js';
    import NewTextDialog from '#lib/components/NewTextDialog.svelte';
    import TextSettingsModal from '#lib/components/TextSettingsModal.svelte';
    import NewItemChooser from '#lib/components/NewItemChooser.svelte';
    import EditModal from '#lib/components/EditModal.svelte';
    import MapModal from '#lib/components/MapModal.svelte';
    import OwnTextsDialog from '#lib/components/OwnTextsDialog.svelte';
    import OpenSourcesDialog from '#lib/components/OpenSourcesDialog.svelte';
    import { History } from '#lib/utilities/history.svelte.js';
    import { withoutMatter, matterSections } from '#lib/utilities/matter.js';
    import { appendToSection, moveToGap, sectionBlocks, applyDrop, danglingCount, describeSection, gapIndex, insertAt, moveItem, removeParagraph, removeSection, renameSection } from '#lib/utilities/editText.js';

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
    /** what the busy overlay says while a big text is being prepared or shown ('' = no overlay) */
    let busyLabel = $state('');
    /** a frame is painted and the event loop has had a turn: the overlay is on screen and input has been handled before heavy work starts */
    // (animation frames pause while the tab is hidden, so a short timer stands in for the frame and the work never waits on one)
    const breathe = () => new Promise((done) => {
        const wake = () => setTimeout(done, 0);
        const fallback = setTimeout(wake, 120);
        requestAnimationFrame(() => { clearTimeout(fallback); wake(); });
    });
    /**
     * Run a heavy step behind the rain overlay. The browser gets to paint the overlay first, and to catch up again once the work
     * (and the rendering it triggers) is done, so a big text doesn't leave the page looking frozen.
     * @template T
     * @param {string} label @param {() => T | Promise<T>} work @returns {Promise<T | undefined>}
     */
    async function behindRain(label, work) {
        busyLabel = label;
        try {
            await breathe();
            const result = await work();
            await tick(); // the DOM for what was just set
            await breathe();
            return result;
        } finally {
            busyLabel = '';
        }
    }
    function onFileLoaded() {
        const latest = uploadedfiles[uploadedfiles.length - 1];
        if (latest) void behindRain('Preparing the text…', () => {
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
        });
    }

    let ownTextsOpen = $state(false);
    let openSourcesOpen = $state(false);

    /** A text chosen in the "Open Libraries" modal becomes the text in the preview.
     * @param {{ title: string, markdown: string, details: Record<string, string>[], notes: string[] }} t */
    function onWebTextChosen(t) {
        void behindRain('Preparing the text…', () => {
        loadSource = 'web';
        loadName = t.title;
        loadNotes = t.notes ?? [];
        loadDetails = t.details ?? [];
        previewMarkdown = true;
        paragraphs = splitParagraphs(cleanMarkdown(t.markdown));
        showLoadModal();
        // as with a file: text above the first header goes into a Frontmatter section
        if (paragraphs.some((p) => p.level > 0) && paragraphs[0].level === 0) paragraphs = withFrontmatter(paragraphs);
        });
    }

    /** One of the user's own texts, chosen in the "From Your Texts" modal, becomes the text in the preview.
     * @param {{ id?: string, title: string, items: any[], importedDetails?: Record<string, string>[] }} saved */
    function onOwnTextChosen(saved) {
        // "Load a text" with nothing open (not seeding): the text itself opens, in a tab
        if (noText && !seeding && /** @type {any} */ (saved).id) return void openText(/** @type {any} */ (saved).id);
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

    /** Fetch a saved text from the database. @param {string} id */
    async function fetchSaved(id) {
        const res = await fetch(`/api/texts/${id}`);
        if (!res.ok) throw Object.assign(new Error(`${res.status}`), { status: res.status });
        return res.json();
    }

    /** Replace what the main pane shows with a saved text. @param {string} id */
    async function showSaved(id) {
        applySaved(await fetchSaved(id));
    }

    /** Make a fetched saved text the one in the main pane. @param {any} saved */
    function applySaved(saved) {
        pendingDetails = []; // those belonged to the text that was showing
        textId = saved.id;
        markdown = saved.items.some((/** @type {any} */ p) => p.level > 0);
        textTitle = saved.title;
        textRallyStyle = saved.rallyStyle ?? null;
        textPublicized = !!saved.publicized;
        textAuthors = saved.authors ?? [];
        mainText = saved.items.map((/** @type {any} */ p, /** @type {number} */ i) => ({ ...p, originalIndex: i }));
        lastSaved = JSON.stringify(toItems(mainText));
        history = new History();
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
        await restoreTabs();
        ready = true;
    });

    // ---- Tabs: up to MAX_TABS texts open at once; only the MAX_LOADED most recently active keep their content in memory ----
    // The active tab's text lives in the page's own variables (mainText, history, textId ...). Leaving a tab files them away in its record;
    // a tab that falls out of the most recent MAX_LOADED has its content dropped (it was saved when it was left) and reloads from the
    // database when it is opened again.
    const MAX_TABS = 10;
    const MAX_LOADED = 3;
    const REMEMBER_TABS = 'exegeezer.tabs';

    /**
     * @typedef {{
     *   key: string, textId: string | null, title: string, view: 'linear' | 'hierarchical' | 'cascading' | 'rally', focusId: string | null,
     *   items: typeof mainText | null, history: History<typeof mainText> | null, lastSaved: string, authors: string[], publicized: boolean,
     *   rallyStyle: string | null, markdown: boolean, pendingDetails: Record<string, string>[], lastActive: number
     * }} Tab
     * (`items` is null while the tab is deloaded)
     */
    /** @type {Tab[]} */
    let tabs = $state.raw([]);
    let activeKey = $state(/** @type {string | null} */ (null));
    let clock = 0;
    /** a tab is being opened: clicks on tabs wait */
    let switching = $state(false);
    /** a message under the tab strip (the tab limit) */
    let tabNotice = $state('');
    /** @type {ReturnType<typeof setTimeout> | undefined} */
    let noticeTimer;

    /** @param {string} message */
    function notify(message) {
        tabNotice = message;
        clearTimeout(noticeTimer);
        noticeTimer = setTimeout(() => (tabNotice = ''), 5000);
    }

    /** @param {Partial<Tab>} [from] @returns {Tab} */
    function newTab(from = {}) {
        return { key: crypto.randomUUID(), textId: null, title: 'Untitled', view, focusId: null, items: null, history: null, lastSaved: '', authors: [], publicized: false, rallyStyle: null, markdown: false, pendingDetails: [], lastActive: 0, ...from };
    }

    /** an empty tab: its content is the empty-state tree @returns {Tab} */
    const blankTab = () => newTab({ items: [], history: new History() });

    /** @param {Tab} t */
    const tabLabel = (t) => (t.textId ? t.title || 'Untitled text' : t.title && t.title !== 'Untitled' ? t.title : 'New tab');

    /** the active tab's record follows the text open in it (its id and title change as it is saved, renamed or replaced) */
    $effect(() => {
        const id = textId;
        const title = textTitle;
        untrack(() => {
            const t = tabs.find((x) => x.key === activeKey);
            if (t && (t.textId !== id || t.title !== title)) patchTab(t.key, { textId: id, title });
        });
    });

    /** Change a tab's record (records are replaced, not mutated, so the strip notices). @param {string} key @param {Partial<Tab>} patch */
    function patchTab(key, patch) {
        tabs = tabs.map((t) => (t.key === key ? { ...t, ...patch } : t));
    }

    /** File the page's live state away in the active tab's record. */
    function captureActive() {
        if (activeKey) patchTab(activeKey, { textId, title: textTitle, authors: textAuthors, publicized: textPublicized, rallyStyle: textRallyStyle, markdown, items: mainText, history, lastSaved, pendingDetails: $state.snapshot(pendingDetails), view, focusId });
    }

    /** Whether a loaded tab (not the active one) has changes the database does not have. @param {Tab} t */
    const isDirty = (t) => t.items !== null && JSON.stringify(toItems(t.items)) !== t.lastSaved;

    /** Save the active tab's text and wait for it. @returns {Promise<boolean>} whether it is safe to leave the tab */
    async function flushActive() {
        save();
        await queue;
        if (newTextRequest) return false; // a new text waiting to be named: it is not saved yet
        if (textId && JSON.stringify(toItems($state.snapshot(mainText))) !== lastSaved) return confirm('The latest changes to this text could not be saved. Leave it anyway?');
        return true;
    }

    /** Keep only the MAX_LOADED most recently active texts in memory: drop the content of the rest (never one with unsaved changes). */
    function enforceLoadLimit() {
        const keep = new Set(
            tabs
                .filter((t) => t.textId && (t.key === activeKey || t.items !== null))
                .sort((a, b) => (b.key === activeKey ? Infinity : b.lastActive) - (a.key === activeKey ? Infinity : a.lastActive))
                .slice(0, MAX_LOADED)
                .map((t) => t.key)
        );
        tabs = tabs.map((t) => (t.textId && t.items !== null && !keep.has(t.key) && !isDirty(t) ? { ...t, items: null, history: null, pendingDetails: [] } : t));
    }

    /** Put a tab's own settings in the page (the text itself is already there). @param {Tab} t */
    function applyTabSettings(t) {
        view = t.view;
        focusId = t.focusId;
        startEditId = null;
        fresh.clear();
        rallyFillId = rallyHeadId = null;
        rallyStarted = false;
        rallyPlaying = false;
        seedStep = 'idle';
        textVisibility = '';
        mode = chosenMode === 'writing' || chosenMode === 'commenting' || chosenMode === 'reading' ? /** @type {Mode} */ (chosenMode) : 'reading';
        replaceState(t.textId ? `/exejeeze?text=${t.textId}` : '/exejeeze?new', {});
    }

    /**
     * Make a tab the active one: the open text is saved first, a deloaded tab is read from the database again, and the least recently
     * active texts beyond MAX_LOADED are deloaded.
     * @param {string} key
     * @param {{ closing?: boolean }} [opts] closing: the tab that was active has just been removed (nothing of it to save or file away)
     * @returns {Promise<boolean>} whether it is open now
     */
    async function activate(key, { closing = false } = {}) {
        const target = tabs.find((t) => t.key === key);
        if (!target || switching || (key === activeKey && !closing)) return false;
        switching = true;
        try {
            if (!closing && !(await flushActive())) return false;
            /** @type {any} */
            let saved = null;
            if (target.items === null && target.textId) {
                try {
                    saved = await fetchSaved(target.textId);
                } catch (err) {
                    console.warn('Could not load the text', err);
                    if (/** @type {any} */ (err).status === 404) {
                        tabs = tabs.filter((t) => t.key !== key); // the text is gone
                        notify('That text no longer exists.');
                    } else notify('Could not load that text.');
                    return false;
                }
            }
            if (!closing) captureActive();
            activeKey = key;
            patchTab(key, { lastActive: ++clock });
            if (saved) applySaved(saved);
            else {
                const t = /** @type {typeof mainText} */ (target.items);
                textId = target.textId;
                textTitle = target.title;
                textAuthors = target.authors;
                textPublicized = target.publicized;
                textRallyStyle = target.rallyStyle;
                markdown = target.markdown;
                pendingDetails = target.pendingDetails;
                lastSaved = target.lastSaved;
                mainText = t;
                history = target.history ?? new History();
            }
            applyTabSettings(target);
            enforceLoadLimit();
            return true;
        } finally {
            switching = false;
        }
    }

    /** The + : a new, empty tab (it shows the tree of buttons to seed or load a text). */
    async function addTab() {
        const blank = tabs.find((t) => !t.textId && t.items?.length === 0);
        if (blank) return void (await activate(blank.key));
        if (tabs.length >= MAX_TABS) return notify(`Ten tabs are open, the most there can be. Close one to open another.`);
        const t = blankTab();
        tabs = [...tabs, t];
        if (!(await activate(t.key))) tabs = tabs.filter((x) => x.key !== t.key);
    }

    /** Close a tab. The text stays saved; closing the last one leaves an empty tab. @param {string} key */
    async function closeTab(key) {
        if (switching) return;
        const t = tabs.find((x) => x.key === key);
        if (!t) return;
        if (key === activeKey) {
            if (!(await flushActive())) return;
        } else if (isDirty(t) && !confirm('This text has changes that could not be saved. Close it anyway?')) return;
        removeTab(key);
    }

    /** Take a tab out of the strip and open its neighbour (the most recently active one), or an empty tab if it was the last. @param {string} key */
    async function removeTab(key) {
        const wasActive = key === activeKey;
        const rest = tabs.filter((x) => x.key !== key);
        tabs = rest;
        if (!wasActive) return;
        activeKey = null;
        const next = [...rest].sort((a, b) => b.lastActive - a.lastActive)[0] ?? blankTab();
        if (!rest.length) tabs = [next];
        if (!(await activate(next.key, { closing: true })) && !tabs.find((x) => x.key === next.key)) await addTab();
    }

    /** the stored tabs: which texts were open, with each one's view and focus, and which was active */
    function readStoredTabs() {
        try {
            const raw = localStorage.getItem(REMEMBER_TABS);
            const saved = JSON.parse(raw ?? '{}');
            const list = Array.isArray(saved.tabs) ? saved.tabs.filter((/** @type {any} */ t) => t && typeof t.textId === 'string') : [];
            return { tabs: /** @type {{ textId: string, title?: string, view?: string, focusId?: string | null }[]} */ (list), active: typeof saved.active === 'string' ? saved.active : null, /** whether tabs were ever remembered (if so, an empty list means they were all closed on purpose) */ known: raw !== null };
        } catch {
            return { tabs: [], active: null, known: false };
        }
    }

    /** Open the tabs left open last time (deloaded), then the one asked for: ?text=<id> (from the profile page), ?new, or the one that was active. */
    async function restoreTabs() {
        const params = new URLSearchParams(location.search);
        /** @type {any[]} */
        let texts = [];
        try {
            texts = await (await fetch('/api/texts')).json();
        } catch (err) {
            console.warn('Could not load the saved texts', err);
        }
        const byId = new Map(texts.map((t) => [t.id, t]));
        const stored = readStoredTabs();
        tabs = stored.tabs
            .filter((s, i) => byId.has(s.textId) && stored.tabs.findIndex((x) => x.textId === s.textId) === i)
            .slice(0, MAX_TABS)
            .map((s) => newTab({ textId: s.textId, title: byId.get(s.textId).title, view: VIEWS.includes(/** @type {any} */ (s.view)) ? /** @type {any} */ (s.view) : view, focusId: s.focusId ?? null }));

        const startNew = params.has('new');
        const wanted = params.get('text') ?? (startNew ? null : (stored.active ?? (stored.known ? null : rememberedText())));
        /** @type {Tab | undefined} */
        let pick = wanted && byId.has(wanted) ? tabs.find((t) => t.textId === wanted) : undefined;
        if (!pick && wanted && byId.has(wanted)) {
            if (tabs.length < MAX_TABS) tabs = [...tabs, (pick = newTab({ textId: wanted, title: byId.get(wanted).title }))];
            else notify('Ten tabs are open, the most there can be. Close one to open another text.');
        }
        if (!pick && startNew && tabs.length < MAX_TABS) tabs = [...tabs, (pick = blankTab())];
        if (!pick && !startNew && !stored.known && !tabs.length && texts.length) tabs = [(pick = newTab({ textId: texts[0].id, title: texts[0].title }))];
        pick ??= tabs.find((t) => t.textId === stored.active) ?? tabs[0];
        if (pick && (await activate(pick.key))) return;
        if (pick) tabs = tabs.filter((t) => t.key !== pick.key);

        // nothing could be opened: an empty tab (and, TEMPORARILY, with nothing saved yet, Dissertation.md from the gitignored assets)
        const blank = blankTab();
        tabs = [...tabs, blank];
        await activate(blank.key);
        const load = texts.length ? undefined : Object.values(dissertationFiles)[0];
        if (load) {
            const list = splitParagraphs(cleanMarkdown(/** @type {string} */ (await load())));
            const hasHeaders = list.some((p) => p.level > 0);
            textTitle = 'Dissertation';
            markdown = true;
            mainText = (hasHeaders && list[0]?.level === 0 ? withFrontmatter(list) : list).map((p, i) => ({ ...p, originalIndex: i }));
        }
    }

    /** Open a saved text in a tab: its own tab if it is open already, else a new one (an empty tab that is showing is used up). @param {string} id */
    async function openText(id) {
        const open = tabs.find((t) => t.textId === id);
        if (open) return void (await activate(open.key));
        const blank = tabs.find((t) => t.key === activeKey && !t.textId && !mainText.length);
        if (tabs.length >= MAX_TABS && !blank) {
            replaceState(textId ? `/exejeeze?text=${textId}` : '/exejeeze?new', {}); // the link was not followed
            return notify('Ten tabs are open, the most there can be. Close one to open another text.');
        }
        const t = newTab({ textId: id, title: '' });
        tabs = [...tabs, t];
        if (await activate(t.key)) {
            if (blank) tabs = tabs.filter((x) => x.key !== blank.key);
        } else tabs = tabs.filter((x) => x.key !== t.key);
    }

    // a link to /exejeeze?text=<id> followed while the page is open (the profile's Texts table): that text opens in a tab
    $effect(() => {
        const wanted = page.url.searchParams.get('text');
        if (ready && wanted && wanted !== untrack(() => textId)) untrack(() => openText(wanted));
    });

    // the open tabs are remembered, so a refresh returns to them (the content is not: it is fetched when a tab is opened)
    $effect(() => {
        if (!ready) return;
        const active = tabs.find((t) => t.key === activeKey);
        const data = { active: active?.textId ?? null, tabs: tabs.filter((t) => t.textId).map((t) => (t.key === activeKey ? { textId: t.textId, title: textTitle, view, focusId } : { textId: t.textId, title: t.title, view: t.view, focusId: t.focusId })) };
        try {
            localStorage.setItem(REMEMBER_TABS, JSON.stringify(data));
        } catch {
            // storage is blocked: nothing is remembered
        }
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
    let history = $state.raw(new History());

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

    /**
     * Something dragged on the map. Paragraphs dropped on a section go at its end; a section dropped on a section is joined
     * to the end of it (see applyDrop); either dropped in a gap lands there.
     * @param {{ kind: 'paragraphs' | 'section', ids: string[], into?: string, before?: string, after?: string, parentId?: string | null }} move
     */
    function moveFromMap({ kind, ids, into, before, after, parentId }) {
        /** @type {typeof mainText} */
        let next = mainText;
        if (into !== undefined && kind === 'section') {
            // each section in turn is joined to the end of the target, in the order of the text (one inside another picked goes with it)
            const heads = sectionBlocks(mainText, ids).map((b) => b[0].id);
            for (const id of heads) next = applyDrop(next, { id, targetId: into, place: 'merge-after' }, false);
        } else if (into !== undefined) next = appendToSection(mainText, ids, into);
        else next = moveToGap(mainText, ids, { before, after }, mainText.find((p) => p.id === parentId)?.level ?? 0);
        if (next !== mainText && commit(next)) mapChanged = true;
    }

    /** @param {{ id: string, kind: 'front' | 'back' | null }} change a top-level section made front matter, back matter, or neither, on the map */
    function setMatter({ id, kind }) {
        if (commit(mainText.map((p) => (p.id === id ? { ...p, frontmatter: kind === 'front', backmatter: kind === 'back' } : p)))) mapChanged = true;
    }

    /** the map was used to rearrange the text: when it closes, the changes stay and undo / redo start afresh */
    let mapChanged = false;
    $effect(() => {
        if (mapOpen || !mapChanged) return;
        mapChanged = false;
        history.clear();
    });

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
    function seedFromPreview() {
        if (paragraphs.length === 0) return;
        // the new text needs a title (and visibility) of its own: asked first, offering the loaded name
        newTextRequest = { title: loadSource === 'own' ? '' : loadName, run: ({ title, visibility }) => makeSeed(title, visibility) };
    }

    /** @param {string} title @param {string} visibility */
    async function makeSeed(title, visibility) {
        if (paragraphs.length === 0) return;
        await behindRain('Seeding the text…', () => seedNow(title, visibility));
    }

    /** @param {string} title @param {string} visibility */
    async function seedNow(title, visibility) {
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
            await breathe();
            // text above the first header goes into a Frontmatter section; a text with no headers at all stays as it is
            if (list[0] && (list[0].level ?? 0) === 0 && list.some((p) => (p.level ?? 0) > 0)) list = withFrontmatter(list);
            const body = JSON.stringify({ title, visibility, items: toItems(list), importedDetails: $state.snapshot(loadDetails) });
            await breathe();
            const res = await fetch('/api/texts', { method: 'POST', headers: { 'content-type': 'application/json' }, body });
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

    /** The text in the active tab is gone (deleted): its tab closes. */
    function unloadText() {
        if (activeKey) removeTab(activeKey);
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

    /** the paragraphs a paragraph or a section header stands for: itself, or all those in the section @param {string} id */
    function paragraphsAt(id) {
        const item = shownText.find((p) => p.id === id);
        if (!item) return [];
        return (item.level ?? 0) > 0 ? (sectionParagraphs(shownText).find((x) => x.id === id)?.paragraphIds ?? []) : [id];
    }
    /** @param {number} n */
    const countLabel = (n) => (n === 1 ? '1 paragraph' : `${n} paragraphs`);

    // ---- Picking several paragraphs to comment on at once, as files are picked in a file manager: a cmd-click (ctrl-click away from the
    // Mac) adds one, or a whole section, or takes it back out; a shift-click picks the range from the last of those to where it lands ----
    const MAC = typeof navigator !== 'undefined' && /Mac|iP(hone|ad|od)/.test(navigator.userAgent);
    let picked = $state.raw(/** @type {Set<string>} */ (new Set()));
    /** the paragraph or section header last cmd/ctrl-clicked (or first shift-clicked): where a shift-click's range starts */
    let pickAnchor = /** @type {string | null} */ (null);
    function clearPicked() {
        picked = new Set();
        pickAnchor = null;
    }
    // what was picked doesn't carry over to another text or mode
    $effect(() => {
        void textId;
        void mode;
        clearPicked();
    });
    /** what the views mark as picked: the paragraphs, and every section all of whose paragraphs are picked */
    const pickedMarks = $derived.by(() => {
        if (!picked.size) return picked;
        const whole = sectionParagraphs(shownText).filter((s) => s.paragraphIds.length && s.paragraphIds.every((p) => picked.has(p)));
        return new Set([...picked, ...whole.map((s) => s.id)]);
    });

    /** @param {string} id a paragraph or a section header */
    function togglePick(id) {
        const ids = paragraphsAt(id);
        if (!ids.length) return notify('That section has no paragraphs to comment on.');
        const out = ids.every((p) => picked.has(p));
        const next = new Set(picked);
        for (const p of ids) out ? next.delete(p) : next.add(p);
        picked = next;
        pickAnchor = id;
    }

    /** Pick every paragraph from the anchor to `id`, in the order of the text. With no anchor yet, `id` becomes it.
     * @param {string} id a paragraph or a section header @param {boolean} keep add the range to what is picked, instead of replacing it */
    function pickRange(id, keep) {
        const to = paragraphsAt(id);
        if (!to.length) return notify('That section has no paragraphs to comment on.');
        let from = pickAnchor ? paragraphsAt(pickAnchor) : [];
        if (!from.length) {
            pickAnchor = id;
            from = to;
        }
        const order = shownText.filter((p) => (p.level ?? 0) === 0).map((p) => p.id);
        // a section at either end is in the range whole
        const ends = [from[0], from[from.length - 1], to[0], to[to.length - 1]].map((p) => order.indexOf(p));
        const range = order.slice(Math.min(...ends), Math.max(...ends) + 1);
        picked = new Set(keep ? [...picked, ...range] : range);
    }

    /** Takes a view's mouse events before the view does: in commenting mode, those made with shift, or with cmd (Mac) or ctrl (elsewhere),
     * pick, and do nothing else. A ctrl-click on a Mac does nothing at all (the system's own menu still comes up). @param {MouseEvent} e */
    function pickCapture(e) {
        if (!commenting || !authed || !(e.target instanceof Element)) return;
        const add = MAC ? e.metaKey : e.ctrlKey;
        const nothing = MAC && e.ctrlKey;
        if (!(e.shiftKey || add || nothing) || (nothing && e.type === 'mousedown')) return;
        const el = e.target.closest('[data-para], [data-node]');
        if (!(el instanceof HTMLElement)) return;
        e.preventDefault(); // no text selection or link
        e.stopPropagation();
        if (e.type !== 'click' || nothing) return;
        const id = el.dataset.para ?? el.dataset.node ?? '';
        if (e.shiftKey) pickRange(id, add);
        else togglePick(id);
    }

    // ---- Writing a comment: its bubble, where the view puts it, is the editor ----
    const editor = new CommentEditor({ send: sendComment, textId: () => textId, failed: notify, remove: removeComment, askToRemove: requestCommentDelete });
    provideCommentEditor(editor);
    // a comment belongs to its text: leaving the text finishes with it
    $effect(() => {
        const id = textId;
        untrack(() => {
            if (editor.open && editor.open.textId !== id) editor.finish();
        });
    });

    /** Begin a new comment on some paragraphs. The first one creates the commentary. @param {string[]} paragraphIds */
    function compose(paragraphIds) {
        const id = textId;
        if (!authed || !id) return;
        editor.start({ id: DRAFT_ID, textId: id, paragraphIds, body: '' });
        showAnchor(paragraphIds);
    }

    // ---- A click anywhere but on the comment in the editor finishes with it. It is seen to before whatever was clicked
    // does anything (so that may open another), and not for a press that began on the comment, as a selecting drag may ----
    let pressedOnComment = false;
    /** @param {EventTarget | null} t */
    const onEditedComment = (t) => t instanceof Element && !!t.closest('article[data-editing]');
    /** @param {MouseEvent} e */
    function clickAway(e) {
        const began = pressedOnComment;
        pressedOnComment = false;
        if (editor.open && !began && !onEditedComment(e.target)) editor.finish();
    }

    /** Open the sections around the place a new comment goes, in the views that keep sections closed. @param {string[]} paragraphIds */
    function showAnchor(paragraphIds) {
        const [at] = anchorComments([{ id: DRAFT_ID, commentaryId: '', authors: [], body: '', createdAt: '', paragraphIds }], shownText);
        if (!at || (view !== 'hierarchical' && view !== 'cascading') || document.querySelector(`[data-node="${CSS.escape(at.anchorId)}"]`)) return;
        const around = ancestorsOf(buildSections(shownText), at.anchorId);
        if (around?.length) hierarchy?.openPath(around);
    }

    // coming to a view (or back to commenting) with a comment that couldn't be saved: its bubble is shown there too
    $effect(() => {
        void view;
        if (mode !== 'commenting') return;
        // once the view has drawn itself and opened wherever it was going to
        const turn = setTimeout(() => {
            const writing = editor.open;
            if (!writing || writing.textId !== textId) return;
            showAnchor(writing.paragraphIds);
            editor.called++;
        }, 300);
        return () => clearTimeout(turn);
    });

    /** @param {import('#lib/utilities/commentEditor.svelte.js').Writing} writing @returns {Promise<string | void>} what went wrong, if it did */
    async function sendComment({ id, textId: on, paragraphIds, body }) {
        const isNew = id === DRAFT_ID;
        await queue; // let any save in flight finish first, so the paragraphs exist on the server
        const res = await fetch(`/api/texts/${on}/comments`, {
            method: isNew ? 'POST' : 'PATCH',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify(isNew ? { paragraphIds, body } : { commentId: id, body })
        });
        const answer = await res.json().catch(() => null);
        if (!res.ok) return answer?.message ?? 'Could not save the comment.';
        if (isNew && paragraphIds.some((p) => picked.has(p))) clearPicked();
        reloadCommentary(answer?.commentaryId);
        await loadComments(on);
    }

    /** A commentary is a text too: once its comments change, a tab holding it is out of date (and saving from it would undo
     * the change), so it reloads. @param {string | undefined} commentaryId */
    function reloadCommentary(commentaryId) {
        tabs = tabs.map((t) => (t.key !== activeKey && t.textId === commentaryId && !isDirty(t) ? { ...t, items: null, history: null } : t));
    }

    /** @param {import('#lib/utilities/comments.js').AnchoredComment} comment */
    function requestCommentDelete(comment) {
        const on = textId;
        if (!on) return;
        const excerpt = comment.body.length > 160 ? comment.body.slice(0, 160) + '…' : comment.body;
        deleteRequest = {
            title: 'Delete this comment?',
            message: `"${excerpt}"\n\nThis permanently deletes the comment. This cannot be undone.`,
            confirm: 'Delete comment',
            run: () => removeComment(on, comment.id)
        };
    }

    /** @param {string} on the text commented on @param {string} commentId */
    async function removeComment(on, commentId) {
        // it goes from sight at once (and comes back if the server won't delete it)
        if (fetched.textId === on) fetched = { textId: on, comments: fetched.comments.filter((c) => c.id !== commentId) };
        try {
            await queue;
            const res = await fetch(`/api/texts/${on}/comments`, {
                method: 'DELETE',
                headers: { 'content-type': 'application/json' },
                body: JSON.stringify({ commentId })
            });
            const answer = await res.json().catch(() => null);
            if (!res.ok) notify(answer?.message ?? 'Could not delete the comment.');
            else reloadCommentary(answer?.commentaryId);
            // after a refusal too: the comment may already be gone
            await loadComments(on);
        } catch (err) {
            console.warn('Could not delete the comment', err);
            notify('Could not delete the comment.');
            await loadComments(on);
        }
    }

    function commentPicked() {
        const ids = shownText.filter((p) => picked.has(p.id)).map((p) => p.id);
        if (ids.length) compose(ids);
    }

    /** A click in commenting mode, on a paragraph or on a section's header or comment button (which comments on all its paragraphs).
     * On something picked, the comment is on everything picked. @param {string} id */
    function commentAt(id) {
        if (pickedMarks.has(id)) return commentPicked();
        const ids = paragraphsAt(id);
        if (!ids.length) return notify('That section has no paragraphs to comment on.');
        compose(ids);
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
        if (!authed || commenting) return;
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

    // ---- Comments: fetched when a text is shown in commenting mode, and again after one is posted ----
    const commenting = $derived(mode === 'commenting');
    /** the comments last fetched, and the text they are on */
    let fetched = $state.raw({ textId: /** @type {string | null} */ (null), comments: /** @type {import('#lib/utilities/comments.js').Comment[]} */ ([]) });
    /** @param {string} id */
    async function loadComments(id) {
        try {
            const res = await fetch(`/api/texts/${id}/comments`);
            if (!res.ok) throw new Error(`${res.status}`);
            const { comments } = await res.json();
            if (id === textId) fetched = { textId: id, comments };
        } catch (err) {
            console.warn('Could not load the comments', err);
            notify('Could not load the comments.');
        }
    }
    $effect(() => {
        const id = textId;
        if (authed && commenting && id) untrack(() => loadComments(id));
    });
    /** the paragraphs of the new comment being written on this text, or null (not its words: they change with every key) */
    const draftOn = $derived(editor.open?.id === DRAFT_ID && editor.open.textId === textId ? editor.open.paragraphIds : null);
    /** what the views show in commenting mode, each comment placed by its section or first paragraph, the one being written
     * among them (undefined outside that mode) */
    const comments = $derived.by(() => {
        if (!commenting) return undefined;
        const saved = fetched.textId === textId ? fetched.comments : [];
        // the new one counts as the latest, so it follows the others in its place
        const draft = draftOn ? [{ id: DRAFT_ID, commentaryId: '', authors: [data.user?.name ?? ''], body: '', createdAt: '9999', paragraphIds: draftOn }] : [];
        return anchorComments([...saved, ...draft], shownText);
    });
    /** what the views mark: what is picked, and what the comment in the editor is about */
    const shownMarks = $derived.by(() => {
        const written = comments?.find((c) => editor.is(c.id));
        return written ? new Set([...pickedMarks, written.anchorId, ...written.targetIds]) : pickedMarks;
    });
    /** linear view only: whether the comments are to the left of the text */
    let commentsLeft = $state(false);

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
            if (typeof saved.commentsLeft === 'boolean') commentsLeft = saved.commentsLeft;
            const z = ZOOMS.indexOf(saved.zoom);
            const look = saved.appearance ?? {};
            const at = (/** @type {number[]} */ list, /** @type {unknown} */ v, /** @type {number} */ d) => (list.indexOf(/** @type {number} */ (v)) >= 0 ? list.indexOf(/** @type {number} */ (v)) : d);
            sizeStep = at(SIZE_STEPS, look.size, DEFAULT_SIZE_STEP);
            lineStep = at(LINE_STEPS, look.line, DEFAULT_LINE);
            letterStep = at(LETTER_STEPS, look.letter, DEFAULT_LETTER);
            sideStep = at(MARGIN_STEPS, look.side, DEFAULT_MARGIN);
            paraStep = at(PARA_STEPS, look.para, DEFAULT_PARA);
            if (z >= 0) zoomStep = z;
            // the size is remembered as rem (not as a step), so changing the scale never moves it; an older step-only setting is dropped
            const found = SIZES.indexOf(saved.rallySizeRem);
            if (found >= 0) rallySize = found;
            if (typeof saved.emphasizeFirst === 'boolean') emphasis.first = saved.emphasizeFirst;
            if (Number.isInteger(saved.rallySpeed) && saved.rallySpeed >= 0 && saved.rallySpeed < READ_WPM.length) rallySpeed = saved.rallySpeed;
        } catch {
            // no saved settings (or storage is blocked): the defaults stand
        }
        restored = true;
    });

    $effect(() => {
        const settings = { view, mode: chosenMode, exploded, commentsLeft, zoom: ZOOMS[zoomStep], appearance: { size: SIZE_STEPS[sizeStep], line: LINE_STEPS[lineStep], letter: LETTER_STEPS[letterStep], side: MARGIN_STEPS[sideStep], para: PARA_STEPS[paraStep] }, rallySizeRem: SIZES[rallySize], rallySpeed, emphasizeFirst: emphasis.first };
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
    // paragraph spacing (linear view only): the space above and below each paragraph, in rem. 0.375 is the linear view's own (py-1.5), the default
    const PARA_STEPS = [0, 0.1, 0.2, 0.375, 0.6, 0.9, 1.3, 1.8, 2.5];
    const DEFAULT_PARA = 3;
    const DEFAULT_SIZE_STEP = 2;
    const DEFAULT_LINE = 2;
    const DEFAULT_LETTER = 1;
    const DEFAULT_MARGIN = 4;
    let sizeStep = $state(DEFAULT_SIZE_STEP);
    let lineStep = $state(DEFAULT_LINE);
    let letterStep = $state(DEFAULT_LETTER);
    let sideStep = $state(DEFAULT_MARGIN);
    let paraStep = $state(DEFAULT_PARA);
    /** the appearance menu: whether its submenu is open, and which slider is showing */
    let appearanceOpen = $state(false);
    /** @type {'size' | 'line' | 'letter' | 'side' | 'para' | null} */
    let appearanceSlider = $state(null);
    /** the appearance settings apply in every mode, but not in the rally view */
    const appearanceOn = $derived(view !== 'rally');
    const appearanceStyle = $derived(`--ta-size: ${SIZE_STEPS[sizeStep]}; --ta-lh: ${LINE_STEPS[lineStep]}; --ta-ls: ${LETTER_STEPS[letterStep]}em; --ta-mxp: ${(((MARGIN_STEPS[sideStep] - 0.12) / 0.76) * 100).toFixed(3)}%; --ta-mx: ${(Math.max(0, MARGIN_STEPS[sideStep] - 0.12) * 20).toFixed(3)}rem; --ta-ps: ${PARA_STEPS[paraStep]}rem`);
    const APPEARANCE = /** @type {const} */ ([
        { id: 'size', label: 'Font size', steps: SIZE_STEPS },
        { id: 'line', label: 'Line spacing', steps: LINE_STEPS },
        { id: 'letter', label: 'Kerning', steps: LETTER_STEPS },
        { id: 'side', label: 'Side margins', steps: MARGIN_STEPS },
        { id: 'para', label: 'Paragraph spacing', steps: PARA_STEPS }
    ]);
    /** @param {string} id */
    const appearanceStep = (id) => (id === 'size' ? sizeStep : id === 'line' ? lineStep : id === 'letter' ? letterStep : id === 'para' ? paraStep : sideStep);
    /** @param {string} id @param {number} v */
    function setAppearanceStep(id, v) {
        if (id === 'size') sizeStep = v;
        else if (id === 'line') lineStep = v;
        else if (id === 'letter') letterStep = v;
        else if (id === 'para') paraStep = v;
        else sideStep = v;
    }
    /** the appearance as it was when this text was opened in the viewer: what the revert button goes back to
     * @type {{ size: number, line: number, letter: number, side: number, para: number } | null} */
    let appearanceAtOpen = null;
    $effect(() => {
        void textId;
        if (!restored) return;
        untrack(() => (appearanceAtOpen = { size: sizeStep, line: lineStep, letter: letterStep, side: sideStep, para: paraStep }));
    });
    function resetAppearance() {
        sizeStep = appearanceAtOpen?.size ?? DEFAULT_SIZE_STEP;
        lineStep = appearanceAtOpen?.line ?? DEFAULT_LINE;
        letterStep = appearanceAtOpen?.letter ?? DEFAULT_LETTER;
        sideStep = appearanceAtOpen?.side ?? DEFAULT_MARGIN;
        paraStep = appearanceAtOpen?.para ?? DEFAULT_PARA;
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
    function startRally() {
        rallySetupOpen = false;
        if (noText) {
            // a rally from nothing makes a new text, which needs a title first
            newTextRequest = { title: '', run: ({ title, visibility }) => beginRally(title, visibility) };
            return;
        }
        beginRally('', 'private');
    }
    /** @param {string} title @param {string} visibility */
    async function beginRally(title, visibility) {
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
                const res = await fetch('/api/texts', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ title, visibility, rallyStyle: 'compose', items }) });
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
<div class="flex h-screen bg-taupe1">
    <div class="flex min-w-0 flex-1 flex-col" bind:this={mainPane}>
        <!-- the tabs: up to ten texts open at once (only the three most recently used keep their content in memory; the others reload when opened) -->
        {#if authed && tabs.length}
            <div class="relative shrink-0">
            <div role="tablist" aria-label="Open texts" class="flex items-end gap-0.5 overflow-x-auto bg-taupe2 px-3 pt-3">
                {#each tabs as t (t.key)}
                    {@const on = t.key === activeKey}
                    <div data-tab={t.key} data-loaded={t.items !== null || on} class="flex max-w-56 min-w-0 shrink-0 items-center rounded-t-md border border-b-2 {on ? 'relative z-10 border-2 border-accent border-b-transparent bg-taupe1 text-dark shadow-[0_0_10px_1px_color-mix(in_srgb,var(--color-accent)_60%,transparent)]' : 'border-taupe3 border-b-accent bg-taupe2 text-grey3 hover:bg-taupe1'}">
                        <button role="tab" aria-selected={on} onclick={() => activate(t.key)} use:tip={on ? tabLabel(t) : t.items === null ? `${tabLabel(t)} (not in memory: it loads when opened)` : tabLabel(t)} data-tip-place="below" class="min-w-0 flex-1 truncate py-1 pr-1 pl-3 text-left text-sm {t.items === null && !on ? 'italic' : ''} {on ? 'font-semibold' : ''}">{tabLabel(t)}</button>
                        <button onclick={() => closeTab(t.key)} aria-label="Close tab" use:tip={'Close tab'} data-tip-place="below" class="mr-1 inline-flex shrink-0 items-center justify-center rounded-md p-0.5 hover:bg-taupe2"><X width={16} height={16} /></button>
                    </div>
                {/each}
                <button onclick={addTab} aria-label="New tab" aria-disabled={tabs.length >= MAX_TABS && !tabs.some((t) => !t.textId && t.items?.length === 0)} use:tip={tabs.length >= MAX_TABS ? 'Ten tabs are open: close one first' : 'New tab'} data-tip-place="below" class="mb-0.5 inline-flex shrink-0 items-center justify-center rounded-md p-1 text-dark hover:bg-taupe3 {tabs.length >= MAX_TABS ? 'opacity-50' : ''}"><Plus width={18} height={18} /></button>
            </div>
            <!-- the violet line under the strip, with a fainter shadow than the active tab's; the active tab (z-10) covers it, so the line goes up around that tab -->
            <div aria-hidden="true" class="pointer-events-none absolute inset-x-0 bottom-0 h-0.5 bg-accent shadow-[0_1px_8px_1px_color-mix(in_srgb,var(--color-accent)_45%,transparent)]"></div>
            {#if tabNotice}
                <p role="status" class="raised absolute top-full right-3 z-20 mt-1 rounded-md px-3 py-1.5 text-sm text-dark shadow-lg">{tabNotice}</p>
            {/if}
            </div>
        {/if}
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
                    <button role="menuitem" onclick={() => !commenting && requestWhole('wipe')} aria-label="Wipe clean" aria-disabled={commenting} use:tip={commenting ? "Wipe clean (the text can't be changed while commenting)" : 'Wipe clean'} data-tip-place="below" class="inline-flex items-center justify-center rounded-md p-1 {commenting ? 'cursor-not-allowed opacity-60' : 'hover:bg-taupe2'}"><ToiletRoll /></button>
                </div>
            {/if}
            {#if commenting && view !== 'rally' && picked.size && !editor.open}
                <!-- what has been picked to comment on: in the title bar, so it covers none of the text -->
                <div role="toolbar" aria-label="Picked paragraphs" class="raised ml-auto flex shrink-0 items-center gap-2 rounded-full py-0.5 pr-1 pl-4 text-sm whitespace-nowrap shadow-md">
                    <span role="status">{countLabel(picked.size)} picked</span>
                    <button onclick={commentPicked} class="rounded-full bg-accent px-3 py-0.5 font-medium text-on-accent hover:bg-accent/90">Comment</button>
                    <button onclick={clearPicked} aria-label="Clear the picked paragraphs" use:tip={'Clear (Esc)'} data-tip-place="below" class="inline-flex items-center justify-center rounded-full p-1 hover:bg-taupe2"><X width={16} height={16} /></button>
                </div>
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
        {#key activeKey}
        <!-- svelte-ignore a11y_click_events_have_key_events, a11y_no_static_element_interactions -->
        <div onclickcapture={pickCapture} ondblclickcapture={pickCapture} onmousedowncapture={pickCapture} class="h-full {appearanceOn ? 'appearance' : ''} {appearanceOn && lineStep !== DEFAULT_LINE ? 'ta-line' : ''} {appearanceOn && paraStep !== DEFAULT_PARA ? 'ta-para' : ''}" style={appearanceOn ? appearanceStyle : undefined}>
        {#if view === 'linear'}
            <ParagraphViewer onleave={leftBubble} onwrite={authed && !editing && !commenting ? writeAt : undefined} {comments} oncomment={authed && commenting ? commentAt : undefined} picked={shownMarks} onnewitem={editing ? askNew : undefined} paragraphs={shownText} {startEditId} onstartedit={() => (startEditId = null)} {focusId} onfocusitem={(id) => (focusId = id)} {matter} {markdown} {commentsLeft} onflipcomments={() => (commentsLeft = !commentsLeft)} zoom={ZOOMS[zoomStep]} empty="" synopsis ondelete={editing ? requestDelete : undefined} onexpand={editing ? (r) => (editRequest = r) : undefined} onmove={editing ? moveByDrag : undefined} oninject={editing ? injectRequest : undefined} onedit={editing ? editParagraph : undefined} />
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
                    <button onclick={() => (rallySetupOpen = true)} aria-label="Rally on!" use:tip={'Rally on!'} data-tip-place="below" class="inline-flex items-center justify-center rounded-md bg-accent px-6 py-3 text-taupe1 hover:bg-accent/90"><FlagChequered class="text-taupe1!" width={28} height={28} /></button>
                </div>
            {/if}
        {:else if view === 'cascading'}
            <CascadingViewer ondelete={editing ? requestDelete : undefined} onleave={leftBubble} onwrite={authed && !editing && !commenting ? writeAt : undefined} {comments} oncomment={authed && commenting ? commentAt : undefined} picked={shownMarks} bind:this={hierarchy} onrename={editing ? renameSectionTitle : undefined} {focusId} onfocusitem={(id) => (focusId = id)} {exploded} paragraphs={shownText} empty="" onmove={editing ? moveByDrag : undefined} onadd={editing ? addAtGap : undefined} onnewitem={editing ? askNew : undefined} onedit={editing ? editParagraph : undefined} />
        {:else}
            <HierarchyViewer onleave={leftBubble} onwrite={authed && !editing && !commenting ? writeAt : undefined} {comments} oncomment={authed && commenting ? commentAt : undefined} picked={shownMarks} onrename={editing ? renameSectionTitle : undefined} onnewitem={editing ? askNew : undefined} bind:this={hierarchy} {startEditId} onstartedit={() => (startEditId = null)} {focusId} onfocusitem={(id) => (focusId = id)} paragraphs={shownText} {matter} empty="" ondelete={editing ? requestDelete : undefined} onexpand={editing ? (r) => (editRequest = r) : undefined} onmove={editing ? moveByDrag : undefined} oninject={editing ? injectRequest : undefined} onedit={editing ? editParagraph : undefined} />
        {/if}
        </div>
        {/key}
        </div>
    </div>

    <!-- Vertical menu column -->
    <nav aria-label="Menu" class="fixed top-0 right-0 z-50 flex w-12 flex-col items-center gap-1 overflow-y-auto pt-2 {authed ? 'bottom-[10rem]' : 'bottom-[12.5rem]'}">
        <!-- with no text open there is nothing to load into: the Seed a text button starts one -->
        <!-- loading puts text into the open one, so not while commenting -->
        {#if !noText}
        <button
            onclick={openModal}
            aria-label="Load text"
            aria-disabled={!authed || commenting}
            use:tip={!authed ? 'Load text (sign in first)' : commenting ? "Load text (the text can't be changed while commenting)" : 'Load text'}
            class="inline-flex items-center justify-center rounded-md p-1 text-dark {authed && !commenting ? 'hover:bg-taupe2' : 'cursor-not-allowed opacity-60'}"
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
            {#if editing}<CompassTool />{:else}<MapIcon />{/if}
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
                <button onclick={() => (zoomOpen = !zoomOpen)} aria-label="Zoom" aria-expanded={zoomOpen} use:tip={'Zoom'} class="inline-flex items-center justify-center rounded-md p-1 text-dark hover:bg-taupe2 {zoomOpen ? 'bg-taupe3' : ''}"><Search /></button>
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
                    class="inline-flex items-center justify-center rounded-md p-1 text-dark hover:bg-taupe2 {exploded ? 'bg-taupe3' : ''}"
                >
                    {#if exploded}<Explosion />{:else}<Bomb />{/if}
                </button>
            </div>
        {/if}

        {#if view === 'rally' && mode !== 'commenting'}
            <!-- Rally settings: the setup and sliders for text size and speed (ticks, no labels) -->
            <div class="submenu flex w-full flex-col items-center gap-1 py-1">
                <button onclick={() => ((rallyPlaying = false), (setupAsked = true), (rallyStarted = false), (rallySetupOpen = true))} aria-label="Rally setup" use:tip={'Rally setup'} class="inline-flex items-center justify-center rounded-md p-1 text-dark hover:bg-taupe2"><Cog /></button>
                <!-- the rally's reading also sets first and last sentences apart; the same four-way toggle as in text appearance -->
                {#if mode === 'reading'}<EmphasisToggle />{/if}
                <!-- text size and speed: each a vertical slider (smallest / slowest at the bottom, a tick for every step, no labels), shown when its icon is pressed -->
                <button onclick={() => (sizeOpen = !sizeOpen)} aria-label="Text size" aria-expanded={sizeOpen} use:tip={'Text size'} class="inline-flex items-center justify-center rounded-md p-1 text-dark hover:bg-taupe2 {sizeOpen ? 'bg-taupe3' : ''}"><TextHeight /></button>
                {#if sizeOpen}
                    <div transition:slide={{ duration: 200 }} class="flex items-stretch gap-0.5 py-1">
                        <div aria-hidden="true" class="flex flex-col justify-between py-[7px]">{#each SIZES as _, i (i)}<span class="h-px w-1.5 bg-taupe4"></span>{/each}</div>
                        <input type="range" min="0" max={SIZES.length - 1} step="1" bind:value={rallySize} aria-label="Text size" use:tip={'Text size'} class="rally-speed" style="height: 5.5rem; --p: {rallySize / (SIZES.length - 1)}{editing ? `; --mode: var(--color-${WRITING_COLOUR})` : ''}" />
                    </div>
                {/if}
                <button onclick={() => (speedOpen = !speedOpen)} aria-label="Speed" aria-expanded={speedOpen} use:tip={'Speed'} class="inline-flex items-center justify-center rounded-md p-1 text-dark hover:bg-taupe2 {speedOpen ? 'bg-taupe3' : ''}"><Tachometer /></button>
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
                    {#if mode === 'writing'}<Rename />{:else if mode === 'commenting'}<QuoteRightAlt />{:else}<BookOpen />{/if}
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
                    class="inline-flex items-center justify-center rounded-md p-1 text-dark hover:bg-taupe3 {appearanceOpen ? 'bg-taupe3' : ''}"
                >
                    <FontFamily />
                </button>
                {#if appearanceOpen}
                    <div transition:slide={{ duration: 200 }} class="flex w-full flex-col items-center gap-1">
                        {#each APPEARANCE.filter((a) => a.id !== 'para' || view === 'linear') as a (a.id)}
                            <button onclick={() => (appearanceSlider = appearanceSlider === a.id ? null : a.id)} aria-label={a.label} aria-expanded={appearanceSlider === a.id} use:tip={a.label} class="inline-flex items-center justify-center rounded-md p-1 text-dark hover:bg-taupe3 {appearanceSlider === a.id ? 'bg-taupe3' : ''}">
                                {#if a.id === 'size'}<TextHeight />{:else if a.id === 'line'}<LineSpacing />{:else if a.id === 'letter'}<LetterSpacing />{:else if a.id === 'para'}<ParagraphSpacing />{:else}<MarginLeft />{/if}
                            </button>
                            {#if appearanceSlider === a.id}
                                <div transition:slide={{ duration: 200 }} class="flex items-stretch gap-0.5 py-1">
                                    <input type="range" min="0" max={a.steps.length - 1} step="1" value={appearanceStep(a.id)} oninput={(e) => setAppearanceStep(a.id, +e.currentTarget.value)} aria-label={a.label} use:tip={a.label} class="rally-speed" style="height: 5.5rem; --p: {appearanceStep(a.id) / (a.steps.length - 1)}" />
                                    <!-- the ticks sit on the slider's right, like a ruler: every other one shorter -->
                                    <div aria-hidden="true" class="flex flex-col items-end justify-between py-[7px]">{#each a.steps as _, i (i)}<span class="h-px {i % 2 === 0 ? 'w-2' : 'w-1'} bg-taupe4"></span>{/each}</div>
                                </div>
                            {/if}
                        {/each}
                        <EmphasisToggle />
                        <button onclick={resetAppearance} aria-label="Revert text appearance" use:tip={'Revert to how it was when you opened this text'} class="inline-flex items-center justify-center rounded-md p-1 text-xs text-dark hover:bg-taupe3">↺</button>
                    </div>
                {/if}
            </div>
        {/if}
    </nav>
</div>

<BusyOverlay label={busyLabel} />
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
<NewTextDialog bind:request={newTextRequest} />
<TextSettingsModal bind:request={settingsRequest} onsaved={({ title, authors, publicized }) => ((textTitle = title), (textAuthors = authors), (textPublicized = publicized))} />
<MapModal bind:open={mapOpen} writing={editing} onmove={editing ? moveFromMap : undefined} onmatter={editing ? setMatter : undefined} onundo={editing ? undo : undefined} onredo={editing ? redo : undefined} canundo={history.canUndo} canredo={history.canRedo} title={textTitle} paragraphs={editing ? mainText : shownText} onnavigate={goToSection} />
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
                <button onclick={seedFromPreview} class="inline-flex items-center gap-1 rounded-md bg-accent px-3 py-1 text-xs font-medium text-on-accent hover:bg-accent/90">Seed a text</button>
            {:else}
            <!-- Inject Loaded Text dropdown -->
            <div class="relative" bind:this={injectmenu}>
                <button
                    onclick={() => (mainText.length === 0 || injectGap !== null ? inject('append') : (injectOpen = !injectOpen))}
                    disabled={paragraphs.length === 0}
                    aria-haspopup={mainText.length > 0 && injectGap === null ? 'menu' : undefined}
                    aria-expanded={mainText.length > 0 && injectGap === null ? injectOpen : undefined}
                    class="inline-flex items-center gap-1 rounded-md bg-accent px-3 py-1 text-xs font-medium text-on-accent hover:bg-accent/90 disabled:cursor-not-allowed disabled:opacity-50 disabled:hover:bg-accent"
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
                <ParagraphViewer paragraphs={previewShown} matter={previewMatter} markdown={previewMarkdown} zoom={0.75} jumpToId={previewSpot} emphasizeFirst={false} empty="No text loaded yet." />
            </div>
        </div>
    </section>
    {/if}
</dialog>

<svelte:window onpointerdowncapture={(e) => (pressedOnComment = onEditedComment(e.target))} onclickcapture={clickAway} onclick={onWindowClick} onkeydown={(e) => {
        onKeydown(e);
        // Escape unpicks (a comment being written takes its own Escape)
        if (e.key === 'Escape' && picked.size && !editor.open) clearPicked();
    }} />
