/** Plain helpers on a text's list of paragraphs and section headers. */

/** The list as it is sent to the database and compared against what was last saved.
 * @param {{ id: string, text: string, level: number, frontmatter?: boolean, backmatter?: boolean, title?: string, description?: string }[]} list */
export const toItems = (list) =>
    list.map(({ id, text, level, frontmatter, backmatter, title, description }) => ({
        id,
        text,
        level,
        frontmatter: !!frontmatter,
        backmatter: !!backmatter,
        ...(level === 0 && title ? { title } : {}),
        ...(level === 0 && description ? { description } : {})
    }));

/**
 * Put the text above the first header into a section called "Frontmatter".
 * The section is a header at the shallowest header level present, placed first.
 * @param {{ id: string, originalIndex: number, text: string, level: number, children?: unknown[] }[]} list
 */
export function withFrontmatter(list) {
    const headers = list.filter((p) => p.level > 0).map((p) => p.level);
    const level = headers.length ? Math.min(...headers) : 1;
    const header = {
        id: crypto.randomUUID(),
        originalIndex: 0,
        text: `${'#'.repeat(level)} Frontmatter`,
        level,
        frontmatter: true,
        children: []
    };
    return [header, ...list].map((p, i) => ({ ...p, originalIndex: i }));
}

/** The start of a long passage, for a confirmation message. @param {string} text */
export const excerptOf = (text) => (text.length > 160 ? text.slice(0, 160) + '…' : text);
