import { redirect } from '@sveltejs/kit';

/** Settings is a tab of the profile page now; old links and bookmarks land on it. */
export const GET = () => redirect(307, '/profile?tab=settings');
