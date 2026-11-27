import { untrack } from 'svelte';
import { anchorComments, sectionParagraphs } from '#lib/utilities/comments.js';
import { CommentEditor, DRAFT_ID, provideCommentEditor } from '#lib/utilities/commentEditor.svelte.js';
import { ancestorsOf, buildSections } from '#lib/utilities/buildSections.js';
import { excerptOf } from './items.js';

const MAC = typeof navigator !== 'undefined' && /Mac|iP(hone|ad|od)/.test(navigator.userAgent);

/** @param {EventTarget | null} t */
const onEditedComment = (t) => t instanceof Element && !!t.closest('article[data-editing]');

/** Comments: picking what to comment on, writing and deleting them, and what the views show of them. */
export class Commenting {
    /** paragraphs picked to comment on at once. They are picked as files are in a file manager: a cmd-click (ctrl-click away from the
     * Mac) adds one, or a whole section, or takes it back out; a shift-click picks the range from the last of those to where it lands */
    picked = $state.raw(/** @type {Set<string>} */ (new Set()));
    /** the paragraph or section header last cmd/ctrl-clicked (or first shift-clicked): where a shift-click's range starts
     * @type {string | null} */
    pickAnchor = null;
    /** the comments last fetched, and the text they are on */
    fetched = $state.raw({ textId: /** @type {string | null} */ (null), comments: /** @type {import('#lib/utilities/comments.js').Comment[]} */ ([]) });
    /** whether the press now ending began on the comment in the editor */
    pressedOnComment = false;

    /** what the views mark as picked: the paragraphs, and every section all of whose paragraphs are picked */
    pickedMarks = $derived.by(() => {
        if (!this.picked.size) return this.picked;
        const whole = sectionParagraphs(this.monocle.doc.shown).filter((s) => s.paragraphIds.length && s.paragraphIds.every((p) => this.picked.has(p)));
        return new Set([...this.picked, ...whole.map((s) => s.id)]);
    });
    /** the paragraphs of the new comment being written on this text, or null (not its words: they change with every key) */
    draftOn = $derived(this.editor.open?.id === DRAFT_ID && this.editor.open.textId === this.monocle.doc.id ? this.editor.open.paragraphIds : null);
    /** what the views show in commenting mode, each comment placed by its section or first paragraph, the one being written
     * among them (undefined outside that mode) */
    anchored = $derived.by(() => {
        if (!this.monocle.settings.commenting) return undefined;
        const saved = this.fetched.textId === this.monocle.doc.id ? this.fetched.comments : [];
        // the new one counts as the latest, so it follows the others in its place
        const draft = this.draftOn ? [{ id: DRAFT_ID, commentaryId: '', authors: [this.monocle.userName], body: '', createdAt: '9999', paragraphIds: this.draftOn }] : [];
        return anchorComments([...saved, ...draft], this.monocle.doc.shown);
    });
    /** what the views mark: what is picked, and what the comment in the editor is about */
    shownMarks = $derived.by(() => {
        const written = this.anchored?.find((c) => this.editor.is(c.id));
        return written ? new Set([...this.pickedMarks, written.anchorId, ...written.targetIds]) : this.pickedMarks;
    });

    /** @param {import('./monocle.svelte.js').Monocle} monocle */
    constructor(monocle) {
        this.monocle = monocle;
        /** the one comment being written: its bubble, where the view puts it, is the editor */
        this.editor = new CommentEditor({ send: (writing) => this.send(writing), textId: () => monocle.doc.id, failed: (problem) => monocle.tabs.notify(problem), remove: (on, id) => this.remove(on, id), askToRemove: (comment) => this.requestDelete(comment) });
        provideCommentEditor(this.editor);

        // what was picked doesn't carry over to another text or mode
        $effect(() => {
            void this.monocle.doc.id;
            void this.monocle.settings.mode;
            this.clearPicked();
        });

        // a comment belongs to its text: leaving the text finishes with it
        $effect(() => {
            const id = this.monocle.doc.id;
            untrack(() => {
                if (this.editor.open && this.editor.open.textId !== id) this.editor.finish();
            });
        });

        // coming to a view (or back to commenting) with a comment that couldn't be saved: its bubble is shown there too
        $effect(() => {
            void this.monocle.settings.view;
            if (this.monocle.settings.mode !== 'commenting') return;
            // once the view has drawn itself and opened wherever it was going to
            const turn = setTimeout(() => {
                const writing = this.editor.open;
                if (!writing || writing.textId !== this.monocle.doc.id) return;
                this.showAnchor(writing.paragraphIds);
                this.editor.called++;
            }, 300);
            return () => clearTimeout(turn);
        });

        // comments are fetched when a text is shown in commenting mode, and again after one is posted
        $effect(() => {
            const id = this.monocle.doc.id;
            if (this.monocle.authed && this.monocle.settings.commenting && id) untrack(() => this.load(id));
        });
    }

