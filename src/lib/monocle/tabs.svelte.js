import { onMount, untrack } from 'svelte';
import { replaceState } from '$app/navigation';
import { page } from '$app/state';
import { EXAMPLE_ITEMS, EXAMPLE_TITLE } from '#lib/exampleText.js';
import { History } from '#lib/utilities/history.svelte.js';
import { cleanMarkdown } from '#lib/utilities/cleanMarkdown.js';
import { splitParagraphs } from '#lib/utilities/splitParagraphs.js';
import { fetchSaved, newStanding, rememberedText } from './document.svelte.js';
import { VIEWS } from './settings.svelte.js';
import { toItems, withFrontmatter } from './items.js';

// ---- Tabs: up to MAX_TABS texts open at once; only the MAX_LOADED most recently active keep their content in memory ----
// The active tab's text lives in the Monocle's document (items, history, id ...). Leaving a tab files them away in its record;
// a tab that falls out of the most recent MAX_LOADED has its content dropped (it was saved when it was left) and reloads from the
// database when it is opened again.
export const MAX_TABS = 10;
const MAX_LOADED = 3;
const REMEMBER_TABS = 'exegeezer.tabs';

// TEMPORARY fallback: when nothing is saved yet, load Dissertation.md into the main
// pane with an automatic Frontmatter section (the file is gitignored, so this does
// nothing where it is missing).
const dissertationFiles = import.meta.glob('/src/lib/assets/Dissertation.md', { query: '?raw', import: 'default' });

/**
 * @typedef {{
 *   key: string, textId: string | null, title: string, view: import('./settings.svelte.js').View, focusId: string | null,
 *   items: any[] | null, history: History<any> | null, lastSaved: string, authors: string[], publicized: boolean,
 *   rallyStyle: string | null, markdown: boolean, pendingDetails: Record<string, string>[], lastActive: number,
 *   standing: import('./document.svelte.js').Standing
 * }} Tab
 * (`items` is null while the tab is deloaded)
 */

/** @param {Tab} t */
export const tabLabel = (t) => (t.textId ? t.title || 'Untitled text' : t.title && t.title !== 'Untitled' ? t.title : 'New tab');

/** Whether a loaded tab (not the active one) has changes the database does not have. @param {Tab} t */
const isDirty = (t) => t.items !== null && JSON.stringify(toItems(t.items)) !== t.lastSaved;

export class Tabs {
    /** @type {Tab[]} */
    list = $state.raw([]);
    activeKey = $state(/** @type {string | null} */ (null));
    /** a tab is being opened: clicks on tabs wait */
    switching = $state(false);
    /** a message under the tab strip (the tab limit) */
    notice = $state('');
    clock = 0;
    /** @type {ReturnType<typeof setTimeout> | undefined} */
    noticeTimer;

    /** @param {import('./monocle.svelte.js').Monocle} monocle */
    constructor(monocle) {
        this.monocle = monocle;

        onMount(async () => {
            const { doc } = this.monocle;
            if (!this.monocle.authed) {
                // signed out: the example text, read-only; nothing is loaded or saved (`ready` stays false)
                doc.title = EXAMPLE_TITLE;
                doc.markdown = true;
                doc.items = EXAMPLE_ITEMS.map((p) => ({ ...p }));
                return;
            }
            await this.restore();
            doc.ready = true;
        });

        // the active tab's record follows the text open in it (its id and title change as it is saved, renamed or replaced)
        $effect(() => {
            const id = this.monocle.doc.id;
            const title = this.monocle.doc.title;
            untrack(() => {
                const t = this.list.find((x) => x.key === this.activeKey);
                if (t && (t.textId !== id || t.title !== title)) this.patch(t.key, { textId: id, title });
            });
        });

        // a link to /exejeeze?text=<id> followed while the page is open (the profile's Texts table): that text opens in a tab
        $effect(() => {
            const wanted = page.url.searchParams.get('text');
            if (this.monocle.doc.ready && wanted && wanted !== untrack(() => this.monocle.doc.id)) untrack(() => this.openText(wanted));
        });

        // the open tabs are remembered, so a refresh returns to them (the content is not: it is fetched when a tab is opened)
        $effect(() => {
            const { doc } = this.monocle;
            if (!doc.ready) return;
            const { settings } = this.monocle;
            const active = this.list.find((t) => t.key === this.activeKey);
            const data = { active: active?.textId ?? null, tabs: this.list.filter((t) => t.textId).map((t) => (t.key === this.activeKey ? { textId: t.textId, title: doc.title, view: settings.view, focusId: doc.focusId } : { textId: t.textId, title: t.title, view: t.view, focusId: t.focusId })) };
            try {
                localStorage.setItem(REMEMBER_TABS, JSON.stringify(data));
            } catch {
                // storage is blocked: nothing is remembered
            }
        });
    }

