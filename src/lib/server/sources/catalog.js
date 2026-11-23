/**
 * Where else to find open-access texts, and how each place wants to be used.
 *
 * `OPEN_SOURCES` are the places that invite programmatic access (a public API, and no rule
 * against automated clients); exegeezer searches and imports from them directly.
 *
 * `HUMAN_SOURCES` are places that ask for human visitors, require a key or a login, offer only
 * metadata, or publish no API. exegeezer never fetches from them: it lists them, and links to
 * each one's own instructions, so a person can fetch a text there and upload the file instead.
 * Verified 2026-11-22; check each place's own pages for current terms.
 */

/** @typedef {{ id: string, name: string, kind: string, description: string, searchHint: string, homepage: string, docs: string, needsContact?: boolean, structured?: boolean }} OpenSource */
/* `structured`: the text is imported with real headings (chapters, sections), not just a title and plain paragraphs */
/** @typedef {{ id: string, name: string, kind: string, description: string, why: string, homepage: string, instructions: { label: string, url: string }[] }} HumanSource */

/** @type {OpenSource[]} */
export const OPEN_SOURCES = [
	{
		id: 'internet-archive',
		name: 'Internet Archive',
		kind: 'Books and documents',
		description: 'Millions of scanned books, pamphlets and periodicals. Only openly downloadable items are offered (lending-library scans are left out). Text is machine-scanned, so expect some errors.',
		searchHint: 'Title or author',
		homepage: 'https://archive.org/',
		docs: 'https://archive.org/developers/'
	},
	{
		id: 'wikisource',
		name: 'Wikisource',
		kind: 'Literature, poems, speeches, documents',
		description: 'Volunteer-proofread public-domain texts (English edition). A work made of many chapter pages is imported whole, chapter by chapter.',
		searchHint: 'Title of a work',
		homepage: 'https://en.wikisource.org/',
		docs: 'https://www.mediawiki.org/wiki/API:Etiquette',
		structured: true,
		needsContact: true // Wikimedia throttles automated clients that give no contact in their User-Agent
	},
	{
		id: 'poetrydb',
		name: 'PoetryDB',
		kind: 'Poetry',
		description: 'A free database of a few thousand English poems by classic poets.',
		searchHint: 'Poem title or poet',
		homepage: 'https://poetrydb.org/',
		docs: 'https://github.com/thundercomb/poetrydb#readme'
	},
	{
		id: 'wikibooks',
		name: 'Wikibooks',
		kind: 'Open textbooks and manuals',
		description: 'Free, collaboratively written textbooks (English edition). A book is imported whole, chapter by chapter, up to 100 chapters.',
		searchHint: 'Title of a book or subject',
		homepage: 'https://en.wikibooks.org/',
		docs: 'https://www.mediawiki.org/wiki/API:Etiquette',
		structured: true,
		needsContact: true // same Wikimedia rule as Wikisource
	},
	{
		id: 'federal-register',
		name: 'Federal Register',
		kind: 'US rules, notices and presidential documents',
		description: 'The daily journal of the US government: proposed and final rules, agency notices, executive orders. Government works are in the public domain.',
		searchHint: 'Topic, agency or title',
		homepage: 'https://www.federalregister.gov/',
		docs: 'https://www.federalregister.gov/developers/documentation/api/v1',
		structured: true
	},
	{
		id: 'ecfr',
		name: 'eCFR',
		kind: 'US federal regulations (Code of Federal Regulations)',
		description: 'The current text of US federal regulations, section by section. Tick several sections to string them together in order. An unofficial, continuously updated edition.',
		searchHint: 'Words in a regulation',
		homepage: 'https://www.ecfr.gov/',
		docs: 'https://www.ecfr.gov/developers/documentation/api/v1',
		structured: true
	},
	{
		id: 'pubmed',
		name: 'PubMed',
		kind: 'Open-access medical and life-science articles',
		description: 'Full-text research articles from PubMed Central’s open-access subset (PubMed itself holds only abstracts, which are not included). Each keeps its own license, shown in the imported details, and some forbid commercial reuse.',
		searchHint: 'Topic, title or author',
		homepage: 'https://pmc.ncbi.nlm.nih.gov/',
		docs: 'https://www.ncbi.nlm.nih.gov/books/NBK25497/',
		structured: true
	},
	{
		id: 'devdocs',
		name: 'DevDocs',
		kind: 'Programming documentation',
		description: 'The documentation of a few hundred languages, libraries and tools in one place (JavaScript, Python, Svelte, CSS, Node and more). Search a name for its whole documentation or a section of it, or a name and a topic (like "react hooks") for single pages. Code stays as code. Each project’s own license applies.',
		searchHint: 'A language or library, then optionally a topic',
		homepage: 'https://devdocs.io/',
		docs: 'https://github.com/freeCodeCamp/devdocs#readme',
		structured: true
	},
	{
		id: 'markdown-docs',
		name: 'Markdown docs',
		kind: 'Programming documentation, as the sites publish it',
		description: 'Documentation sites that publish their docs as plain Markdown: a guide listing the pages (at /llms.txt on the site) and sometimes everything in one file. Search a site’s name (Svelte, Stripe, Vite…) or its address (svelte.dev). Only sites that have published a guide work.',
		searchHint: 'A documentation site’s name or address',
		homepage: 'https://llmstxt.org/',
		docs: 'https://llmstxt.org/',
		structured: true
	}
];