    /** the paragraphs a paragraph or a section header stands for: itself, or all those in the section @param {string} id */
    paragraphsAt = (id) => {
        const { shown } = this.monocle.doc;
        const item = shown.find((p) => p.id === id);
        if (!item) return [];
        return (item.level ?? 0) > 0 ? (sectionParagraphs(shown).find((x) => x.id === id)?.paragraphIds ?? []) : [id];
    };

    clearPicked = () => {
        this.picked = new Set();
        this.pickAnchor = null;
    };

    /** @param {string} id a paragraph or a section header */
    togglePick = (id) => {
        const ids = this.paragraphsAt(id);
        if (!ids.length) return this.monocle.tabs.notify('That section has no paragraphs to comment on.');
        const out = ids.every((p) => this.picked.has(p));
        const next = new Set(this.picked);
        for (const p of ids) out ? next.delete(p) : next.add(p);
        this.picked = next;
        this.pickAnchor = id;
    };

    /** Pick every paragraph from the anchor to `id`, in the order of the text. With no anchor yet, `id` becomes it.
     * @param {string} id a paragraph or a section header @param {boolean} keep add the range to what is picked, instead of replacing it */
    pickRange = (id, keep) => {
        const to = this.paragraphsAt(id);
        if (!to.length) return this.monocle.tabs.notify('That section has no paragraphs to comment on.');
        let from = this.pickAnchor ? this.paragraphsAt(this.pickAnchor) : [];
        if (!from.length) {
            this.pickAnchor = id;
            from = to;
        }
        const order = this.monocle.doc.shown.filter((p) => (p.level ?? 0) === 0).map((p) => p.id);
        // a section at either end is in the range whole
        const ends = [from[0], from[from.length - 1], to[0], to[to.length - 1]].map((p) => order.indexOf(p));
        const range = order.slice(Math.min(...ends), Math.max(...ends) + 1);
        this.picked = new Set(keep ? [...this.picked, ...range] : range);
    };

    /** Takes a view's mouse events before the view does: in commenting mode, those made with shift, or with cmd (Mac) or ctrl (elsewhere),
     * pick, and do nothing else. A ctrl-click on a Mac does nothing at all (the system's own menu still comes up). @param {MouseEvent} e */
    pickCapture = (e) => {
        if (!this.monocle.settings.commenting || !this.monocle.authed || !(e.target instanceof Element)) return;
        const add = MAC ? e.metaKey : e.ctrlKey;
        const nothing = MAC && e.ctrlKey;
        if (!(e.shiftKey || add || nothing) || (nothing && e.type === 'mousedown')) return;
        const el = e.target.closest('[data-para], [data-node]');
        if (!(el instanceof HTMLElement)) return;
        e.preventDefault(); // no text selection or link
        e.stopPropagation();
        if (e.type !== 'click' || nothing) return;
        const id = el.dataset.para ?? el.dataset.node ?? '';
        if (e.shiftKey) this.pickRange(id, add);
        else this.togglePick(id);
    };

    /** Begin a new comment on some paragraphs. The first one creates the commentary. @param {string[]} paragraphIds */
    compose = (paragraphIds) => {
        const id = this.monocle.doc.id;
        if (!this.monocle.authed || !id) return;
        this.editor.start({ id: DRAFT_ID, textId: id, paragraphIds, body: '' });
        this.showAnchor(paragraphIds);
    };

    // ---- A click anywhere but on the comment in the editor finishes with it. It is seen to before whatever was clicked
    // does anything (so that may open another), and not for a press that began on the comment, as a selecting drag may ----

    /** @param {EventTarget | null} target */
    pointerDown = (target) => {
        this.pressedOnComment = onEditedComment(target);
    };

    /** @param {MouseEvent} e */
    clickAway = (e) => {
        const began = this.pressedOnComment;
        this.pressedOnComment = false;
        if (this.editor.open && !began && !onEditedComment(e.target)) this.editor.finish();
    };

