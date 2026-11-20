/**
 * The example text signed-out visitors see: a read-only stand-in until the real one is written.
 * The real example will explain the app and demonstrate its properties by being the kind of
 * super text only this app can hold (one text read as a linear page, a tree of sections and a
 * cascade of bubbles at once; paragraphs and sections reused across texts; front and back matter).
 */
export const EXAMPLE_TITLE = 'Exegeezer: an example text';

/** @type {{ id: string, text: string, level: number, frontmatter?: boolean, backmatter?: boolean }[]} */
const items = [
	{ text: '# About this text', level: 1, frontmatter: true },
	{ text: 'This is a placeholder. The finished example text will explain Exegeezer and show what it does by being the kind of text that can only live here.', level: 0 },
	{ text: '# One text, three views', level: 1 },
	{ text: 'The same text reads as a linear page, as a hierarchy of sections, and as a cascade of bubbles. Change the view from the menu on the right and notice that the view you leave and the view you open stay centred on the same place.', level: 0 },
	{ text: '## Sections inside sections', level: 2 },
	{ text: 'A section runs until the next header of the same or a higher level, so a second-level section lives inside the first-level section above it.', level: 0 },
	{ text: '## Minimaps', level: 2 },
	{ text: 'Every view has a map of the whole text. Click anywhere on one and the text goes there.', level: 0 },
	{ text: '# Make it yours', level: 1 },
	{ text: 'Sign in or sign up to load your own texts, edit them, and keep them.', level: 0 },
	{ text: '# Notes', level: 1, backmatter: true },
	{ text: 'Front and back matter stay out of the maps and the numbering, but are always one click away.', level: 0 }
];

export const EXAMPLE_ITEMS = items.map((item, i) => ({ ...item, id: `example-${i}`, originalIndex: i }));
