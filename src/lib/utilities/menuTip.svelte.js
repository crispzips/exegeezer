/**
 * Tooltips for the vertical menu, styled and behaving like the minimap tooltips: a dark
 * bubble to the left of the hovered button that appears at once, stays level with the
 * pointer while it moves over the button, and goes when it leaves.
 */
class MenuTip {
	text = $state('');
	/** pointer height (px from the top of the window) */
	y = $state(0);
	/** the bubble's right edge: just left of the hovered button (px from the left of the window) */
	x = $state(0);
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
		menuTip.owner = node;
		menuTip.text = text;
		menuTip.x = node.getBoundingClientRect().left;
		menuTip.y = e.clientY;
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
		}
	};
}
