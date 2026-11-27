import { untrack } from 'svelte';
import { gapIndex, insertAt } from '#lib/utilities/editText.js';

/** The rally view: starting a rally, whether it is running, and writing into the text from it. */
export class Rally {
    playing = $state(false);
    /** the rally has been started from its setup (until then the pane is empty and the setup modal offers the flag) */
    started = $state(false);
    setupOpen = $state(false);
    /** the empty paragraph a rally from nothing began with (the first thing composed goes into it)
     * @type {string | null} */
    fillId = null;
    /** and its empty section (the first section written takes its place)
     * @type {string | null} */
    headId = null;
    /** the writer opened the setup themselves (the cog), so a default rally type does not start the rally over it */
    setupAsked = false;

    /** @param {import('./monocle.svelte.js').Monocle} monocle */
    constructor(monocle) {
        this.monocle = monocle;

        // a rally can't run behind the commenting notice
        $effect(() => {
            if (this.monocle.settings.mode === 'commenting') this.playing = false;
        });

        $effect(() => {
            if (this.monocle.settings.view !== 'rally') ((this.started = false), (this.setupAsked = false));
            else if (!this.started) {
                if (untrack(() => this.monocle.settings.editing)) {
                    // writing: a loaded text just begins (no setup modal); with no text loaded the setup opens first
                    if (!this.monocle.doc.noText) this.started = true;
                    else if (!this.setupAsked) this.setupOpen = true;
                } else if (!this.monocle.doc.noText) {
                    // reading: a text with a default rally type just begins, paused; otherwise the pane shows the flag, which opens the setup
                    if (this.monocle.doc.rallyStyle && !this.setupAsked) this.started = true;
                }
            }
        });

        $effect(() => {
            if (this.monocle.settings.view !== 'rally') this.playing = false;
        });
    }

    /** Another tab is being opened: any rally is over. */
    reset = () => {
        this.fillId = this.headId = null;
        this.started = false;
        this.playing = false;
    };

    /** The menu's cog: stop, and offer the setup again. */
    openSetup = () => {
        this.playing = false;
        this.setupAsked = true;
        this.started = false;
        this.setupOpen = true;
    };

    /**
     * Rally writing mode: a one-line markdown line injected at the writer's cursor. Hashtags at the front make it a section
     * (as deep as there are hashtags); anything else is a paragraph.
     * @param {{ gap: { id: string, place: 'before' | 'after' | 'inside' } | null, text: string }} add
     * @returns {{ id: string, kind: 'paragraph' | 'section' } | null}
     */
    injectLine = ({ gap, text }) => {
        const { doc } = this.monocle;
        const line = text.replace(/\s+/g, ' ').trim();
        const m = /^(#{1,6})(?:\s+(.*))?$/.exec(line);
        const level = m ? m[1].length : 0;
        const kind = level ? 'section' : 'paragraph';
        const body = level ? `${m?.[1]} ${m?.[2] ?? ''}` : line;
        // a rally begun from nothing starts with an empty section and paragraph: the first things written fill them
        const emptyPara = this.fillId && doc.items.find((p) => p.id === this.fillId && p.text === '');
        const emptyHead = this.headId && doc.items.find((p) => p.id === this.headId && (p.level ?? 0) > 0 && p.text.replace(/^#+\s*/, '') === '');
        if (kind === 'paragraph' && emptyPara) {
            this.fillId = null;
            doc.commit(doc.items.map((p) => (p.id === emptyPara.id ? { ...p, text: body } : p)));
            return { id: emptyPara.id, kind };
        }
        if (kind === 'section' && emptyHead) {
            this.headId = null;
            doc.commit(doc.items.map((p) => (p.id === emptyHead.id ? { ...p, text: body, level } : p)));
            return { id: emptyHead.id, kind };
        }
        const target = gap ? doc.items.findIndex((p) => p.id === gap.id) : -1;
        const at = !gap || target === -1 ? doc.items.length : gap.place === 'inside' ? target + 1 : gapIndex(doc.items, gap.id, gap.place, false);
        if (at === -1) return null;
        const item = { id: crypto.randomUUID(), originalIndex: 0, text: body, level };
        return doc.commit(insertAt(doc.items, at, [item])) ? { id: item.id, kind } : null;
    };

    start = () => {
        const { doc } = this.monocle;
        this.setupOpen = false;
        if (doc.noText) {
            // a rally from nothing makes a new text, which needs a title first
            doc.newTextRequest = { title: '', run: ({ title, visibility }) => this.begin(title, visibility) };
            return;
        }
        this.begin('', 'private');
    };

    /** @param {string} title @param {string} visibility */
    begin = async (title, visibility) => {
        const { doc, settings } = this.monocle;
        this.started = true; // before the text is made, so arriving with a text does not reopen the setup
        if (doc.id && !doc.rallyStyle) {
            // the text's first rally gives it its default rally type
            fetch(`/api/texts/${doc.id}`, { method: 'PATCH', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ rallyStyle: 'compose' }) }).then((r) => {
                if (r.ok) doc.rallyStyle = 'compose';
            });
        }
        if (doc.noText) {
            // a rally from nothing: a new text is made (untitled, private; a section with an empty paragraph) and opened in writing mode
            try {
                const items = [
                    { id: crypto.randomUUID(), text: '# ', level: 1 },
                    { id: crypto.randomUUID(), text: '', level: 0 }
                ];
                const res = await fetch('/api/texts', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ title, visibility, rallyStyle: 'compose', items }) });
                if (!res.ok) throw new Error(`${res.status}`);
                await doc.showSaved((await res.json()).id);
                settings.mode = settings.chosenMode = 'writing';
                doc.markdown = true;
                this.fillId = doc.items[doc.items.length - 1]?.id ?? null;
                this.headId = doc.items[0]?.id ?? null;
                doc.startEditId = null;
            } catch (err) {
                console.warn('Could not begin a text', err);
                alert('Could not begin a new text.');
                this.started = false;
                return;
            }
        }
        this.playing = true;
    };
}
