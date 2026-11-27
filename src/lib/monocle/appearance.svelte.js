import { untrack } from 'svelte';

// ---- Text appearance, in every view: size, line spacing, letter spacing, side margins, paragraph spacing ----
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

/** the settings in the order the menu offers them */
export const APPEARANCE = /** @type {const} */ ([
    { id: 'size', label: 'Font size', steps: SIZE_STEPS },
    { id: 'line', label: 'Line spacing', steps: LINE_STEPS },
    { id: 'letter', label: 'Kerning', steps: LETTER_STEPS },
    { id: 'side', label: 'Side margins', steps: MARGIN_STEPS },
    { id: 'para', label: 'Paragraph spacing', steps: PARA_STEPS }
]);

export class Appearance {
    sizeStep = $state(DEFAULT_SIZE_STEP);
    lineStep = $state(DEFAULT_LINE);
    letterStep = $state(DEFAULT_LETTER);
    sideStep = $state(DEFAULT_MARGIN);
    paraStep = $state(DEFAULT_PARA);
    /** the appearance menu: whether its submenu is open, and which slider is showing */
    menuOpen = $state(false);
    /** @type {'size' | 'line' | 'letter' | 'side' | 'para' | null} */
    slider = $state(null);
    /** the appearance as it was when this text was opened in the viewer: what the revert button goes back to
     * @type {{ size: number, line: number, letter: number, side: number, para: number } | null} */
    atOpen = null;

    /** the appearance settings apply in every mode, but not in the rally view */
    on = $derived(this.monocle.settings.view !== 'rally');
    /** the settings reach the views as CSS variables, which app.css turns into sizes and spacing */
    style = $derived(`--ta-size: ${SIZE_STEPS[this.sizeStep]}; --ta-lh: ${LINE_STEPS[this.lineStep]}; --ta-ls: ${LETTER_STEPS[this.letterStep]}em; --ta-mxp: ${(((MARGIN_STEPS[this.sideStep] - 0.12) / 0.76) * 100).toFixed(3)}%; --ta-mx: ${(Math.max(0, MARGIN_STEPS[this.sideStep] - 0.12) * 20).toFixed(3)}rem; --ta-ps: ${PARA_STEPS[this.paraStep]}rem`);
    lineChanged = $derived(this.lineStep !== DEFAULT_LINE);
    paraChanged = $derived(this.paraStep !== DEFAULT_PARA);

    /** @param {import('./monocle.svelte.js').Monocle} monocle */
    constructor(monocle) {
        this.monocle = monocle;

        $effect(() => {
            void this.monocle.doc.id;
            if (!this.monocle.settings.restored) return;
            untrack(() => (this.atOpen = { size: this.sizeStep, line: this.lineStep, letter: this.letterStep, side: this.sideStep, para: this.paraStep }));
        });
    }

    /** @param {string} id */
    step = (id) => (id === 'size' ? this.sizeStep : id === 'line' ? this.lineStep : id === 'letter' ? this.letterStep : id === 'para' ? this.paraStep : this.sideStep);

    /** @param {string} id @param {number} v */
    setStep = (id, v) => {
        if (id === 'size') this.sizeStep = v;
        else if (id === 'line') this.lineStep = v;
        else if (id === 'letter') this.letterStep = v;
        else if (id === 'para') this.paraStep = v;
        else this.sideStep = v;
    };

    reset = () => {
        this.sizeStep = this.atOpen?.size ?? DEFAULT_SIZE_STEP;
        this.lineStep = this.atOpen?.line ?? DEFAULT_LINE;
        this.letterStep = this.atOpen?.letter ?? DEFAULT_LETTER;
        this.sideStep = this.atOpen?.side ?? DEFAULT_MARGIN;
        this.paraStep = this.atOpen?.para ?? DEFAULT_PARA;
    };

    /** the values to remember */
    stored = () => ({ size: SIZE_STEPS[this.sizeStep], line: LINE_STEPS[this.lineStep], letter: LETTER_STEPS[this.letterStep], side: MARGIN_STEPS[this.sideStep], para: PARA_STEPS[this.paraStep] });

    /** @param {Record<string, unknown>} look remembered values */
    restore = (look) => {
        const at = (/** @type {number[]} */ list, /** @type {unknown} */ v, /** @type {number} */ d) => (list.indexOf(/** @type {number} */ (v)) >= 0 ? list.indexOf(/** @type {number} */ (v)) : d);
        this.sizeStep = at(SIZE_STEPS, look.size, DEFAULT_SIZE_STEP);
        this.lineStep = at(LINE_STEPS, look.line, DEFAULT_LINE);
        this.letterStep = at(LETTER_STEPS, look.letter, DEFAULT_LETTER);
        this.sideStep = at(MARGIN_STEPS, look.side, DEFAULT_MARGIN);
        this.paraStep = at(PARA_STEPS, look.para, DEFAULT_PARA);
    };
}
