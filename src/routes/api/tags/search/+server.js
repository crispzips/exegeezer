import { json, error } from '@sveltejs/kit';
import { searchGlobalTags } from '#lib/server/tags.js';

/** Global tags that might serve for what is being typed: `?q=`. */
export async function GET({ url, locals }) {
	if (!locals.user) error(401, 'Sign in to use tags');
	return json({ tags: await searchGlobalTags(url.searchParams.get('q') ?? '') });
}
