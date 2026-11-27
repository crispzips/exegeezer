import { tick } from 'svelte';
import { cleanMarkdown } from '#lib/utilities/cleanMarkdown.js';
import { splitParagraphs } from '#lib/utilities/splitParagraphs.js';
import { withoutMatter, matterSections } from '#lib/utilities/matter.js';
import { danglingCount, insertAt } from '#lib/utilities/editText.js';
import { toItems, withFrontmatter } from './items.js';

/** a frame is painted and the event loop has had a turn: the overlay is on screen and input has been handled before heavy work starts */
// (animation frames pause while the tab is hidden, so a short timer stands in for the frame and the work never waits on one)
export const breathe = () => new Promise((done) => {
    const wake = () => setTimeout(done, 0);
    const fallback = setTimeout(wake, 120);
    requestAnimationFrame(() => { clearTimeout(fallback); wake(); });
});

/** The Load Text modal: the text waiting in its preview, where it came from, and injecting it into the main text. */
export class LoadText {
    /** @type {{ name: string, text: string }[]} */
    uploadedfiles = $state([]);
    /** the text in the preview
     * @type {{ id: string, originalIndex: number, text: string, level: number }[]} */
    paragraphs = $state([]);
    /** where the text in the preview came from: this computer, another exegeezer, or the user's own texts
     * @type {'computer' | 'others' | 'own' | 'web'} */
    source = $state('computer');
    /** what to tell the user about the text loaded from an open library (e.g. that it was machine-scanned)
     * @type {string[]} */
    notes = $state([]);
    /** where the text in the preview came from and its rights: one entry per work (from an open library, or kept by an own text that was itself imported)
     * @type {Record<string, string>[]} */
    details = $state([]);
    /** the loaded file's name without its extension (names the new text and the ORIGINAL-- copy) */
    name = $state('');
    /** the import question: keep an unaltered copy of the incoming text in the user's own texts (as `ORIGINAL--<name>`)? */
    keepCopy = $state(false);
    /** what the busy overlay says while a big text is being prepared or shown ('' = no overlay) */
    busyLabel = $state('');
    ownTextsOpen = $state(false);
    openSourcesOpen = $state(false);
    /** whether the text loaded in the preview is Markdown */
    previewMarkdown = $state(false);
    /** the section the map is hovered over: the preview jumps to it
     * @type {string | null} */
    previewSpot = $state(null);
    /** where the next injection from the modal goes (a gap in the main text), or null for the usual choice
     * @type {number | null} */
    injectGap = $state(null);
    /** the modal was opened by seeding (a new text from an existing one): its button seeds a text instead of injecting into this one */
    forSeeding = $state(false);
    /** whether the Prepend / Append / Replace menu is open */
    injectOpen = $state(false);
    /** @type {HTMLDivElement | undefined} */
    injectMenu = $state.raw();
    /** @type {HTMLDialogElement | undefined} */
    dialog = $state.raw();

    /** the preview as the linear view shows it: front and back matter (the Frontmatter section above all) are folded into bubbles above and below the text */
    previewShown = $derived(withoutMatter(this.paragraphs));
    previewMatter = $derived(matterSections(this.paragraphs));
    /** whether the loaded text has sections to mark as front or back matter (the preview then has the map beside it) */
    previewHasSections = $derived(this.paragraphs.some((p) => p.level > 0));

    /** @param {import('./monocle.svelte.js').Monocle} monocle */
    constructor(monocle) {
        this.monocle = monocle;
    }

    /**
     * Run a heavy step behind the rain overlay. The browser gets to paint the overlay first, and to catch up again once the work
     * (and the rendering it triggers) is done, so a big text doesn't leave the page looking frozen.
     * @template T
     * @param {string} label @param {() => T | Promise<T>} work @returns {Promise<T | undefined>}
     */
    behindRain = async (label, work) => {
        this.busyLabel = label;
        try {
            await breathe();
            const result = await work();
            await tick(); // the DOM for what was just set
            await breathe();
            return result;
        } finally {
            this.busyLabel = '';
        }
    };

