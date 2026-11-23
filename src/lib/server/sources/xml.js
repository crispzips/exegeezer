/**
 * Turn an XML document into simple HTML that html.js can read as Markdown, by renaming (or dropping) elements.
 * Each element is offered to `rule`, which answers:
 *   - an HTML tag name ("p", "h3", "i", ...) to use in its place,
 *   - '' to keep its content but add no tag of its own,
 *   - null to drop it and everything inside it.
 */

const TOKEN = /<!--[\s\S]*?-->|<\?[\s\S]*?\?>|<!DOCTYPE[\s\S]*?>|<!\[CDATA\[([\s\S]*?)\]\]>|<(\/?)([A-Za-z_][\w.:-]*)((?:"[^"]*"|'[^']*'|[^>"'])*?)(\/?)>|([^<]+)/gi;
const ATTR = /([\w:.-]+)\s*=\s*(?:"([^"]*)"|'([^']*)')/g;

/** @param {string} s */
const escapeText = (s) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

/**
 * @param {string} xml
 * @param {(name: string, attrs: Record<string, string>, ancestors: string[]) => string | null} rule
 * @returns {string}
 */
export function xmlToHtml(xml, rule) {
	let out = '';
	/** @type {{ name: string, tag: string, skipped: boolean }[]} */
	const stack = [];
	let skipping = 0;
	/** @type {RegExpExecArray | null} */
	let m;
	TOKEN.lastIndex = 0;
	while ((m = TOKEN.exec(xml))) {
		const [token, cdata, closing, name, rawAttrs, selfClosing, text] = m;
		if (text !== undefined) {
			if (!skipping) out += text;
		} else if (cdata !== undefined) {
			if (!skipping) out += escapeText(cdata);
		} else if (name && closing) {
			let i = stack.length - 1;
			while (i >= 0 && stack[i].name !== name) i--;
			if (i < 0) continue;
			while (stack.length > i) {
				const el = /** @type {{ name: string, tag: string, skipped: boolean }} */ (stack.pop());
				if (el.skipped) skipping--;
				else if (el.tag) out += `</${el.tag}>`;
			}
		} else if (name) {
			if (skipping) {
				if (!selfClosing) {
					stack.push({ name, tag: '', skipped: true });
					skipping++;
				}
				continue;
			}
			/** @type {Record<string, string>} */
			const attrs = {};
			for (const a of rawAttrs.matchAll(ATTR)) attrs[a[1]] = a[2] ?? a[3] ?? '';
			const tag = rule(
				name,
				attrs,
				stack.map((e) => e.name)
			);
			if (selfClosing) {
				if (tag === 'br') out += '<br>';
				continue;
			}
			if (tag === null) {
				stack.push({ name, tag: '', skipped: true });
				skipping++;
				continue;
			}
			stack.push({ name, tag, skipped: false });
			if (tag) out += `<${tag}>`;
		} else if (!token.startsWith('<')) {
			if (!skipping) out += token;
		}
	}
	return out;
}
