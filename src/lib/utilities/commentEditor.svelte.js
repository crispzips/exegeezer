import { getContext, setContext } from 'svelte';

/**
 * The one comment being written: a new one (`DRAFT_ID`) or one of the user's own being changed. It is not a box of its
 * own: the comment's bubble, wherever the view has put it, grows into the editor (see `CommentBubble`). It lives here,
 * apart from the bubbles, so that what has been typed stays while the views redraw them.
 *
 * @typedef {{ id: string, textId: string, paragraphIds: string[], body: string }} Writing
 */

export const DRAFT_ID = 'draft';

export class CommentEditor {
	/** @type {(Writing & { was: string }) | null} */
	open = $state(null);
	busy = $state(false);
	/** why the last attempt to post or save failed */
	problem = $state('');
	/** counts the calls for the editor: each one brings it into view and focuses it */
	called = $state(0);

	/**
	 * @param {{
	 *   send: (writing: Writing) => Promise<string | void>,
	 *   textId: () => string | null,
	 *   blocked: () => void
	 * }} page `send` posts or saves (returning a message if it can't), `blocked` says an unfinished comment is in the way
	 */
	constructor(page) {
		this.page = page;
	}

	/** @param {string} id */
	is(id) {
		return this.open?.id === id;
	}

	/** whether there is typing that closing the editor would lose */
	get changed() {
		return !!this.open && this.open.body.trim() !== this.open.was.trim();
	}

	/**
	 * Open the editor on a comment. An unfinished one is not thrown away: it is brought into view instead.
	 * @param {Writing} next
	 * @returns {boolean} whether the editor is now on `next`
	 */
	start(next) {
		const now = this.open;
		const same = !!now && now.id === next.id && now.textId === next.textId && now.paragraphIds.join() === next.paragraphIds.join();
		if (now && (same || this.changed || this.busy)) {
			this.called++;
			if (!same) this.page.blocked();
			return same;
		}
		this.open = { ...next, was: next.body };
		this.problem = '';
		this.called++;
		return true;
	}

	/** Change one of the user's own comments. @param {import('#lib/utilities/comments.js').AnchoredComment} comment */
	edit(comment) {
		const textId = this.page.textId();
		if (textId) this.start({ id: comment.id, textId, paragraphIds: comment.targetIds, body: comment.body });
	}

	cancel() {
		if (!this.busy) this.open = null;
	}

	async post() {
		const writing = this.open;
		if (!writing || this.busy || !writing.body.trim()) return;
		if (writing.id !== DRAFT_ID && !this.changed) return this.cancel();
		this.busy = true;
		this.problem = '';
		try {
			const problem = await this.page.send({ id: writing.id, textId: writing.textId, paragraphIds: [...writing.paragraphIds], body: writing.body.trim() });
			if (problem) this.problem = problem;
			else this.open = null;
		} catch {
			this.problem = 'Could not save the comment.';
		} finally {
			this.busy = false;
		}
	}
}

const KEY = Symbol('comment editor');
/** @param {CommentEditor} editor */
export const provideCommentEditor = (editor) => setContext(KEY, editor);
/** @returns {CommentEditor | undefined} */
export const useCommentEditor = () => getContext(KEY);
