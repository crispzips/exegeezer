/**
 * Svelte action: turn an element into an in-place plain-text editor. It is filled with
 * `text`, focused, and given a caret at character `caret` (default: the end). Leaving it (blur, or Ctrl/Cmd+Enter)
 * commits; Escape cancels. `onfinish` gets the new text, or null when cancelled or unchanged.
 *
 * @param {HTMLElement} node
 * @param {{ text: string, caret?: number, onfinish: (text: string | null) => void }} opts
 */
export function editable(node, { text, caret, onfinish }) {
	node.contentEditable = 'plaintext-only';
	if (node.contentEditable !== 'plaintext-only') node.contentEditable = 'true'; // older browsers
	node.textContent = text;
	node.focus();
	const range = document.createRange();
	if (caret !== undefined && node.firstChild) {
		range.setStart(node.firstChild, Math.max(0, Math.min(caret, text.length)));
		range.collapse(true);
	} else {
		range.selectNodeContents(node);
		range.collapse(false);
	}
	const sel = getSelection();
	sel?.removeAllRanges();
	sel?.addRange(range);

	let done = false;
	/** @param {boolean} commit */
	function finish(commit) {
		if (done) return;
		done = true;
		const next = node.textContent ?? '';
		onfinish(commit && next !== text ? next : null);
	}

	/** @param {KeyboardEvent} e */
	function onkeydown(e) {
		e.stopPropagation();
		if (e.key === 'Escape') {
			finish(false);
		} else if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
			e.preventDefault();
			finish(true);
		}
	}

	/** @param {ClipboardEvent} e */
	function onpaste(e) {
		e.preventDefault(); // paste as plain text even where plaintext-only is unsupported
		document.execCommand('insertText', false, e.clipboardData?.getData('text/plain') ?? '');
	}

	const onblur = () => finish(true);
	node.addEventListener('keydown', onkeydown);
	node.addEventListener('paste', onpaste);
	node.addEventListener('blur', onblur);
	return {
		destroy() {
			node.removeEventListener('keydown', onkeydown);
			node.removeEventListener('paste', onpaste);
			node.removeEventListener('blur', onblur);
		}
	};
}

/**
 * The character offset, in a paragraph's text, nearest to a point on screen (a
 * double-click). The point is first clamped into the text's box, so a click in the padding
 * beside or below the text picks the nearest edge.
 * @param {Element} row the element containing the paragraph's `<p>`
 * @param {number} x
 * @param {number} y
 * @param {string} text the paragraph's text
 */
export function caretOffsetAt(row, x, y, text) {
	const p = row.querySelector('p');
	if (!p || !text) return 0;
	const r = p.getBoundingClientRect();
	const cx = Math.max(r.left + 1, Math.min(x, r.right - 1));
	const cy = Math.max(r.top + 1, Math.min(y, r.bottom - 1));
	/** @type {Node | null} */
	let node = null;
	let offset = 0;
	if (document.caretPositionFromPoint) {
		const pos = document.caretPositionFromPoint(cx, cy);
		if (pos) ({ offsetNode: node, offset } = pos);
	} else if (document.caretRangeFromPoint) {
		const rg = document.caretRangeFromPoint(cx, cy);
		if (rg) ({ startContainer: node, startOffset: offset } = rg);
	}
	if (!node || !p.contains(node)) return text.length;
	const before = document.createRange();
	before.selectNodeContents(p);
	before.setEnd(node, offset);
	return before.toString().length;
}
