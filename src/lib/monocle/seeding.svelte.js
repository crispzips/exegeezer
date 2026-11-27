import { toItems, withFrontmatter } from './items.js';
import { breathe } from './loadText.svelte.js';

/** The tree of round buttons shown with no text open, and seeding a new text (fresh, or from an existing one). */
export class Seeding {
    /** where the "Seed a text" button is: not clicked yet, or offering heading levels (a text begins with a section: paragraphs have to be inside sections)
     * @type {'idle' | 'choose' | 'level' | 'existing'} */
    step = $state('idle');
    /** the first choice made in the tree: Seed a text, Load a text, or none yet
     * @type {'' | 'seed' | 'load'} */
    root = $state('');
    /** the source chosen in the last layer of that tree (it opens a modal, so it stays highlighted beneath it)
     * @type {'' | 'computer' | 'own' | 'web'} */
    source = $state('');

    /**
     * The heading levels a new section may have: 1 up to one deeper than the text already goes
     * (so the first section is a heading 1 and no needless depth is created).
     * @type {number[]}
     */
    levels = $derived(
        Array.from({ length: Math.min(6, this.monocle.doc.items.reduce((deepest, p) => Math.max(deepest, p.level ?? 0), 0) + 1) }, (_, i) => i + 1)
    );

    /** @param {import('./monocle.svelte.js').Monocle} monocle */
    constructor(monocle) {
        this.monocle = monocle;

        // a picker closed without choosing a text: the button that opened it is deselected (once a text is chosen the Load Text modal takes over, and its closing deselects)
        $effect(() => {
            const { load } = this.monocle;
            if (this.source && this.source !== 'computer' && !load.ownTextsOpen && !load.openSourcesOpen && load.paragraphs.length === 0) this.source = '';
        });
        // once there is a text, the tree starts over next time
        $effect(() => {
            if (!this.monocle.doc.noText) {
                this.root = '';
                this.source = '';
                this.step = 'idle';
            }
        });
    }

    /** @param {'seed' | 'load'} root */
    chooseRoot = (root) => {
        this.root = root;
        this.step = 'idle';
        this.source = '';
        this.monocle.load.clearLoaded();
    };

    /** @param {'level' | 'existing'} step */
    chooseKind = (step) => {
        this.step = step;
        this.source = '';
        this.monocle.load.clearLoaded();
    };

    /** A file picked from this computer, to seed from. */
    pickComputer = () => {
        this.monocle.load.clearLoaded();
        this.source = 'computer';
        this.monocle.load.forSeeding = true;
    };

    /** Open the picker for your own texts or the open libraries. @param {'own' | 'web'} source @param {boolean} forSeeding */
    openPicker = (source, forSeeding) => {
        const { load } = this.monocle;
        load.clearLoaded();
        this.source = source;
        load.forSeeding = forSeeding;
        if (source === 'own') load.ownTextsOpen = true;
        else load.openSourcesOpen = true;
    };

    /**
     * Seed from the loaded text (the paragraphs in the preview): make a new text of it and open it, a draft, private until its owner says
     * otherwise. A text loaded from the user's own texts brings no title and no settings; any other is named after what was loaded.
     * As with an import, the user may first keep an unaltered `ORIGINAL--<name>` copy.
     */
    fromPreview = () => {
        const { doc, load } = this.monocle;
        if (load.paragraphs.length === 0) return;
        // the new text needs a title (and visibility) of its own: asked first, offering the loaded name
        doc.newTextRequest = { title: load.source === 'own' ? '' : load.name, run: ({ title, visibility }) => this.make(title, visibility) };
    };

    /** @param {string} title @param {string} visibility */
    make = async (title, visibility) => {
        const { load } = this.monocle;
        if (load.paragraphs.length === 0) return;
        await load.behindRain('Seeding the text…', () => this.makeNow(title, visibility));
    };

    /** @param {string} title @param {string} visibility */
    makeNow = async (title, visibility) => {
        const { doc, load } = this.monocle;
        if (load.keepCopy && load.source !== 'own') {
            try {
                await load.saveOriginalCopy();
            } catch (err) {
                console.warn('Could not save the original copy', err);
                if (!confirm('The original copy could not be saved. Seed the text anyway?')) return;
            }
        }
        try {
            let list = load.paragraphs.map((/** @type {any} */ p, /** @type {number} */ i) => ({ ...p, id: crypto.randomUUID(), originalIndex: i }));
            await breathe();
            // text above the first header goes into a Frontmatter section; a text with no headers at all stays as it is
            if (list[0] && (list[0].level ?? 0) === 0 && list.some((p) => (p.level ?? 0) > 0)) list = withFrontmatter(list);
            const body = JSON.stringify({ title, visibility, items: toItems(list), importedDetails: $state.snapshot(load.details) });
            await breathe();
            const res = await fetch('/api/texts', { method: 'POST', headers: { 'content-type': 'application/json' }, body });
            if (!res.ok) throw new Error(`${res.status}`);
            await doc.showSaved((await res.json()).id);
            this.step = 'idle';
            load.keepCopy = false;
            load.paragraphs = [];
            load.details = [];
            load.uploadedfiles = [];
            load.dialog?.close();
        } catch (err) {
            console.warn('Could not seed the text', err);
            alert('Could not seed a text from that one.');
        }
    };

    /**
     * Begin a text with one empty section.
     * @param {number} [level] its heading level
     */
    seedText = (level = 1) => {
        const { doc, edits } = this.monocle;
        this.step = 'idle';
        if (doc.commit([{ id: crypto.randomUUID(), originalIndex: 0, text: `${'#'.repeat(level)} `, level }])) {
            doc.markdown = true;
            edits.lastKind = 'section';
        }
    };
}