/** @type {HumanSource[]} */
export const HUMAN_SOURCES = [
	{
		id: 'gutenberg',
		name: 'Project Gutenberg',
		kind: 'Literature and non-fiction',
		description: 'Over 70,000 public-domain books, many as plain text, the best-known source of its kind.',
		why: 'Its terms of use say the site is intended for human users and that automated tools may get an IP address blocked. For bulk or programmatic use it points to its downloadable catalog files.',
		homepage: 'https://www.gutenberg.org/',
		instructions: [
			{ label: 'Terms of use', url: 'https://www.gutenberg.org/policy/terms_of_use.html' },
			{ label: 'Robot access policy', url: 'https://www.gutenberg.org/policy/robot_access.html' },
			{ label: 'Offline catalogs and feeds', url: 'https://www.gutenberg.org/ebooks/offline_catalogs.html' }
		]
	},
	{
		id: 'standard-ebooks',
		name: 'Standard Ebooks',
		kind: 'Carefully edited classics',
		description: 'Public-domain books, typeset and proofread to a high standard, free to download.',
		why: 'Its robots.txt asks automated agents to stay away from the book text and download pages, and its OPDS catalog and bulk downloads are for Patrons. Download a book by hand, or use the project’s source repositories on GitHub.',
		homepage: 'https://standardebooks.org/',
		instructions: [
			{ label: 'Robots rules', url: 'https://standardebooks.org/robots.txt' },
			{ label: 'Source code and books on GitHub', url: 'https://github.com/standardebooks' }
		]
	},
	{
		id: 'hathitrust',
		name: 'HathiTrust Digital Library',
		kind: 'Scanned library books',
		description: 'A very large collection of digitised library books, with many public-domain volumes.',
		why: 'The Data API that served page text was retired in 2024. Text is available as datasets for researchers, on request.',
		homepage: 'https://www.hathitrust.org/',
		instructions: [{ label: 'Datasets for researchers', url: 'https://www.hathitrust.org/datasets' }]
	},
	{
		id: 'dpla',
		name: 'Digital Public Library of America',
		kind: 'Aggregated library and archive items',
		description: 'A search across thousands of American libraries and archives.',
		why: 'Its API returns catalogue records (metadata) and links, not texts, and needs a personal API key.',
		homepage: 'https://dp.la/',
		instructions: [{ label: 'Developer information', url: 'https://pro.dp.la/developers' }]
	},
	{
		id: 'perseus',
		name: 'Perseus Digital Library / Scaife Viewer',
		kind: 'Greek and Latin classics',
		description: 'Classical texts and translations, mostly as TEI XML.',
		why: 'There is no text API for the site; the texts are published as XML files in GitHub repositories, which need converting.',
		homepage: 'https://scaife.perseus.org/',
		instructions: [
			{ label: 'Greek literature on GitHub', url: 'https://github.com/PerseusDL/canonical-greekLit' },
			{ label: 'Latin literature on GitHub', url: 'https://github.com/PerseusDL/canonical-latinLit' }
		]
	},
	{
		id: 'sacred-texts',
		name: 'Internet Sacred Text Archive',
		kind: 'Religion, myth and folklore',
		description: 'Public-domain translations of scriptures and traditional texts.',
		why: 'No public API is published; the site is plain pages meant for reading.',
		homepage: 'https://sacred-texts.com/',
		instructions: [{ label: 'About the archive', url: 'https://sacred-texts.com/' }]
	}
];