    /** @param {string} message */
    notify = (message) => {
        this.notice = message;
        clearTimeout(this.noticeTimer);
        this.noticeTimer = setTimeout(() => (this.notice = ''), 5000);
    };

    /** @param {Partial<Tab>} [from] @returns {Tab} */
    create = (from = {}) => {
        return { key: crypto.randomUUID(), textId: null, title: 'Untitled', view: this.monocle.settings.view, focusId: null, items: null, history: null, lastSaved: '', authors: [], publicized: false, rallyStyle: null, markdown: false, pendingDetails: [], lastActive: 0, standing: newStanding(), ...from };
    };

    /** an empty tab: its content is the empty-state tree @returns {Tab} */
    blank = () => this.create({ items: [], history: new History() });

    /** Change a tab's record (records are replaced, not mutated, so the strip notices). @param {string} key @param {Partial<Tab>} patch */
    patch = (key, patch) => {
        this.list = this.list.map((t) => (t.key === key ? { ...t, ...patch } : t));
    };

    /** File the page's live state away in the active tab's record. */
    captureActive = () => {
        const { doc, settings } = this.monocle;
        if (this.activeKey) this.patch(this.activeKey, { textId: doc.id, title: doc.title, authors: doc.authors, publicized: doc.publicized, standing: doc.standing, rallyStyle: doc.rallyStyle, markdown: doc.markdown, items: doc.items, history: doc.history, lastSaved: doc.lastSaved, pendingDetails: $state.snapshot(doc.pendingDetails), view: settings.view, focusId: doc.focusId });
    };

    /** Save the active tab's text and wait for it. @returns {Promise<boolean>} whether it is safe to leave the tab */
    flushActive = async () => {
        const { doc } = this.monocle;
        doc.save();
        await doc.queue;
        if (doc.newTextRequest) return false; // a new text waiting to be named: it is not saved yet
        if (doc.id && JSON.stringify(toItems($state.snapshot(doc.items))) !== doc.lastSaved) return confirm('The latest changes to this text could not be saved. Leave it anyway?');
        return true;
    };

    /** Keep only the MAX_LOADED most recently active texts in memory: drop the content of the rest (never one with unsaved changes). */
    enforceLoadLimit = () => {
        const keep = new Set(
            this.list
                .filter((t) => t.textId && (t.key === this.activeKey || t.items !== null))
                .sort((a, b) => (b.key === this.activeKey ? Infinity : b.lastActive) - (a.key === this.activeKey ? Infinity : a.lastActive))
                .slice(0, MAX_LOADED)
                .map((t) => t.key)
        );
        this.list = this.list.map((t) => (t.textId && t.items !== null && !keep.has(t.key) && !isDirty(t) ? { ...t, items: null, history: null, pendingDetails: [] } : t));
    };

    /** A text changed on the server: a tab holding it (not the active one, and with nothing unsaved) drops its content, to reload.
     * @param {string | undefined} textId */
    deload = (textId) => {
        this.list = this.list.map((t) => (t.key !== this.activeKey && t.textId === textId && !isDirty(t) ? { ...t, items: null, history: null } : t));
    };

    /** Put a tab's own settings in the page (the text itself is already there). @param {Tab} t */
    applySettings = (t) => {
        const { doc, settings, edits, rally, seeding } = this.monocle;
        settings.view = t.view;
        doc.focusId = t.focusId;
        doc.startEditId = null;
        edits.fresh.clear();
        rally.reset();
        seeding.step = 'idle';
        doc.visibility = '';
        settings.useChosenMode();
        replaceState(t.textId ? `/exejeeze?text=${t.textId}` : '/exejeeze?new', {});
    };

