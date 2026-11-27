import { tick } from 'svelte';
import { appendToSection, moveToGap, sectionBlocks, applyDrop, describeSection, gapIndex, insertAt, moveItem, removeParagraph, removeSection, renameSection } from '#lib/utilities/editText.js';
import { excerptOf } from './items.js';

/** @param {number} n @param {string} word */
const count = (n, word) => `${n} ${word}${n === 1 ? '' : 's'}`;

/** Changes made to the text from the views and the map: delete, rename, move, add, edit; and where the map takes you. */
export class Editing {
    /** the paragraph or section expanded into the editor modal
     * @type {{ id: string, kind: 'paragraph' | 'section', from: DOMRect } | null} */
    editRequest = $state(null);
    /** what Enter in an edited bubble is asking: where to show the paragraph-or-section choice, and how to make the pick (default: next to the bubble)
     * @type {{ rect: DOMRect, levels: number[], level: number, pick: (kind: 'paragraph' | 'section', level?: number) => void } | null} */
    chooser = $state(null);
    /** the kind of item made most recently: the choice's first option
     * @type {'paragraph' | 'section'} */
    lastKind = $state('paragraph');
    /** whether the map modal (a navigable map of the text's sections) is open */
    mapOpen = $state(false);
    /** the map was used to rearrange the text: when it closes, the changes stay and undo / redo start afresh */
    mapChanged = false;
    /**
     * Bubbles made by Enter that are still waiting for their first content, each with the text as it was
     * just before the bubble was made. A bubble left without any content is dropped again.
     * @type {Map<string, any[]>}
     */
    fresh = new Map();
    /** @type {HTMLDivElement | undefined} */
    mainPane = $state.raw();
    /** the hierarchical or cascading view, whichever is showing
     * @type {{ openPath: (ids: any) => unknown } | undefined} */
    hierarchy = $state.raw();

    /** @param {import('./monocle.svelte.js').Monocle} monocle */
    constructor(monocle) {
        this.monocle = monocle;

        $effect(() => {
            if (this.mapOpen || !this.mapChanged) return;
            this.mapChanged = false;
            this.monocle.doc.history.clear();
        });
    }

    /** Cmd/Ctrl+Z (undo) and Shift+Cmd/Ctrl+Z or Ctrl+Y (redo) in writing mode, leaving text fields to their own undo
     * @param {KeyboardEvent} e */
    onKeydown = (e) => {
        const { doc, settings } = this.monocle;
        if (!settings.editing || !(e.metaKey || e.ctrlKey) || e.altKey) return;
        const t = /** @type {HTMLElement | null} */ (e.target);
        if (t?.closest('input, textarea, select, [contenteditable]') && !t.hasAttribute('data-text-undo')) return; // the rally writer's line has no undo of its own: Cmd+Z there undoes the text
        const key = e.key.toLowerCase();
        if (key === 'z' && !e.shiftKey) doc.undo();
        else if ((key === 'z' && e.shiftKey) || key === 'y') doc.redo();
        else return;
        e.preventDefault();
    };

    /** Delete a paragraph or section, after confirmation. @param {{ id: string, kind: 'paragraph' | 'section', scope?: 'only' | 'tree' }} req */
    requestDelete = ({ id, kind, scope }) => {
        const { doc } = this.monocle;
        const para = doc.items.find((p) => p.id === id);
        if (!para) return;

        if (kind === 'paragraph') {
            const excerpt = excerptOf(para.text);
            doc.deleteRequest = {
                title: 'Delete this paragraph?',
                message: `${excerpt.trim() ? `"${excerpt}"\n\n` : ''}This permanently deletes the paragraph.`,
                confirm: 'Delete paragraph',
                run: () => doc.commit(removeParagraph(doc.items, id))
            };
            return;
        }

        const info = describeSection(doc.items, id);
        const inside = `${count(info.paragraphs, 'paragraph')} and ${count(info.sections, 'subsection')}`;
        doc.deleteRequest =
            scope === 'tree'
                ? {
                      title: 'Delete section and all its descendants?',
                      message: `This permanently deletes the section${info.title.trim() ? ` "${info.title}"` : ''} and everything inside it: ${inside}.`,
                      confirm: 'Delete section and descendants',
                      run: () => doc.commit(removeSection(doc.items, id, true))
                  }
                : {
                      title: 'Delete just this section?',
                      message: `This permanently deletes the section heading${info.title.trim() ? ` "${info.title}"` : ''}. Its ${inside} move into the section above it.`,
                      confirm: 'Delete section',
                      run: () => doc.commit(removeSection(doc.items, id, false))
                  };
    };

