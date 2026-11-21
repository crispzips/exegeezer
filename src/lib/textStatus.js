/** How far along a text is. New texts start as drafts. */
export const PRODUCTION_STATUSES = ['idea', 'draft', 'under review', 'published'];
export const DEFAULT_PRODUCTION_STATUS = 'draft';

/** Who can see a text. Chosen by the user when the text is created. */
export const VISIBILITIES = ['private', 'public'];

/** A text is publicized only when it is both published and public; its author persona is then locked in. */
export const isPublicized = (/** @type {{ productionStatus: string, visibility: string }} */ t) =>
	t.productionStatus === 'published' && t.visibility === 'public';
