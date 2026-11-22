/**
 * Undo/redo history as a stack of snapshots. Every edit helper returns a new list
 * and shares unchanged items, so keeping earlier lists is cheap. The history lives
 * as long as its owner (the page), so it outlives switching modes and is gone
 * when the tab closes.
 *
 * @template T
 */
export class History {
	/** @type {T[]} */
	#past = $state.raw([]);
	/** @type {T[]} */
	#future = $state.raw([]);
	#limit;

	/** @param {number} [limit] most undo steps kept */
	constructor(limit = 200) {
		this.#limit = limit;
	}

	get canUndo() {
		return this.#past.length > 0;
	}

	get canRedo() {
		return this.#future.length > 0;
	}

	/** Forget every step (the text they were steps of is gone). */
	clear() {
		this.#past = [];
		this.#future = [];
	}

	/** The value before the latest recorded edit, if any (what undo would restore). */
	get last() {
		return this.#past.at(-1);
	}

	/** Forget the latest recorded edit as if it never happened (it cannot be redone either). */
	discard() {
		this.#past = this.#past.slice(0, -1);
	}

	/**
	 * Record an edit: remember `current`, forget any redo steps.
	 * @param {T} current the value before the edit
	 */
	record(current) {
		this.#past = [...this.#past.slice(-(this.#limit - 1)), current];
		this.#future = [];
	}

	/**
	 * @param {T} current
	 * @returns {T | undefined} the value to restore, if there is one
	 */
	undo(current) {
		const prev = this.#past.at(-1);
		if (prev === undefined) return undefined;
		this.#past = this.#past.slice(0, -1);
		this.#future = [...this.#future, current];
		return prev;
	}

	/**
	 * @param {T} current
	 * @returns {T | undefined} the value to restore, if there is one
	 */
	redo(current) {
		const next = this.#future.at(-1);
		if (next === undefined) return undefined;
		this.#future = this.#future.slice(0, -1);
		this.#past = [...this.#past, current];
		return next;
	}
}
