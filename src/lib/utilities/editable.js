/** A paragraph is one line of text: any run of line breaks becomes a single space. @param {string} s */
export const oneLine = (s) => s.replace(/\s*[\r\n\u2028\u2029]+\s*/g, ' ');

/**
 * Svelte action: turn an element into an in-place plain-text editor. It is filled with
 * `text`, focused, and given a caret at character `caret` (default: the end). Leaving it (blur, or Ctrl/Cmd+Enter)
 * commits; Escape cancels. `onfinish` gets the new text, or null when cancelled or unchanged.
 *
 * There are no line breaks in a paragraph: Enter finishes the edit (committing it) and, when the
 * text was changed, calls `onenter`, which starts the next paragraph (an untouched paragraph just
 * ends); pasted line breaks become spaces.
 *
 * @param {HTMLElement} node
 * @param {{ text: string, caret?: number, onfinish: (text: string | null) => void, onenter?: () => void }} opts
 */
export function editable(node, { text, caret, onfinish, onenter }) {
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
		const next = oneLine(node.textContent ?? '');
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
		} else if (e.key === 'Enter' && !e.isComposing) {
			e.preventDefault(); // never a line break: the paragraph ends and the next one begins
			const changed = oneLine(node.textContent ?? '') !== text;
			finish(true);
			if (changed) onenter?.();
		}
	}

	/** @param {InputEvent} e */
	function onbeforeinput(e) {
		if (e.inputType === 'insertParagraph' || e.inputType === 'insertLineBreak') e.preventDefault();
	}

	/** @param {ClipboardEvent} e */
	function onpaste(e) {
		e.preventDefault(); // paste as plain text even where plaintext-only is unsupported
		document.execCommand('insertText', false, oneLine(e.clipboardData?.getData('text/plain') ?? ''));
	}

	const onblur = () => finish(true);
	node.addEventListener('keydown', onkeydown);
	node.addEventListener('paste', onpaste);
	node.addEventListener('beforeinput', onbeforeinput);
	node.addEventListener('blur', onblur);
	return {
		destroy() {
			node.removeEventListener('keydown', onkeydown);
			node.removeEventListener('paste', onpaste);
			node.removeEventListener('beforeinput', onbeforeinput);
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

/**
 * Svelte action for a paragraph's body `<textarea>`: no line breaks. Enter does nothing, and any
 * that arrive by paste or drop become spaces. (The input event updates `bind:value` as usual.)
 * @param {HTMLTextAreaElement} node
 */
export function noLineBreaks(node) {
	/** @param {KeyboardEvent} e */
	function onkeydown(e) {
		if (e.key === 'Enter' && !e.isComposing && !(e.metaKey || e.ctrlKey)) e.preventDefault();
	}
	function oninput() {
		const clean = oneLine(node.value);
		if (clean === node.value) return;
		const at = node.selectionStart - (node.value.length - clean.length);
		node.value = clean;
		node.setSelectionRange(Math.max(0, at), Math.max(0, at));
		node.dispatchEvent(new Event('input', { bubbles: true })); // let bind:value see the cleaned text
	}
	node.addEventListener('keydown', onkeydown);
	node.addEventListener('input', oninput);
	return {
		destroy() {
			node.removeEventListener('keydown', onkeydown);
			node.removeEventListener('input', oninput);
		}
	};
}
