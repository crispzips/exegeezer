import { createMediaWikiSource } from './mediawiki.js';

/** Wikibooks: open textbooks and manuals. A book's own page is an introduction and a list of chapters. */
export const { search, text } = createMediaWikiSource({
	host: 'en.wikibooks.org',
	name: 'Wikibooks',
	license: 'CC BY-SA 4.0',
	rights: 'Written by Wikibooks contributors; licensed CC BY-SA 4.0, so reuse must credit them and share alike.',
	contentsPageWords: 20000,
	gatherAlways: true,
	skipParts: /\/(Print version|Authors|Contributors|Licensing|Index|Contents|Table of contents|Appendices)$/i
});