    /**
     * Make a tab the active one: the open text is saved first, a deloaded tab is read from the database again, and the least recently
     * active texts beyond MAX_LOADED are deloaded.
     * @param {string} key
     * @param {{ closing?: boolean }} [opts] closing: the tab that was active has just been removed (nothing of it to save or file away)
     * @returns {Promise<boolean>} whether it is open now
     */
    activate = async (key, { closing = false } = {}) => {
        const { doc } = this.monocle;
        const target = this.list.find((t) => t.key === key);
        if (!target || this.switching || (key === this.activeKey && !closing)) return false;
        this.switching = true;
        try {
            if (!closing && !(await this.flushActive())) return false;
            /** @type {any} */
            let saved = null;
            if (target.items === null && target.textId) {
                try {
                    saved = await fetchSaved(target.textId);
                } catch (err) {
                    console.warn('Could not load the text', err);
                    if (/** @type {any} */ (err).status === 404) {
                        this.list = this.list.filter((t) => t.key !== key); // the text is gone
                        this.notify('That text no longer exists.');
                    } else this.notify('Could not load that text.');
                    return false;
                }
            }
            if (!closing) this.captureActive();
            this.activeKey = key;
            this.patch(key, { lastActive: ++this.clock });
            if (saved) doc.apply(saved);
            else {
                const items = /** @type {any[]} */ (target.items);
                doc.id = target.textId;
                doc.title = target.title;
                doc.authors = target.authors;
                doc.publicized = target.publicized;
                doc.standing = target.standing;
                doc.rallyStyle = target.rallyStyle;
                doc.markdown = target.markdown;
                doc.pendingDetails = target.pendingDetails;
                doc.lastSaved = target.lastSaved;
                doc.items = items;
                doc.history = target.history ?? new History();
            }
            this.applySettings(target);
            this.enforceLoadLimit();
            return true;
        } finally {
            this.switching = false;
        }
    };

    /** The + : a new, empty tab (it shows the tree of buttons to seed or load a text). */
    add = async () => {
        const blank = this.list.find((t) => !t.textId && t.items?.length === 0);
        if (blank) return void (await this.activate(blank.key));
        if (this.list.length >= MAX_TABS) return this.notify(`Ten tabs are open, the most there can be. Close one to open another.`);
        const t = this.blank();
        this.list = [...this.list, t];
        if (!(await this.activate(t.key))) this.list = this.list.filter((x) => x.key !== t.key);
    };

    /** Close a tab. The text stays saved; closing the last one leaves an empty tab. @param {string} key */
    close = async (key) => {
        if (this.switching) return;
        const t = this.list.find((x) => x.key === key);
        if (!t) return;
        if (key === this.activeKey) {
            if (!(await this.flushActive())) return;
        } else if (isDirty(t) && !confirm('This text has changes that could not be saved. Close it anyway?')) return;
        this.remove(key);
    };

    /** Take a tab out of the strip and open its neighbour (the most recently active one), or an empty tab if it was the last. @param {string} key */
    remove = async (key) => {
        const wasActive = key === this.activeKey;
        const rest = this.list.filter((x) => x.key !== key);
        this.list = rest;
        if (!wasActive) return;
        this.activeKey = null;
        const next = [...rest].sort((a, b) => b.lastActive - a.lastActive)[0] ?? this.blank();
        if (!rest.length) this.list = [next];
        if (!(await this.activate(next.key, { closing: true })) && !this.list.find((x) => x.key === next.key)) await this.add();
    };

    /** the stored tabs: which texts were open, with each one's view and focus, and which was active */
    readStored = () => {
        try {
            const raw = localStorage.getItem(REMEMBER_TABS);
            const saved = JSON.parse(raw ?? '{}');
            const list = Array.isArray(saved.tabs) ? saved.tabs.filter((/** @type {any} */ t) => t && typeof t.textId === 'string') : [];
            return { tabs: /** @type {{ textId: string, title?: string, view?: string, focusId?: string | null }[]} */ (list), active: typeof saved.active === 'string' ? saved.active : null, /** whether tabs were ever remembered (if so, an empty list means they were all closed on purpose) */ known: raw !== null };
        } catch {
            return { tabs: [], active: null, known: false };
        }
    };

