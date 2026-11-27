import { onMount } from 'svelte';
import { emphasis } from '#lib/emphasis.svelte.js';
import { READ_WPM, SIZES, DEFAULT_SIZE } from '#lib/utilities/rallyChunks.js';

/** @typedef {'linear' | 'hierarchical' | 'cascading' | 'rally'} View */
/** @typedef {'reading' | 'writing' | 'commenting'} Mode */

/** @type {View[]} */
export const VIEWS = ['linear', 'hierarchical', 'cascading', 'rally'];
/** reading (default), editing, or commenting (the toggle's order)
 * @type {Mode[]} */
const MODES = ['reading', 'writing', 'commenting'];
/** the linear view's zoom steps */
export const ZOOMS = [0.75, 0.875, 1, 1.25, 1.5, 2];
// ---- Remembered across refreshes and visits to other pages: the view, the mode and each view's settings ----
const REMEMBER = 'exegeezer.editor';

/** The view, the mode and each view's settings, and remembering them. */
export class Settings {
    /** @type {View} */
    view = $state('linear');
    /** @type {Mode} */
    mode = $state('reading');
    /** the mode the user chose (the mode itself is also forced by having no text or no sign-in, which is not their choice)
     * @type {Mode} */
    chosenMode = $state('reading');
    /** set once the saved settings have been read, so the defaults are not saved over them */
    restored = $state(false);
    /** cascading view only: every section open at once, zoomed all the way out, colours only */
    exploded = $state(false);
    /** linear view only: whether the comments are to the left of the text */
    commentsLeft = $state(false);
    /** linear view only: the text's zoom (a step of ZOOMS) and whether its slider is showing */
    zoomStep = $state(2);
    zoomOpen = $state(false);
    // rally view's settings: text size step and speed tick (unlabelled; ranges set in rallyChunks.js)
    rallySize = $state(DEFAULT_SIZE);
    rallySpeed = $state(6);
    /** the menu's rally text size and speed sliders: each is revealed by its icon */
    sizeOpen = $state(false);
    speedOpen = $state(false);

    /** whether the text can be changed (writing mode) */
    editing = $derived(this.mode === 'writing');
    commenting = $derived(this.mode === 'commenting');
    /** the mode button is locked when there is no text (editing only) or nobody is signed in (reading only) */
    modeLocked = $derived(this.monocle.doc.noText || !this.monocle.authed);

    /** @param {import('./monocle.svelte.js').Monocle} monocle */
    constructor(monocle) {
        this.monocle = monocle;

        // nothing loaded: the app can only be in writing mode (so there is a way to start a text)
        $effect(() => {
            if (this.monocle.doc.noText) this.mode = 'writing';
            else if (!this.monocle.authed || (this.monocle.doc.publicized && this.mode === 'writing')) this.mode = 'reading';
        });

        onMount(this.restore);

        $effect(() => {
            const settings = { view: this.view, mode: this.chosenMode, exploded: this.exploded, commentsLeft: this.commentsLeft, zoom: ZOOMS[this.zoomStep], appearance: this.monocle.appearance.stored(), rallySizeRem: SIZES[this.rallySize], rallySpeed: this.rallySpeed, emphasizeFirst: emphasis.first };
            if (!this.restored) return;
            try {
                localStorage.setItem(REMEMBER, JSON.stringify(settings));
            } catch {
                // storage is blocked: nothing is remembered
            }
        });
    }

    restore = () => {
        try {
            const saved = JSON.parse(localStorage.getItem(REMEMBER) ?? '{}');
            if (VIEWS.includes(saved.view)) this.view = saved.view;
            if (MODES.includes(saved.mode)) {
                this.chosenMode = saved.mode;
                if (this.monocle.authed) this.mode = saved.mode;
            }
            if (typeof saved.exploded === 'boolean') this.exploded = saved.exploded;
            if (typeof saved.commentsLeft === 'boolean') this.commentsLeft = saved.commentsLeft;
            const z = ZOOMS.indexOf(saved.zoom);
            this.monocle.appearance.restore(saved.appearance ?? {});
            if (z >= 0) this.zoomStep = z;
            // the size is remembered as rem (not as a step), so changing the scale never moves it; an older step-only setting is dropped
            const found = SIZES.indexOf(saved.rallySizeRem);
            if (found >= 0) this.rallySize = found;
            if (typeof saved.emphasizeFirst === 'boolean') emphasis.first = saved.emphasizeFirst;
            if (Number.isInteger(saved.rallySpeed) && saved.rallySpeed >= 0 && saved.rallySpeed < READ_WPM.length) this.rallySpeed = saved.rallySpeed;
        } catch {
            // no saved settings (or storage is blocked): the defaults stand
        }
        this.restored = true;
    };

    /** Go back to the mode the user chose (a tab being opened). */
    useChosenMode = () => {
        this.mode = MODES.includes(this.chosenMode) ? this.chosenMode : 'reading';
    };

    /** the triple toggle (editing, reading, commenting): each click moves to the next mode */
    cycleMode = () => {
        if (this.modeLocked) return;
        const order = this.monocle.doc.publicized ? MODES.filter((m) => m !== 'writing') : MODES;
        this.mode = order[(order.indexOf(this.mode) + 1) % order.length];
        this.chosenMode = this.mode;
    };

    /** each click moves to the next view */
    cycleView = () => {
        this.view = VIEWS[(VIEWS.indexOf(this.view) + 1) % VIEWS.length];
    };
}