    /** Escape unpicks (a comment being written takes its own Escape) @param {KeyboardEvent} e */
    onKeydown = (e) => {
        if (e.key === 'Escape' && this.picked.size && !this.editor.open) this.clearPicked();
    };

    /** Open the sections around the place a new comment goes, in the views that keep sections closed. @param {string[]} paragraphIds */
    showAnchor = (paragraphIds) => {
        const { doc, settings, edits } = this.monocle;
        const [at] = anchorComments([{ id: DRAFT_ID, commentaryId: '', authors: [], body: '', createdAt: '', paragraphIds }], doc.shown);
        if (!at || (settings.view !== 'hierarchical' && settings.view !== 'cascading') || document.querySelector(`[data-node="${CSS.escape(at.anchorId)}"]`)) return;
        const around = ancestorsOf(buildSections(doc.shown), at.anchorId);
        if (around?.length) edits.hierarchy?.openPath(around);
    };

    /** @param {string} id */
    load = async (id) => {
        try {
            const res = await fetch(`/api/texts/${id}/comments`);
            if (!res.ok) throw new Error(`${res.status}`);
            const { comments } = await res.json();
            if (id === this.monocle.doc.id) this.fetched = { textId: id, comments };
        } catch (err) {
            console.warn('Could not load the comments', err);
            this.monocle.tabs.notify('Could not load the comments.');
        }
    };

    /** @param {import('#lib/utilities/commentEditor.svelte.js').Writing} writing @returns {Promise<string | void>} what went wrong, if it did */
    send = async ({ id, textId: on, paragraphIds, body }) => {
        const isNew = id === DRAFT_ID;
        await this.monocle.doc.queue; // let any save in flight finish first, so the paragraphs exist on the server
        const res = await fetch(`/api/texts/${on}/comments`, {
            method: isNew ? 'POST' : 'PATCH',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify(isNew ? { paragraphIds, body } : { commentId: id, body })
        });
        const answer = await res.json().catch(() => null);
        if (!res.ok) return answer?.message ?? 'Could not save the comment.';
        if (isNew && paragraphIds.some((p) => this.picked.has(p))) this.clearPicked();
        // a commentary is a text too: a tab holding it is now out of date (and saving from it would undo the change), so it reloads
        this.monocle.tabs.deload(answer?.commentaryId);
        await this.load(on);
    };

    /** @param {import('#lib/utilities/comments.js').AnchoredComment} comment */
    requestDelete = (comment) => {
        const { doc } = this.monocle;
        const on = doc.id;
        if (!on) return;
        const excerpt = excerptOf(comment.body);
        doc.deleteRequest = {
            title: 'Delete this comment?',
            message: `"${excerpt}"\n\nThis permanently deletes the comment. This cannot be undone.`,
            confirm: 'Delete comment',
            run: () => this.remove(on, comment.id)
        };
    };

    /** @param {string} on the text commented on @param {string} commentId */
    remove = async (on, commentId) => {
        const { doc, tabs } = this.monocle;
        // it goes from sight at once (and comes back if the server won't delete it)
        if (this.fetched.textId === on) this.fetched = { textId: on, comments: this.fetched.comments.filter((c) => c.id !== commentId) };
        try {
            await doc.queue;
            const res = await fetch(`/api/texts/${on}/comments`, {
                method: 'DELETE',
                headers: { 'content-type': 'application/json' },
                body: JSON.stringify({ commentId })
            });
            const answer = await res.json().catch(() => null);
            if (!res.ok) tabs.notify(answer?.message ?? 'Could not delete the comment.');
            else tabs.deload(answer?.commentaryId);
            // after a refusal too: the comment may already be gone
            await this.load(on);
        } catch (err) {
            console.warn('Could not delete the comment', err);
            tabs.notify('Could not delete the comment.');
            await this.load(on);
        }
    };

    commentPicked = () => {
        const ids = this.monocle.doc.shown.filter((p) => this.picked.has(p.id)).map((p) => p.id);
        if (ids.length) this.compose(ids);
    };

    /** A click in commenting mode, on a paragraph or on a section's header or comment button (which comments on all its paragraphs).
     * On something picked, the comment is on everything picked. @param {string} id */
    commentAt = (id) => {
        if (this.pickedMarks.has(id)) return this.commentPicked();
        const ids = this.paragraphsAt(id);
        if (!ids.length) return this.monocle.tabs.notify('That section has no paragraphs to comment on.');
        this.compose(ids);
    };
}
