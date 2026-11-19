import { gapLineClass } from '#lib/utilities/dragDrop.svelte.js';

/**
 * The interstitial landing zone the pointer is hovering (when nothing is being dragged).
 * The menu that opens beside the pointer stays where the pointer first entered the zone,
 * and a short grace period on leaving lets the pointer travel to it.
 *
 * @typedef {{ id: string, place: 'before' | 'after', axis: 'x' | 'y' }} GapTarget
 */
export class GapHover {
	/** @type {GapTarget | null} */
	target = $state(null);
	/** whether the magenta line is shown: only while the pointer is in the zone or on its menu */
	lit = $state(false);
	/** where the pointer entered the zone (the menu is placed beside this point) */
	x = $state(0);
	y = $state(0);
	/** @type {ReturnType<typeof setTimeout> | undefined} */
	#timer;

	/**
	 * @param {GapTarget | null} zone the zone under the pointer, or null when it is in none
	 * @param {PointerEvent} e
	 */
	set(zone, e) {
		if (!zone) return this.leave();
		clearTimeout(this.#timer);
		this.#timer = undefined;
		this.lit = true;
		if (this.target?.id === zone.id && this.target.place === zone.place) return;
		this.target = zone;
		this.x = e.clientX;
		this.y = e.clientY;
	}

	leave() {
		// the line goes at once; only the menu lingers, so the pointer can travel to it
		this.lit = false;
		if (this.#timer) return; // already counting down (repeated pointer moves must not extend it)
		this.#timer = setTimeout(() => {
			this.#timer = undefined;
			this.target = null;
		}, 150);
	}

	/** keep the current zone (the pointer is on its menu) */
	hold() {
		this.lit = true;
		clearTimeout(this.#timer);
		this.#timer = undefined;
	}

	clear() {
		this.lit = false;
		clearTimeout(this.#timer);
		this.#timer = undefined;
		this.target = null;
	}

	/** the magenta line, on the item the zone is expressed on
	 * @param {string} id */
	classes(id) {
		return this.lit && this.target?.id === id ? gapLineClass(this.target.place, this.target.axis) : '';
	}
}
