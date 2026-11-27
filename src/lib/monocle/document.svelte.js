import { replaceState } from '$app/navigation';
import { History } from '#lib/utilities/history.svelte.js';
import { withoutMatter, matterSections } from '#lib/utilities/matter.js';
import { danglingCount } from '#lib/utilities/editText.js';
import { toItems } from './items.js';

// ---- The open text is remembered, so a refresh (or coming back by the menu) returns to it ----
const REMEMBER_TEXT = 'exegeezer.text';
export function rememberedText() {
    try {
        return localStorage.getItem(REMEMBER_TEXT);
    } catch {
        return null;
    }
}

/** Fetch a saved text from the database. @param {string} id */
export async function fetchSaved(id) {
    const res = await fetch(`/api/texts/${id}`);
    if (!res.ok) throw Object.assign(new Error(`${res.status}`), { status: res.status });
    return res.json();
}

/** The text the page shows (the active tab's), its undo history, and saving it: the main text lives in the database. */
export class TextDocument {
    /** The main text shown in the main pane
     * @type {{ id: string, originalIndex: number, text: string, level: number }[]} */
    items = $state([]);
    /** one step per edit; kept for the whole session (not reset by changing mode)
     * @type {History<any>} */
    history = $state.raw(new History());
    /** id of the saved text the main pane shows (null until it has been saved once)
     * @type {string | null} */
    id = $state(null);
    title = $state('Untitled');
    /** the names the loaded text is by (empty: none shown)
     * @type {string[]} */
    authors = $state([]);
    /** 'private' | 'public', chosen in the new-text dialog before a text is first saved */
    visibility = '';
    /** the loaded text is published and public: it can't be altered, so there is no writing mode */
    publicized = $state(false);
    /** the loaded text's default rally type (null: it has none yet, so the rally's setup is offered) */
    rallyStyle = $state(/** @type {string | null} */ (null));
    /** whether the main text is Markdown, so the linear view renders it */
    markdown = $state(false);
    /** imported details waiting to be saved with the main text (the next autosave sends them)
     * @type {Record<string, string>[]} */
    pendingDetails = $state([]);
    /** @type {{ title: string, run: (v: { title: string, visibility: string }) => void } | null} */
    newTextRequest = $state(null);
    /** something waiting to be confirmed before it is deleted
     * @type {{ title: string, message: string, confirm: string, run: () => void } | null} */
    deleteRequest = $state(null);
    /** autosave starts once the saved text (if any) has been loaded */
    ready = $state(false);
    /** the paragraph or section last focused or clicked in any view (or by a minimap): every view opens centred on it
     * @type {string | null} */
    focusId = $state(null);
    /** a just-injected empty paragraph the view should start editing at once (its body field, or a section's title), or null
     * @type {string | null} */
    startEditId = $state(null);
    /** the list last loaded or saved, as JSON, so an unchanged text is not saved again */
    lastSaved = '';
    /** saves run one after another */
    queue = Promise.resolve();

    /** the text as the views show it: front and back matter stay in the data but are never drawn or compared */
    shown = $derived(withoutMatter(this.items));
    /** front and back matter, kept apart: the linear and hierarchical views offer them collapsed */
    matter = $derived(matterSections(this.items));
    /** nothing loaded */
    noText = $derived(this.ready && this.items.length === 0);

    constructor() {
        $effect(() => {
            const id = this.id;
            if (!id) return;
            try {
                localStorage.setItem(REMEMBER_TEXT, id);
            } catch {
                // storage is blocked: nothing is remembered
            }
        });

        // Save shortly after the text stops changing
        $effect(() => {
            if (!this.ready) return;
            void JSON.stringify(this.items); // depend on every paragraph
            const timer = setTimeout(this.save, 800);
            return () => clearTimeout(timer);
        });
    }

    /** Replace what the main pane shows with a saved text. @param {string} id */
    showSaved = async (id) => {
        this.apply(await fetchSaved(id));
    };

    /** Make a fetched saved text the one in the main pane. @param {any} saved */
    apply = (saved) => {
        this.pendingDetails = []; // those belonged to the text that was showing
        this.id = saved.id;
        this.markdown = saved.items.some((/** @type {any} */ p) => p.level > 0);
        this.title = saved.title;
        this.rallyStyle = saved.rallyStyle ?? null;
        this.publicized = !!saved.publicized;
        this.authors = saved.authors ?? [];
        this.items = saved.items.map((/** @type {any} */ p, /** @type {number} */ i) => ({ ...p, originalIndex: i }));
        this.lastSaved = JSON.stringify(toItems(this.items));
        this.history = new History();
        this.focusId = null;
        this.startEditId = null;
        replaceState(`/exejeeze?text=${saved.id}`, {});
    };

    /** Save the main text: create it the first time, replace its contents afterwards. */
    save = () => {
        const items = toItems($state.snapshot(this.items));
        const json = JSON.stringify(items);
        if (json === this.lastSaved || (!items.length && !this.id)) return;
        if (!this.id && !this.visibility) {
            // a new text: ask for its name and visibility first, then save
            if (!this.newTextRequest) {
                this.newTextRequest = {
                    title: this.title,
                    run: ({ title, visibility }) => {
                        this.title = title;
                        this.visibility = visibility;
                        this.save();
                    }
                };
            }
            return;
        }
        this.queue = this.queue.then(async () => {
            const details = $state.snapshot(this.pendingDetails);
            try {
                const res = this.id
                    ? await fetch(`/api/texts/${this.id}`, { method: 'PUT', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ items, addImportedDetails: details }) })
                    : await fetch('/api/texts', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ title: this.title, visibility: this.visibility, items, importedDetails: details }) });
                if (!res.ok) throw new Error(`${res.status}`);
                this.pendingDetails = this.pendingDetails.slice(details.length); // saved with the text
                if (!this.id) {
                    this.id = (await res.json()).id;
                    replaceState(`/exejeeze?text=${this.id}`, {}); // so a refresh stays on it
                }
                this.lastSaved = json;
            } catch (err) {
                console.warn('Could not save the text', err);
            }
        });
    };

    /**
     * Apply an edit to the main text, remembering the text it replaces. Paragraphs have to be inside sections, in
     * every view: an edit that would leave a new paragraph dangling (above the first section) is refused.
     * @param {any[]} next
     * @returns {boolean} whether the edit was applied
     */
    commit = (next) => {
        if (danglingCount(next) > danglingCount(this.items)) {
            alert('Paragraphs have to be inside a section. Add a section first.');
            return false;
        }
        this.history.record(this.items);
        this.items = next;
        return true;
    };

    undo = () => {
        const prev = this.history.undo(this.items);
        if (prev) this.items = prev;
    };

    redo = () => {
        const next = this.history.redo(this.items);
        if (next) this.items = next;
    };
}
