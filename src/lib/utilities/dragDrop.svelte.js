/**
 * Drag-and-drop state shared by the viewers. Draggable items carry `data-drop` (their id),
 * `data-kind` ("paragraph" | "section") and `data-axis` ("y" for items stacked
 * vertically, "x" for items side by side). While something is dragged, `over` works out
 * from the pointer which item it is over and where: near an item's leading or trailing
 * edge (or in the space between items) is a gap, shown as a violet line; the middle of an
 * item of the same kind is a merge, prepending (first half) or appending (second half).
 *
 * @typedef {import('#lib/utilities/editText.js').DropPlace} DropPlace
 */
/**
 * The draggable item under the pointer, or (when the pointer is in the space between
 * items) the nearest neighbour within `reach` pixels along the item axis.
 * @param {PointerEvent | DragEvent} e
 * @param {number} [reach]
 */
function findItem(e, reach = 8) {
	const { clientX: x, clientY: y } = e;
	let el = e.target instanceof Element ? e.target.closest('[data-drop]') : null;
	if (!el) {
		// nearest neighbour first, so a wide gap splits cleanly between the two bubbles beside it
		search: for (let d = 8; d <= Math.max(reach, 8); d += 4) {
			for (const [dx, dy, axis] of /** @type {const} */ ([[0, -d, 'y'], [0, d, 'y'], [-d, 0, 'x'], [d, 0, 'x']])) {
				const c = document.elementFromPoint(x + dx, y + dy)?.closest('[data-drop]');
				if (c instanceof HTMLElement && c.dataset.axis === axis) {
					el = c;
					break search;
				}
			}
		}
	}
	if (!(el instanceof HTMLElement)) return null;
	const r = el.getBoundingClientRect();
	const vertical = el.dataset.axis !== 'x';
	const size = Math.max(vertical ? r.height : r.width, 1);
	return { el, vertical, size, f: (vertical ? y - r.top : x - r.left) / size };
}

/**
 * Whether two items sit in the same row or column (DOM order alone is not enough where
 * an open item's children are laid out between it and its next sibling).
 * @param {HTMLElement} a @param {HTMLElement} b
 */
function sameLine(a, b) {
	if (a.dataset.axis !== b.dataset.axis) return false;
	const ra = a.getBoundingClientRect();
	const rb = b.getBoundingClientRect();
	return a.dataset.axis === 'x' ? Math.abs(ra.top - rb.top) < 2 : Math.abs(ra.left - rb.left) < 2;
}

/**
 * The space between two neighbours is one landing zone: "after A" is the same place as
 * "before B", so it is always expressed on B when B is A's next sibling.
 * @param {HTMLElement} el
 * @param {'before' | 'after'} place
 * @returns {{ id: string, place: 'before' | 'after' }}
 */
function normalizeGap(el, place) {
	if (place === 'after') {
		// the interstice elements between neighbours (`data-gap`) are not neighbours themselves
		let next = el.nextElementSibling;
		while (next instanceof HTMLElement && next.hasAttribute('data-gap')) next = next.nextElementSibling;
		if (next instanceof HTMLElement && next.dataset.drop && sameLine(el, next)) return { id: next.dataset.drop, place: 'before' };
	}
	return { id: el.dataset.drop ?? '', place };
}

/**
 * The interstitial landing zone under the pointer when nothing is being dragged: the
 * space between items or the thin edge of an item (the padding around its content).
 * @param {PointerEvent} e
 * @param {number} [reach] how far (px) from an item still counts as the space beside it
 * @returns {{ id: string, place: 'before' | 'after', axis: 'x' | 'y', at: { x: number, y: number } } | null}
 */
export function locateGap(e, reach = 8) {
	const hit = findItem(e, reach);
	if (!hit) return null;
	const edge = Math.min(6, hit.size * 0.25) / hit.size;
	if (hit.f >= edge && hit.f <= 1 - edge) return null;
	const gap = normalizeGap(hit.el, hit.f < 0.5 ? 'before' : 'after');
	return { ...gap, axis: hit.vertical ? 'y' : 'x', at: gapCentre(gap, hit.vertical) };
}

/** how wide (px) the hierarchical view opens an interstice while its inject menu is showing */
export const GAP_ROOM = 48;

