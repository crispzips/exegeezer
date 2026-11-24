/** A paragraph is one line of text: any run of line breaks becomes a single space. @param {string} s */
export const oneLine = (s) => s.replace(/\s*[\r\n\u2028\u2029]+\s*/g, ' ');

/**
 * Svelte action: turn an element into an in-place plain-text editor. It is filled with
 * `text`, focused, and given a caret at character `caret` (default: the end). Leaving it (blur, or Ctrl/Cmd+Enter)
 * commits; Escape cancels. `onfinish` gets the new text, or null when cancelled or unchanged.
 *
 * There are no line breaks in a paragraph (except in a code block, whose lines are kept: there Enter makes a new line and
 * Ctrl/Cmd+Enter finishes): Enter finishes the edit (committing it) and, when the
 * text was changed, calls `onenter` (with where the editor was), which asks what to add next (an untouched paragraph just
 * ends); pasted line breaks become spaces.
 *
 * @param {HTMLElement} node
 * @param {{ text: string, caret?: number, onfinish: (text: string | null) => void, onenter?: (rect: DOMRect) => void, markdown?: boolean }} opts
 */
export function editable(node, { text, caret, onfinish, onenter, markdown = false }) {
	/** a code block is several lines: its line breaks are kept */
	const multiline = text.includes('\n');
	const clean = (/** @type {string} */ s) => (multiline ? s : oneLine(s));
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

	// With `markdown`, the line is shown formatted as it will render: a # header takes the header's size and weight,
	// a quote or list item its marker's styling (see `.md-edit` in app.css), updating as the text is typed.
	function format() {
		const t = node.textContent ?? '';
		const h = t.match(/^(#{1,6})\s/);
		if (h) node.dataset.h = String(h[1].length);
		else delete node.dataset.h;
		node.toggleAttribute('data-quote', /^>\s/.test(t));
		node.toggleAttribute('data-list', /^(?:[-*+]|\d+[.)])\s/.test(t));
	}
	if (markdown) {
		node.classList.add('md-edit');
		format();
		node.addEventListener('input', format);
	}

	let done = false;
	/** @param {boolean} commit */
	function finish(commit) {
		if (done) return;
		done = true;
		const next = clean(node.textContent ?? '');
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
		} else if (e.key === 'Enter' && !e.isComposing && !multiline) {
			e.preventDefault(); // never a line break: the paragraph ends and the next one begins
			const changed = clean(node.textContent ?? '') !== text;
			const rect = caretRect(node); // the editor goes once the edit ends: note where the caret was
			finish(true);
			if (changed) onenter?.(rect);
		}
	}

	/** @param {InputEvent} e */
	function onbeforeinput(e) {
		if (!multiline && (e.inputType === 'insertParagraph' || e.inputType === 'insertLineBreak')) e.preventDefault();
	}

	/** @param {ClipboardEvent} e */
	function onpaste(e) {
		e.preventDefault(); // paste as plain text even where plaintext-only is unsupported
		document.execCommand('insertText', false, clean(e.clipboardData?.getData('text/plain') ?? ''));
	}

	const onblur = () => finish(true);
	node.addEventListener('keydown', onkeydown);
	node.addEventListener('paste', onpaste);
	node.addEventListener('beforeinput', onbeforeinput);
	node.addEventListener('blur', onblur);
	return {
		destroy() {
			node.removeEventListener('input', format);
			node.removeEventListener('keydown', onkeydown);
			node.removeEventListener('paste', onpaste);
			node.removeEventListener('beforeinput', onbeforeinput);
			node.removeEventListener('blur', onblur);
		}
	};
}

/**
 * Where the caret is on screen (a rectangle as tall as the line, at the caret), or the editor's own corner when
 * the caret has no box (an empty editor).
 * @param {HTMLElement} node
 * @returns {DOMRect}
 */
function caretRect(node) {
	const sel = getSelection();
	if (sel?.rangeCount && node.contains(sel.anchorNode)) {
		const range = sel.getRangeAt(0).cloneRange();
		range.collapse(false);
		const boxes = range.getClientRects();
		const r = boxes.length ? boxes[boxes.length - 1] : range.getBoundingClientRect();
		if (r.height > 0) return r;
	}
	const r = node.getBoundingClientRect();
	return new DOMRect(r.left, r.top, 0, r.height);
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
	if (node.value.includes('\n')) return; // a code block keeps its lines
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
