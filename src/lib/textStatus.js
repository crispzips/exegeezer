/** How far along a text is. New texts start as drafts. */
export const PRODUCTION_STATUSES = ['idea', 'draft', 'under review', 'published'];
export const DEFAULT_PRODUCTION_STATUS = 'draft';

/** Who can see a text. Chosen by the user when the text is created. */
export const VISIBILITIES = ['private', 'public'];

/**
 * Who may comment on a text, from most to least restrictive. Each level includes the ones before it:
 * authors only; authors and those they invite; plus anyone who asks and is approved; anyone at all.
 */
export const COMMENT_POLICIES = ['authors', 'invitation', 'request', 'anyone'];
export const DEFAULT_COMMENT_POLICY = 'authors';
export const COMMENT_POLICY_LABELS = /** @type {Record<string, string>} */ ({
	authors: 'Authors only',
	invitation: 'Authors and by invitation',
	request: 'Authors, by invitation, and by request',
	anyone: 'Anyone'
});

/** Once a text is published and public it can't be altered at all (content, wiping, deleting, title, authors, status, visibility). */
export const LOCKED_MESSAGE = "A published, public text can't be altered.";

/** A text is publicized only when it is both published and public; its author persona is then locked in. */
export const isPublicized = (/** @type {{ productionStatus: string, visibility: string }} */ t) =>
	t.productionStatus === 'published' && t.visibility === 'public';

/** "A", "A and B", "A, B, and C" @param {string[]} names */
export const joinNames = (names) => (names.length < 3 ? names.join(' and ') : `${names.slice(0, -1).join(', ')}, and ${names[names.length - 1]}`);

/** "Paul Vieth's", "A and B's", "A, B, and C's": the authors, possessive (no authors: "Anonymous's") @param {string[]} names */
export const possessiveNames = (names) => `${joinNames(names.length ? names : ['Anonymous'])}'s`;

/** The name a new commentary is given: "Comment on <authors>'s <title>" @param {string[]} authors @param {string} title */
export const commentaryTitle = (authors, title) => `Comment on ${possessiveNames(authors)} ${title}`.slice(0, 200);