    /** Runs after a file is loaded: split the newest file into paragraphs */
    onFileLoaded = () => {
        const latest = this.uploadedfiles[this.uploadedfiles.length - 1];
        if (latest) void this.behindRain('Preparing the text…', () => {
            this.source = 'computer';
            this.notes = [];
            this.details = [];
            this.name = latest.name.replace(/\.[^.]+$/, '');
            // Markdown: drop the table of contents and its {#anchor} header links first
            const isMarkdown = /\.(md|markdown)$/i.test(latest.name);
            this.previewMarkdown = isMarkdown;
            this.paragraphs = splitParagraphs(isMarkdown ? cleanMarkdown(latest.text) : latest.text);
            this.show();
            // Text above the first header goes into a Frontmatter section, marked as front matter to begin with
            // (the map beside the preview is where front and back matter are chosen)
            if (this.paragraphs.some((p) => p.level > 0) && this.paragraphs[0].level === 0) this.paragraphs = withFrontmatter(this.paragraphs);
        });
    };

    /** A text chosen in the "Open Libraries" modal becomes the text in the preview.
     * @param {{ title: string, markdown: string, details: Record<string, string>[], notes: string[] }} t */
    onWebTextChosen = (t) => {
        void this.behindRain('Preparing the text…', () => {
            this.source = 'web';
            this.name = t.title;
            this.notes = t.notes ?? [];
            this.details = t.details ?? [];
            this.previewMarkdown = true;
            this.paragraphs = splitParagraphs(cleanMarkdown(t.markdown));
            this.show();
            // as with a file: text above the first header goes into a Frontmatter section
            if (this.paragraphs.some((p) => p.level > 0) && this.paragraphs[0].level === 0) this.paragraphs = withFrontmatter(this.paragraphs);
        });
    };

    /** One of the user's own texts, chosen in the "From Your Texts" modal, becomes the text in the preview.
     * @param {{ id?: string, title: string, items: any[], importedDetails?: Record<string, string>[] }} saved */
    onOwnTextChosen = (saved) => {
        // "Load a text" with nothing open (not seeding): the text itself opens, in a tab
        if (this.monocle.doc.noText && !this.forSeeding && /** @type {any} */ (saved).id) return void this.monocle.tabs.openText(/** @type {any} */ (saved).id);
        this.source = 'own';
        this.name = saved.title;
        this.notes = [];
        this.details = saved.importedDetails ?? []; // the rights follow the content
        this.previewMarkdown = saved.items.some((p) => p.level > 0);
        // fresh ids, so the preview shares nothing with the text it came from
        this.paragraphs = saved.items.map((p, i) => ({ ...p, id: crypto.randomUUID(), originalIndex: i }));
        this.show();
    };

    /** Front and back matter, chosen on the map beside the preview. @param {{ front: string[], back: string[] }} choice */
    applyMatter = ({ front, back }) => {
        this.paragraphs = this.paragraphs.map((p) => (p.level > 0 ? { ...p, frontmatter: front.includes(p.id), backmatter: back.includes(p.id) } : p));
    };

    /** a choice made again starts the loading over: nothing left from an earlier try waits in the modal */
    clearLoaded = () => {
        this.injectGap = null;
        this.paragraphs = [];
        this.uploadedfiles = [];
    };

    /** the modal, opened when a text has been chosen in the tree of buttons (the pickers open over the tree; this one shows what they chose) */
    show = () => {
        if (this.dialog && !this.dialog.open) this.dialog.showModal();
    };

    /** The menu's Load text button. */
    open = () => {
        this.forSeeding = false;
        if (!this.monocle.authed || this.monocle.settings.commenting) return;
        this.injectGap = null;
        this.dialog?.showModal();
    };

    /** Open the modal to inject what is loaded at a gap in the main text. @param {number} gap */
    openAtGap = (gap) => {
        this.injectGap = gap;
        this.dialog?.showModal();
    };