/**
 * The on-screen box of a gap as the hierarchical view opens it (see GapHover's `nudge`): the
 * room made beside the bubble the gap is expressed on, out to its neighbour when there is one,
 * and as long as the bubbles are (cut to the viewport).
 * @param {{ id: string, place: 'before' | 'after', axis?: 'x' | 'y' }} gap
 * @param {number} [room] how much room the gap has beside a bubble with no neighbour
 * @returns {{ left: number, top: number, width: number, height: number } | null}
 */
export function gapBox(gap, room = GAP_ROOM) {
	const b = document.querySelector(`[data-drop="${CSS.escape(gap.id)}"]`);
	if (!(b instanceof HTMLElement)) return null;
	const rb = b.getBoundingClientRect();
	const a = gap.place === 'before' ? b.previousElementSibling : null;
	const ra = a instanceof HTMLElement && a.dataset.drop && sameLine(a, b) ? a.getBoundingClientRect() : null;
	const axis = gap.axis ?? (b.dataset.axis === 'x' ? 'x' : 'y');
	const clip = (/** @type {number} */ lo, /** @type {number} */ hi, /** @type {number} */ max) => [Math.max(lo, 0), Math.min(hi, max)];
	if (axis === 'y') {
		const [l, r] = clip(rb.left, rb.right, window.innerWidth);
		const t = gap.place === 'after' ? rb.bottom : ra ? ra.bottom : rb.top - room;
		const bt = gap.place === 'after' ? rb.bottom + room : rb.top;
		return { left: l, top: t, width: r - l, height: bt - t };
	}
	const [t, bt] = clip(rb.top, rb.bottom, window.innerHeight);
	const l = gap.place === 'after' ? rb.right : ra ? ra.right : rb.left - room;
	const r = gap.place === 'after' ? rb.right + room : rb.left;
	return { left: l, top: t, width: r - l, height: bt - t };
}

/**
 * The middle of a gap: halfway between the two bubbles either side of it (or at the single
 * bubble's edge), and centred on the bubbles across the other axis, so the menu never
 * depends on where the pointer happened to enter.
 * @param {{ id: string, place: 'before' | 'after' }} gap
 * @param {boolean} vertical whether the items are stacked vertically
 */
function gapCentre(gap, vertical) {
	const b = document.querySelector(`[data-drop="${CSS.escape(gap.id)}"]`);
	if (!(b instanceof HTMLElement)) return { x: 0, y: 0 };
	const rb = b.getBoundingClientRect();
	const a = gap.place === 'before' ? b.previousElementSibling : null;
	const ra = a instanceof HTMLElement && a.dataset.drop && sameLine(a, b) ? a.getBoundingClientRect() : null;
	const lo = Math.max(rb.top, 0);
	const hi = Math.min(rb.bottom, window.innerHeight);
	const lx = Math.max(rb.left, 0);
	const hx = Math.min(rb.right, window.innerWidth);
	if (vertical) {
		const edge = gap.place === 'before' ? (ra ? (ra.bottom + rb.top) / 2 : rb.top) : rb.bottom;
		return { x: (lx + hx) / 2, y: edge };
	}
	const edge = gap.place === 'before' ? (ra ? (ra.right + rb.left) / 2 : rb.left) : rb.right;
	return { x: edge, y: (lo + hi) / 2 };
}

/**
 * The classes that draw a gap's magenta line on the item it is expressed on.
 * @param {'before' | 'after'} place
 * @param {'x' | 'y'} axis
 */
export function gapLineClass(place, axis) {
	if (place === 'before') return axis === 'y' ? 'shadow-[0_-4px_0_0] shadow-taupe3' : 'shadow-[-4px_0_0_0] shadow-taupe3';
	return axis === 'y' ? 'shadow-[0_4px_0_0] shadow-taupe3' : 'shadow-[4px_0_0_0] shadow-taupe3';
}

export class DragDrop {
	/** @type {string | null} */
	dragId = $state(null);
	/** @type {'paragraph' | 'section' | null} */
	dragKind = null;
	/** @type {{ id: string, place: DropPlace } | null} */
	drop = $state(null);
	/** how far (px) from an item the pointer still counts as in the space beside it */
	reach = 8;
	/** whether a gap drop is drawn as a bar in the space (by the viewer) rather than a line on the bubble */
	gapBar = false;
	/** pointer position (for the tooltip that follows it) */
	x = $state(0);
	y = $state(0);

	/** what dropping here would do, for the tooltip */
	get label() {
		switch (this.drop?.place) {
			case 'before':
			case 'after':
				return 'Interject';
			case 'merge-before':
				return 'Prepend';
			case 'merge-after':
				return 'Append';
			default:
				return '';
		}
	}

