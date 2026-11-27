import { TextDocument } from './document.svelte.js';
import { Tabs } from './tabs.svelte.js';
import { Editing } from './editing.svelte.js';
import { LoadText } from './loadText.svelte.js';
import { Seeding } from './seeding.svelte.js';
import { Commenting } from './commenting.svelte.js';
import { Settings } from './settings.svelte.js';
import { Appearance } from './appearance.svelte.js';
import { Rally } from './rally.svelte.js';
import { WholeText } from './wholeText.svelte.js';

/**
 * The Monocle (the `/exejeeze` page): everything it holds and does, in parts that reach one another through this object.
 * Make it while the page component is being set up: the parts register effects, which run in the order they are made.
 */
export class Monocle {
    /** @type {() => { user?: { name?: string } | null }} */
    #data;

    /** @param {() => { user?: { name?: string } | null }} data the layout's data: `user` is the signed-in user, or null
     * (then the app shows the example text and nothing else works) */
    constructor(data) {
        this.#data = data;
        /** the open text, its undo history and its saving */
        this.doc = new TextDocument();
        /** the tab strip and restoring the page */
        this.tabs = new Tabs(this);
        /** changes made to the text in the views and the map */
        this.edits = new Editing(this);
        /** the Load Text modal */
        this.load = new LoadText(this);
        /** the tree of buttons shown with no text open, and seeding a new text */
        this.seeding = new Seeding(this);
        /** picking, writing and showing comments */
        this.commenting = new Commenting(this);
        /** the view, the mode and what is remembered about them */
        this.settings = new Settings(this);
        /** text appearance */
        this.appearance = new Appearance(this);
        /** the rally view */
        this.rally = new Rally(this);
        /** the whole-text menu: settings, duplicate, delete, wipe */
        this.whole = new WholeText(this);
    }

    get authed() {
        return !!this.#data().user;
    }

    get userName() {
        return this.#data().user?.name ?? '';
    }
}