    /** Open the tabs left open last time (deloaded), then the one asked for: ?text=<id> (from the profile page), ?new, or the one that was active. */
    restore = async () => {
        const { doc, settings } = this.monocle;
        const params = new URLSearchParams(location.search);
        /** @type {any[]} */
        let texts = [];
        try {
            texts = await (await fetch('/api/texts')).json();
        } catch (err) {
            console.warn('Could not load the saved texts', err);
        }
        const byId = new Map(texts.map((t) => [t.id, t]));
        const stored = this.readStored();
        this.list = stored.tabs
            // (someone else's text is not in the user's list: opening its tab asks whether it may still be read)
            .filter((s, i) => stored.tabs.findIndex((x) => x.textId === s.textId) === i)
            .slice(0, MAX_TABS)
            .map((s) => this.create({ textId: s.textId, title: byId.get(s.textId)?.title ?? s.title ?? '', view: VIEWS.includes(/** @type {any} */ (s.view)) ? /** @type {any} */ (s.view) : settings.view, focusId: s.focusId ?? null }));

        const startNew = params.has('new');
        const wanted = params.get('text') ?? (startNew ? null : (stored.active ?? (stored.known ? null : rememberedText())));
        /** @type {Tab | undefined} */
        let pick = wanted ? this.list.find((t) => t.textId === wanted) : undefined;
        if (!pick && wanted) {
            if (this.list.length < MAX_TABS) this.list = [...this.list, (pick = this.create({ textId: wanted, title: byId.get(wanted)?.title ?? '' }))];
            else this.notify('Ten tabs are open, the most there can be. Close one to open another text.');
        }
        if (!pick && startNew && this.list.length < MAX_TABS) this.list = [...this.list, (pick = this.blank())];
        if (!pick && !startNew && !stored.known && !this.list.length && texts.length) this.list = [(pick = this.create({ textId: texts[0].id, title: texts[0].title }))];
        pick ??= this.list.find((t) => t.textId === stored.active) ?? this.list[0];
        if (pick && (await this.activate(pick.key))) return;
        if (pick) this.list = this.list.filter((t) => t.key !== pick.key);

        // nothing could be opened: an empty tab (and, TEMPORARILY, with nothing saved yet, Dissertation.md from the gitignored assets)
        const blank = this.blank();
        this.list = [...this.list, blank];
        await this.activate(blank.key);
        const load = texts.length ? undefined : Object.values(dissertationFiles)[0];
        if (load) {
            const list = splitParagraphs(cleanMarkdown(/** @type {string} */ (await load())));
            const hasHeaders = list.some((p) => p.level > 0);
            doc.title = 'Dissertation';
            doc.markdown = true;
            doc.items = (hasHeaders && list[0]?.level === 0 ? withFrontmatter(list) : list).map((p, i) => ({ ...p, originalIndex: i }));
        }
    };

    /** Open a saved text in a tab: its own tab if it is open already, else a new one (an empty tab that is showing is used up). @param {string} id */
    openText = async (id) => {
        const { doc } = this.monocle;
        const open = this.list.find((t) => t.textId === id);
        if (open) return void (await this.activate(open.key));
        const blank = this.list.find((t) => t.key === this.activeKey && !t.textId && !doc.items.length);
        if (this.list.length >= MAX_TABS && !blank) {
            replaceState(doc.id ? `/exejeeze?text=${doc.id}` : '/exejeeze?new', {}); // the link was not followed
            return this.notify('Ten tabs are open, the most there can be. Close one to open another text.');
        }
        const t = this.create({ textId: id, title: '' });
        this.list = [...this.list, t];
        if (await this.activate(t.key)) {
            if (blank) this.list = this.list.filter((x) => x.key !== blank.key);
        } else this.list = this.list.filter((x) => x.key !== t.key);
    };
}