    /** @param {MouseEvent} e */
    onDialogClick = (e) => {
        // A click on the dialog element itself (not its contents) is a backdrop click
        // with a drop-down open, a click outside only closes the drop-down (the window's click handler does that)
        if (e.target === this.dialog && !this.injectOpen) this.dialog?.close();
    };

    /** @param {MouseEvent} e */
    onWindowClick = (e) => {
        if (this.injectOpen && this.injectMenu && !this.injectMenu.contains(/** @type {Node} */ (e.target))) this.injectOpen = false;
    };

    onClosed = () => {
        this.forSeeding = false;
        this.monocle.seeding.source = '';
        this.previewSpot = null;
        this.injectOpen = false;
        this.injectGap = null;
    };

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
    inject = async (where) => {
        const { doc } = this.monocle;
        if (this.paragraphs.length === 0) return;
        if (this.keepCopy && this.source !== 'own') {
            try {
                await this.saveOriginalCopy();
            } catch (err) {
                console.warn('Could not save the original copy', err);
                if (!confirm('The original copy could not be saved. Import the text anyway?')) return;
            }
        }
        const replacing = this.injectGap === null && (doc.items.length === 0 || where === 'replace');
        // one of the user's own texts only ever brings its body: it goes into the current text, which keeps its title and settings
        const makesNewText = replacing && (this.source !== 'own' || doc.noText); // (with no text open there is nothing for an own text's body to go into: it makes the new text)
        // Copy with fresh ids so keys stay unique if the same text is injected twice
        const added = this.paragraphs.map((/** @type {any} */ p) => ({ id: crypto.randomUUID(), originalIndex: 0, text: p.text, level: p.level, ...(p.frontmatter ? { frontmatter: true } : {}), ...(p.backmatter ? { backmatter: true } : {}), ...(p.title ? { title: p.title } : {}), ...(p.description ? { description: p.description } : {}) }));
        let combined =
            this.injectGap !== null
                ? insertAt(doc.items, this.injectGap, added)
                : doc.items.length === 0 || where === 'replace'
                  ? added
                  : where === 'prepend'
                    ? [...added, ...doc.items]
                    : [...doc.items, ...added];
        // text above the first header goes into a Frontmatter section; a text with no headers at all stays as it is
        if (combined[0] && (combined[0].level ?? 0) === 0 && combined.some((p) => (p.level ?? 0) > 0) && danglingCount(combined) > (replacing ? 0 : danglingCount(doc.items))) {
            combined = withFrontmatter(combined);
        }
        // the rights and publication details of what came in are saved with the text (a new text starts with just these)
        doc.pendingDetails = makesNewText ? [...this.details] : [...doc.pendingDetails, ...this.details];
        if (makesNewText) {
            // a new text: saved under the incoming file's name on the next autosave
            doc.id = null;
            doc.visibility = ''; // asked again for the new text
            doc.title = this.name || 'Untitled';
            doc.lastSaved = '';
        }
        doc.commit(combined.map((p, i) => ({ ...p, originalIndex: i })));
        if (this.previewMarkdown) doc.markdown = true;
        this.keepCopy = false; // asked afresh for every import

        // Reset the load pane: drop the loaded text and close the modal
        this.paragraphs = [];
        this.details = [];
        this.uploadedfiles = [];
        this.dialog?.close();
    };

    /** Save the loaded text, unaltered, as a text of its own named `ORIGINAL--<file name>` (fresh ids, so it shares nothing with the working text). */
    saveOriginalCopy = async () => {
        const items = toItems(this.paragraphs.map((/** @type {any} */ p) => ({ ...p, id: crypto.randomUUID() })));
        const res = await fetch('/api/texts', {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify({ title: `ORIGINAL--${this.name}`, visibility: 'private', items, importedDetails: $state.snapshot(this.details) })
        });
        if (!res.ok) throw new Error(`${res.status}`);
    };
}