    /** @param {{ id: string, title: string | null, position: number, fields?: { text: string, title: string, description: string } }} change */
    saveEdit = ({ id, title, position, fields }) => {
        const { doc } = this.monocle;
        let next = doc.items;
        if (fields) next = next.map((p) => (p.id === id ? { ...p, ...fields } : p));
        if (title !== null && title.trim()) next = renameSection(next, id, title);
        doc.commit(moveItem(next, id, position));
    };

    /** @param {{ id: string, title: string }} change a section's new title */
    renameSectionTitle = ({ id, title }) => {
        const { doc } = this.monocle;
        if (title.trim()) doc.commit(renameSection(doc.items, id, title));
    };

    /** @param {{ id: string, targetId: string, place: import('#lib/utilities/editText.js').DropPlace }} drop */
    moveByDrag = (drop) => {
        const { doc, settings } = this.monocle;
        doc.commit(applyDrop(doc.items, drop, settings.view === 'linear'));
    };

    /**
     * Something dragged on the map. Paragraphs dropped on a section go at its end; a section dropped on a section is joined
     * to the end of it (see applyDrop); either dropped in a gap lands there.
     * @param {{ kind: 'paragraphs' | 'section', ids: string[], into?: string, before?: string, after?: string, parentId?: string | null }} move
     */
    moveFromMap = ({ kind, ids, into, before, after, parentId }) => {
        const { doc } = this.monocle;
        let next = doc.items;
        if (into !== undefined && kind === 'section') {
            // each section in turn is joined to the end of the target, in the order of the text (one inside another picked goes with it)
            const heads = sectionBlocks(doc.items, ids).map((b) => b[0].id);
            for (const id of heads) next = applyDrop(next, { id, targetId: into, place: 'merge-after' }, false);
        } else if (into !== undefined) next = appendToSection(doc.items, ids, into);
        else next = moveToGap(doc.items, ids, { before, after }, doc.items.find((p) => p.id === parentId)?.level ?? 0);
        if (next !== doc.items && doc.commit(next)) this.mapChanged = true;
    };

    /** @param {{ id: string, kind: 'front' | 'back' | null }} change a top-level section made front matter, back matter, or neither, on the map */
    setMatter = ({ id, kind }) => {
        const { doc } = this.monocle;
        if (doc.commit(doc.items.map((p) => (p.id === id ? { ...p, frontmatter: kind === 'front', backmatter: kind === 'back' } : p)))) this.mapChanged = true;
    };

