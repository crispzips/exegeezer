/**
 * Tooltips for the vertical menu, styled and behaving like the minimap tooltips: a taupe
 * bubble to the left of the hovered button that appears at once, stays level with the
 * pointer while it moves over the button, and goes when it leaves.
 */
class MenuTip {
	text = $state('');
	/** pointer height (px from the top of the window) */
	y = $state(0);
	/** the bubble's right edge: just left of the hovered button (px from the left of the window) */
	x = $state(0);
	/** the hovered button's horizontal centre and bottom edge (for tooltips placed below it) */
	cx = $state(0);
	bottom = $state(0);
	/** 'left' of the button (the default, for the vertical menu) or 'below' it (set with `data-tip-place="below"`) */
	place = $state('left');
	/** @type {HTMLElement | null} */
	owner = null;
}

export const menuTip = new MenuTip();

/**
 * Svelte action: show `text` as this element's tooltip while it is hovered.
 * @param {HTMLElement} node
 * @param {string} text
 */
export function tip(node, text) {
	/** @param {PointerEvent} e */
	function show(e) {
		// a button whose pop-out is open has its tooltip closed, so it does not cover the pop-out
		if (node.getAttribute('aria-expanded') === 'true') return hide();
		menuTip.owner = node;
		menuTip.text = text;
		menuTip.x = node.getBoundingClientRect().left;
		menuTip.y = e.clientY;
		const box = node.getBoundingClientRect();
		menuTip.cx = box.left + box.width / 2;
		menuTip.bottom = box.bottom;
		menuTip.place = node.dataset.tipPlace === 'below' ? 'below' : 'left';
	}
	function hide() {
		if (menuTip.owner === node) {
			menuTip.owner = null;
			menuTip.text = '';
		}
	}
	node.addEventListener('pointerenter', show);
	node.addEventListener('pointermove', show);
	node.addEventListener('pointerleave', hide);
	if (node.hasAttribute('aria-haspopup')) node.addEventListener('click', hide); // opening a pop-out closes the tooltip at once
	return {
		/** @param {string} next */
		update(next) {
			text = next;
			if (menuTip.owner === node) menuTip.text = next;
		},
		destroy() {
			hide();
			node.removeEventListener('pointerenter', show);
			node.removeEventListener('pointermove', show);
			node.removeEventListener('pointerleave', hide);
			node.removeEventListener('click', hide);
		}
	};
}
