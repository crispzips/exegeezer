import { createMediaWikiSource } from './mediawiki.js';

/** Wikisource: volunteer-proofread public-domain texts. */
export const { search, text } = createMediaWikiSource({
	host: 'en.wikisource.org',
	name: 'Wikisource',
	license: 'Public domain texts; transcriptions are CC BY-SA 4.0',
	rights: 'The works are in the public domain; the transcription is by Wikisource contributors and licensed CC BY-SA 4.0.',
	contentsPageWords: 3000
});