    /** @param {{ id: string, text: string, title?: string, description?: string }} edit only the fields given change */
    editParagraph = ({ id, ...fields }) => {
        const { doc } = this.monocle;
        doc.commit(
            doc.items.map((p) => {
                if (p.id !== id) return p;
                if ((p.level ?? 0) === 0 || fields.text === undefined) return { ...p, ...fields };
                // a header edited as markup: its # marks set its level, and it stays a header
                const m = fields.text.match(/^(#{1,6})\s+(.*)$/);
                const level = m ? m[1].length : (p.level ?? 1);
                const title = (m ? m[2] : fields.text.replace(/^#+\s*/, '')).trim();
                return title ? { ...p, ...fields, level, text: `${'#'.repeat(level)} ${title}` } : p;
            })
        );
    };

    /** An edit in a view ended: a fresh bubble left unchanged is deleted (as if never made). @param {string} id @param {boolean} changed */
    leftBubble = (id, changed) => {
        const { doc } = this.monocle;
        const before = this.fresh.get(id);
        if (!before) return;
        this.fresh.delete(id);
        if (changed) return;
        const item = doc.items.find((p) => p.id === id);
        if (!item) return;
        const next = (item.level ?? 0) > 0 ? removeSection(doc.items, id, false) : removeParagraph(doc.items, id);
        if (doc.history.last === before) {
            doc.history.discard(); // the bubble's making was the latest step: take it back rather than add a step
            doc.items = next;
        } else doc.commit(next);
        if (doc.focusId === id) doc.focusId = null;
    };

    /**
     * Enter in an edited section or paragraph (any view): ask whether to make a paragraph or a section.
     * @param {string} id @param {DOMRect} rect @param {(kind: 'paragraph' | 'section', level?: number) => void} [pick] how a view makes it itself
     */
    askNew = (id, rect, pick = (kind, level) => this.createFrom(id, kind, level)) => {
        this.chooser = { rect, pick, ...this.sectionLevels(id) };
    };

    /**
     * The levels a section made right after the bubble `id` can take, and the one you are in: no deeper than one below the
     * heading before it (a heading 1 when there is none), and the level of the heading at or before the bubble by default.
     * @param {string} id
     */
    sectionLevels = (id) => {
        const { items } = this.monocle.doc;
        const j = items.findIndex((p) => p.id === id);
        const at = gapIndex(items, id, 'after', false);
        let max = 1;
        for (let k = Math.min(at, items.length) - 1; k >= 0; k--) {
            if ((items[k].level ?? 0) > 0) {
                max = Math.min(6, (items[k].level ?? 0) + 1);
                break;
            }
        }
        let here = 1;
        for (let k = j; k >= 0; k--) {
            if ((items[k].level ?? 0) > 0) {
                here = items[k].level ?? 1;
                break;
            }
        }
        return { levels: Array.from({ length: max }, (_, i) => i + 1), level: Math.min(here, max) };
    };

    /** A new empty paragraph or section after the bubble `id` (a paragraph made from a section is its first item), opened for editing. @param {string} id @param {'paragraph' | 'section'} kind @param {number} [level] a section's level */
    createFrom = (id, kind, level) => {
        const { doc } = this.monocle;
        const from = doc.items.find((p) => p.id === id);
        if (!from) return;
        const newId = this.addAtGap({ targetId: id, place: kind === 'paragraph' && (from.level ?? 0) > 0 ? 'inside' : 'after', kind, auto: true, level });
        // once the choice has closed and let go of the focus, so nothing takes it back from the new bubble's editor
        if (newId) setTimeout(() => (doc.startEditId = newId), 0);
    };

    /** Inject at an interstitial landing zone. @param {{ targetId: string, place: 'before' | 'after', mode: 'empty' | 'load' }} req */
    injectRequest = ({ targetId, place, mode }) => {
        const { doc, settings, load } = this.monocle;
        const gap = gapIndex(doc.items, targetId, place, settings.view === 'linear');
        if (gap === -1) return;
        if (mode === 'empty') {
            const item = { id: crypto.randomUUID(), originalIndex: 0, text: '', level: 0 };
            if (doc.commit(insertAt(doc.items, gap, [item]))) doc.startEditId = item.id; // the editing cursor goes straight into the new paragraph
        } else load.openAtGap(gap);
    };

    /**
     * Add an empty paragraph or section at a gap (the cascading view's plus). A new section's
     * level is its sibling's, or one below the section the gap is inside (1 at the top);
     * like any header it takes in what follows it up to the next header of its level or higher.
     * @param {{ targetId: string, place: 'before' | 'after' | 'inside', kind: 'paragraph' | 'section', auto?: boolean, level?: number }} req (auto: made by Enter, so dropped again if left empty)
     * @returns {string | undefined} the new item's id (the view centres its bubble)
     */
    addAtGap = ({ targetId, place, kind, auto = false, level: chosen }) => {
        const { doc } = this.monocle;
        const before = doc.items;
        // 'inside': the first item of a section, right after its header
        const target = before.findIndex((p) => p.id === targetId);
        const at = place === 'inside' ? (target === -1 ? -1 : target + 1) : gapIndex(before, targetId, place, false);
        if (at === -1) return;
        /** @type {{ id: string, originalIndex: number, text: string, level: number }} */
        let item = { id: crypto.randomUUID(), originalIndex: 0, text: '', level: 0 };
        if (kind === 'section' && place === 'inside') {
            const level = Math.min(6, (before[target].level ?? 0) + 1);
            item = { ...item, level, text: `${'#'.repeat(level)} ` };
        } else if (kind === 'section' && chosen) {
            item = { ...item, level: chosen, text: `${'#'.repeat(chosen)} ` };
        } else if (kind === 'section') {
            let level = 1;
            for (let k = before.findIndex((p) => p.id === targetId); k >= 0; k--) {
                const lv = before[k].level ?? 0;
                if (lv > 0) {
                    level = Math.min(6, k === before.findIndex((p) => p.id === targetId) ? lv : lv + 1);
                    break;
                }
            }
            item = { ...item, level, text: `${'#'.repeat(level)} ` };
        }
        if (!doc.commit(insertAt(doc.items, at, [item]))) return;
        this.lastKind = kind;
        if (auto) this.fresh.set(item.id, before); // made by Enter: dropped again if it is left empty
        return item.id;
    };

    /** A double-click on a paragraph while not writing: switch to writing mode and open that paragraph for editing (the cascading view edits the bubble in place). @param {string} id */
    writeAt = (id) => {
        const { doc, settings } = this.monocle;
        if (!this.monocle.authed || doc.noText || doc.publicized) return;
        settings.mode = settings.chosenMode = 'writing';
        if (settings.view !== 'cascading') doc.startEditId = id;
    };

    /** Bring a section (the last of `ids`, outermost first) into view in the current view. @param {string[]} ids */
    goToSection = async (ids) => {
        const { doc, settings } = this.monocle;
        doc.focusId = ids[ids.length - 1] ?? doc.focusId;
        if (settings.view !== 'linear') return void this.hierarchy?.openPath(ids);
        await tick();
        this.mainPane?.querySelector(`[data-para="${CSS.escape(ids[ids.length - 1])}"]`)?.scrollIntoView({ block: 'start' });
    };
}
