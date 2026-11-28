// How tag names are compared, shared by the app, the database schema and the import scripts.

/**
 * The characters all read as the apostrophe (') when names are compared: curly and straight quotes, primes, accents
 * typed in its place and the look-alike letters. Names are stored as written.
 * (Changing this list changes the generated column `tag.match_name`.)
 */
export const APOSTROPHES = '’‘‛ʼʻʽʹ′´`＇';

/** What a name is compared as: lower case, every kind of apostrophe alike. (The database does the same.) */
export const matchForm = (/** @type {string} */ name) =>
	name.replace(new RegExp(`[${APOSTROPHES}]`, 'gu'), "'").toLowerCase();

/** A typed name as it is stored: no stray spaces. */
export const cleanTagName = (/** @type {string} */ name) => name.trim().replace(/\s+/g, ' ');
