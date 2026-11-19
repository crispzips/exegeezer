/**
 * Which paragraph or section the pointer is over, for the floating edit menu.
 * A short grace period on leaving lets the pointer travel from the item to its
 * menu (which floats just above it) without the menu disappearing.
 *
 * @typedef {{ id: string, kind: 'paragraph' | 'section', el: HTMLElement }} EditTarget
 */
export class EditHover {
	/** @type {EditTarget | null} */
	target = $state(null);
	/** @type {ReturnType<typeof setTimeout> | undefined} */
	#timer;

	/** @param {EditTarget} target */
	enter(target) {
		clearTimeout(this.#timer);
		this.target = target;
	}

	leave() {
		clearTimeout(this.#timer);
		this.#timer = setTimeout(() => (this.target = null), 150);
	}

	/** keep the current target (the pointer is on its menu) */
	hold() {
		clearTimeout(this.#timer);
	}

	clear() {
		clearTimeout(this.#timer);
		this.target = null;
	}

	/** @param {string} id */
	is(id) {
		return this.target?.id === id;
	}
}
