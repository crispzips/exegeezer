import { getContext, setContext } from 'svelte';

/**
 * The one comment being written: a new one (`DRAFT_ID`) or one of the user's own being changed. It is not a box of its
 * own: the comment's bubble, wherever the view has put it, grows into the editor (see `CommentBubble`). It lives here,
 * apart from the bubbles, so that what has been typed stays while the views redraw them. There is nothing to press to
 * post or cancel: leaving the comment (see `finish`) keeps its words, or deletes it if it has none.
 *
 * @typedef {{ id: string, textId: string, paragraphIds: string[], body: string }} Writing
 */

export const DRAFT_ID = 'draft';

export class CommentEditor {
	/** @type {(Writing & { was: string }) | null} */
	open = $state(null);
	/** whether the comment is on its way to the server */
	busy = $state(false);
	/** why the last attempt to save it failed */
	problem = $state('');
	/** counts the calls for the editor: each one brings it into view and focuses it */
	called = $state(0);
	/** the comment to open once the one being saved is done with @type {Writing | null} */
	#next = null;

	/**
	 * @param {{
	 *   send: (writing: Writing) => Promise<string | void>,
	 *   textId: () => string | null,
	 *   failed: (problem: string) => void,
	 *   remove: (textId: string, commentId: string) => void,
	 *   askToRemove: (comment: import('#lib/utilities/comments.js').AnchoredComment) => void
	 * }} page `send` posts or saves (returning a message if it can't), `failed` reports such a message when the editor
	 * isn't there to show it, `remove` deletes a comment and `askToRemove` does so once the user agrees
	 */
	constructor(page) {
		this.page = page;
	}

	/** @param {string} id */
	is(id) {
		return this.open?.id === id;
	}

	/**
	 * Open the editor on a comment, finishing with the one it is on. While that one is being saved, `next` waits for it
	 * (and if saving fails, the editor stays where it is, so nothing typed is lost).
	 * @param {Writing} next
	 */
	start(next) {
		const now = this.open;
		if (now && now.id === next.id && now.textId === next.textId && now.paragraphIds.join() === next.paragraphIds.join()) {
			this.called++;
			return;
		}
		this.finish();
		if (this.open) {
			this.#next = next;
			this.called++;
		} else this.#show(next);
	}

	/** Change one of the user's own comments. @param {import('#lib/utilities/comments.js').AnchoredComment} comment */
	edit(comment) {
		const textId = this.page.textId();
		if (textId) this.start({ id: comment.id, textId, paragraphIds: comment.targetIds, body: comment.body });
	}

	/** Delete one of the user's own comments (the page asks first). @param {import('#lib/utilities/comments.js').AnchoredComment} comment */
	askToRemove(comment) {
		this.page.askToRemove(comment);
	}

	/**
	 * Be done with the comment in the editor: words are posted or saved, and a comment left with none is deleted (a new
	 * one is just dropped).
	 */
	async finish() {
		this.#next = null;
		const writing = this.open;
		if (!writing || this.busy) return;
		const body = writing.body.trim();
		const isNew = writing.id === DRAFT_ID;
		if (!body || (!isNew && body === writing.was.trim())) {
			this.open = null;
			if (!body && !isNew) this.page.remove(writing.textId, writing.id);
			return;
		}
		this.busy = true;
		this.problem = '';
		let problem;
		try {
			problem = await this.page.send({ id: writing.id, textId: writing.textId, paragraphIds: [...writing.paragraphIds], body });
		} catch {
			problem = 'Could not save the comment.';
		}
		this.busy = false;
		if (problem && writing.textId === this.page.textId()) {
			this.problem = problem;
		} else {
			if (problem) this.page.failed(problem);
			this.open = null;
			if (this.#next) this.#show(this.#next);
		}
		this.#next = null;
	}

	/** @param {Writing} next */
	#show(next) {
		this.open = { ...next, was: next.body };
		this.problem = '';
		this.called++;
	}
}

const KEY = Symbol('comment editor');
/** @param {CommentEditor} editor */
export const provideCommentEditor = (editor) => setContext(KEY, editor);
/** @returns {CommentEditor | undefined} */
export const useCommentEditor = () => getContext(KEY);
