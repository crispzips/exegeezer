import { gapLineClass } from '#lib/utilities/dragDrop.svelte.js';

/**
 * The interstitial landing zone the pointer is hovering (when nothing is being dragged).
 * The menu that opens beside the pointer stays where the pointer first entered the zone,
 * and a short grace period on leaving lets the pointer travel to it.
 *
 * `place` 'inside' (cascading view only) is the gap just beyond a section bubble, where its contents begin.
 * @typedef {{ id: string, place: 'before' | 'after' | 'inside', axis: 'x' | 'y', at?: { x: number, y: number } }} GapTarget
 */
export class GapHover {
	/** @type {GapTarget | null} */
	target = $state(null);
	/** whether the magenta line is shown: only while the pointer is in the zone or on its menu */
	lit = $state(false);
	/** whether the menu's dropdown is open (the keyboard opens it with Enter) */
	open = $state(false);
	/** whether x, y are the middle of the gap (the menu is centred on it) rather than a point beside it */
	centred = $state(false);
	/** where the pointer entered the zone (the menu is placed beside this point) */
	x = $state(0);
	y = $state(0);
	/** @type {ReturnType<typeof setTimeout> | undefined} */
	#timer;
	/** whether the hovered gap opens up to make room for the menu (the hierarchical view) */
	nudge = false;

	/** @param {{ nudge?: boolean }} [opts] */
	constructor(opts = {}) {
		this.nudge = !!opts.nudge;
	}

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
		this.centred = !!zone.at;
		this.x = zone.at?.x ?? e.clientX;
		this.y = zone.at?.y ?? e.clientY;
	}

	/**
	 * Where the menu sits for a pointer over an interstice element: on the line the interstice draws, so it has one degree of
	 * freedom: it slides along that line with the pointer (kept clear of the line's ends) and never leaves it.
	 * @param {HTMLElement} el the interstice element
	 * @param {PointerEvent} e
	 * @param {'x' | 'y'} axis 'y' for a horizontal line between stacked bubbles, 'x' for a vertical one between bubbles side by side
	 * @returns {{ x: number, y: number }}
	 */
	tether(el, e, axis) {
		const r = el.getBoundingClientRect();
		const half = 20;
		const along = (/** @type {number} */ v, /** @type {number} */ lo, /** @type {number} */ hi) => Math.max(Math.min(lo + half, hi), Math.min(v, hi - half));
		return axis === 'y'
			? { x: along(e.clientX, r.left, r.right), y: r.top + r.height / 2 }
			: { x: r.left + r.width / 2, y: along(e.clientY, r.top, r.bottom) };
	}

	/**
	 * Show a zone at a point without a pointer (keyboard navigation).
	 * @param {GapTarget} zone
	 * @param {number} x
	 * @param {number} y
	 */
	show(zone, x, y) {
		clearTimeout(this.#timer);
		this.#timer = undefined;
		this.target = zone;
		this.lit = true;
		this.centred = false;
		this.x = x;
		this.y = y;
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
		if (this.nudge) {
			// the item the gap is expressed on makes room on that side (the menu's bar fills it)
			if (this.target?.id !== id) return '';
			const { place, axis } = this.target;
			if (axis === 'y') return place === 'before' ? 'mt-12' : 'mb-12';
			return place === 'before' ? 'ml-12' : 'mr-12';
		}
		return this.lit && this.target?.id === id && this.target.place !== 'inside' ? gapLineClass(this.target.place, this.target.axis) : '';
	}
}
