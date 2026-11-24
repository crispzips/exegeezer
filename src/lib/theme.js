/** The appearance themes: taupe is the original. Kept in localStorage; app.html applies it before first paint. */
export const THEMES = /** @type {const} */ ([
	{ id: 'taupe', label: 'Taupe', hint: 'Warm parchment', credit: [{ text: 'Solarized Light', url: 'https://ethanschoonover.com/solarized/', by: 'Ethan Schoonover' }] },
	{ id: 'soft', label: 'Soft', hint: 'Rosé Pine Dawn', credit: [{ text: 'Rosé Pine Dawn', url: 'https://rosepinetheme.com/palette/', by: 'the Rosé Pine project' }] },
	{ id: 'rose', label: 'Rose', hint: 'Catppuccin Frappé, inverted', credit: [{ text: 'Catppuccin Frappé and Latte', url: 'https://catppuccin.com/palette/', by: 'the Catppuccin project' }] },
	{ id: 'dark', label: 'Dark', hint: 'Solarized Dark', credit: [{ text: 'Solarized Dark', url: 'https://ethanschoonover.com/solarized/', by: 'Ethan Schoonover' }] },
	{ id: 'cyber', label: 'Cyber', hint: 'Neon green on near-black' },
	{ id: 'fluorescent', label: 'Fluorescent', hint: 'Bright white, black text, rainbow accents' }
]);

const KEY = 'exegeezer-theme';

/** @returns {string} the theme in effect */
export function currentTheme() {
	return document.documentElement.dataset.theme || 'taupe';
}

/** Switch the whole app to a theme and remember it. @param {string} id */
export function setTheme(id) {
	document.documentElement.dataset.theme = id;
	try {
		localStorage.setItem(KEY, id);
	} catch {
		// storage blocked: the theme still applies for this visit
	}
}