	/**
	 * @param {string} id
	 * @param {'paragraph' | 'section'} kind
	 * @param {DragEvent} e
	 */
	start(id, kind, e) {
		this.dragId = id;
		this.dragKind = kind;
		if (e.dataTransfer) {
			e.dataTransfer.effectAllowed = 'move';
			e.dataTransfer.setData('text/plain', id);
			this.#icon(kind, e.dataTransfer);
		}
	}

	/**
	 * The grabbed item collapses into a large icon under the pointer: a section sign for a
	 * section, the Boxicons "paragraph" glyph for a paragraph.
	 * @param {'paragraph' | 'section'} kind
	 * @param {DataTransfer} dt
	 */
	#icon(kind, dt) {
		const el = document.createElement('div');
		el.style.cssText =
			'position:fixed;top:-200px;left:-200px;width:56px;height:56px;box-sizing:border-box;border:1px solid var(--color-taupe3);border-radius:16px;display:flex;align-items:center;justify-content:center;background:var(--color-taupe1);color:var(--color-taupe5);box-shadow:0 4px 6px -1px rgb(0 0 0 / 0.1);';
		el.innerHTML =
			kind === 'section'
				? '<span style="font:600 36px/1 Georgia, serif">§</span>'
				: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="36" height="36" fill="currentColor"><path d="M4 10c0 3.31 2.69 6 6 6h2v4h2V6h2v14h2V6h3V4H10c-3.31 0-6 2.69-6 6m8 4h-2c-2.21 0-4-1.79-4-4s1.79-4 4-4h2z"/></svg>';
		document.body.appendChild(el);
		dt.setDragImage(el, 50, 50); // cursor sits just inside the icon's bottom-right corner
		setTimeout(() => el.remove(), 0);
	}

	end() {
		this.dragId = null;
		this.dragKind = null;
		this.drop = null;
	}

	/**
	 * Update the drop target from a dragover event.
	 * @param {DragEvent} e
	 * @param {(id: string, targetId: string, place: DropPlace) => boolean} allowed
	 * @returns {boolean} whether the pointer is over a legal drop (the caller then cancels the event)
	 */
	over(e, allowed) {
		if (!this.dragId) return false;
		this.x = e.clientX;
		this.y = e.clientY;
		const hit = findItem(e, this.reach);
		if (!hit) return this.#set(null);
		const { el, size, f } = hit;
		const edge = Math.min(0.5, Math.max(6, Math.min(16, size * 0.25)) / size);
		const firstHalf = f < 0.5;
		/** @type {DropPlace} */
		let place;
		if (f < edge) place = 'before';
		else if (f > 1 - edge) place = 'after';
		else if (el.dataset.kind === this.dragKind) place = firstHalf ? 'merge-before' : 'merge-after';
		else place = firstHalf ? 'before' : 'after';

		let target = el.dataset.drop ?? '';
		if (place === 'before' || place === 'after') ({ id: target, place } = normalizeGap(el, place));
		return this.#set(allowed(this.dragId, target, place) ? { id: target, place } : null);
	}

	/** @param {{ id: string, place: DropPlace } | null} next */
	#set(next) {
		if (this.drop?.id !== next?.id || this.drop?.place !== next?.place) this.drop = next;
		return next !== null;
	}

	/**
	 * Classes for an item's drop highlight: a magenta line in the gap before/after it, or
	 * (for a merge) a violet outline with a thick bar on the side that gets the dragged item.
	 * @param {string} id
	 * @param {'x' | 'y'} axis
	 */
	classes(id, axis) {
		if (this.drop?.id !== id) return '';
		const y = axis === 'y';
		switch (this.drop.place) {
			case 'before':
			case 'after':
				return this.gapBar ? '' : gapLineClass(this.drop.place, axis);
			case 'merge-before':
				return y
					? 'outline-2 outline-violet bg-violet/10 shadow-[inset_0_3px_0_0] shadow-violet'
					: 'outline-2 outline-violet bg-violet/10 shadow-[inset_3px_0_0_0] shadow-violet';
			default:
				return y
					? 'outline-2 outline-violet bg-violet/10 shadow-[inset_0_-3px_0_0] shadow-violet'
					: 'outline-2 outline-violet bg-violet/10 shadow-[inset_-3px_0_0_0] shadow-violet';
		}
	}
}
