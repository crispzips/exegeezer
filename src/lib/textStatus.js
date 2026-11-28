/**
 * How far along a text is. New texts start as manuscripts. A private text can be circulated (shared with chosen users
 * and groups) but never published; only a public text is published. A published, public text (a publication) can later
 * be repressed: recanted or burned. Those two are set by repressing, never chosen from a list.
 */
export const PRODUCTION_STATUSES = ['idea', 'manuscript', 'under review', 'circulated', 'published', 'recanted', 'burned'];
export const DEFAULT_PRODUCTION_STATUS = 'manuscript';
/** the statuses a text's settings can choose among */
export const CHOOSABLE_STATUSES = ['idea', 'manuscript', 'under review', 'circulated', 'published'];

/** Who can see a text. Chosen by the user when the text is created. */
export const VISIBILITIES = ['private', 'public'];

/** What someone a text is circulated to may do with it. Neither lets them edit it. */
export const PRIVILEGES = ['read', 'comment'];

/**
 * Who may comment on a text, from most to least restrictive. Each level includes the ones before it:
 * authors only; authors and those they invite; plus anyone who asks and is approved; anyone at all.
 * (Those a text was circulated to with comment privileges count as invited; editors are with the authors.)
 */
export const COMMENT_POLICIES = ['authors', 'invitation', 'request', 'anyone'];
export const DEFAULT_COMMENT_POLICY = 'authors';
export const COMMENT_POLICY_LABELS = /** @type {Record<string, string>} */ ({
	authors: 'Authors only',
	invitation: 'Authors and by invitation',
	request: 'Authors, by invitation, and by request',
	anyone: 'Anyone'
});

/** @typedef {{ productionStatus: string, visibility: string, type?: string }} Standing */

/** A publication: public and published. It is never deleted. @param {Standing} t */
export const isPublication = (t) => t.visibility === 'public' && t.productionStatus === 'published';

/** A palimpsest: what is left of a repressed publication. Its head (metadata) and tail (commentaries) remain. @param {Standing} t */
export const isPalimpsest = (t) => t.visibility === 'public' && (t.productionStatus === 'recanted' || t.productionStatus === 'burned');

/** A publication or a palimpsest: it is in the public record for good, and can't be deleted. @param {Standing} t */
export const isPermanent = (t) => isPublication(t) || isPalimpsest(t);

/**
 * Whether a text's words can't be changed. A publication or palimpsest is locked. A published commentary is not locked
 * as a whole: each of its public paragraphs is, and the rest stay open (until the commentary itself is repressed).
 * @param {Standing} t
 */
export const isLocked = (t) => (t.type === 'commentary' ? isPalimpsest(t) : isPermanent(t));

export const LOCKED_MESSAGE = "A published, public text can't be altered. It can only be repressed.";
export const PUBLIC_MEMORY_MESSAGE = "A public comment on a published text has entered public memory: it can't be changed, hidden or deleted.";

/** "A", "A and B", "A, B, and C" @param {string[]} names */
export const joinNames = (names) => (names.length < 3 ? names.join(' and ') : `${names.slice(0, -1).join(', ')}, and ${names[names.length - 1]}`);

/** "Paul Vieth's", "A and B's", "A, B, and C's": the authors, possessive (no authors: "Anonymous's") @param {string[]} names */
export const possessiveNames = (names) => `${joinNames(names.length ? names : ['Anonymous'])}'s`;

/** The name a new commentary is given: "Commentary on <authors>'s <title>" @param {string[]} authors @param {string} title */
export const commentaryTitle = (authors, title) => `Commentary on ${possessiveNames(authors)} ${title}`.slice(0, 200);
