import { THEMES } from './theme.js';

/**
 * Each persona's colour in each appearance theme: one of the theme's own hues, picked at random when the persona
 * is made and stored on it (`persona.theme_colors`), e.g. { taupe: 'red', soft: 'blue', ... }. Colours belong to
 * personae, not users, so that they never say which user has a persona. A user is shown in their "self"'s.
 * @typedef {Record<string, string>} ThemeColors
 */

/** the hues every theme defines (as `--color-<hue>`) */
export const HUES = ['yellow', 'orange', 'red', 'magenta', 'violet', 'blue', 'cyan', 'green'];

const randomHue = () => HUES[Math.floor(Math.random() * HUES.length)];

/** A random colour for every theme; any valid one already in `kept` stays. @param {ThemeColors} [kept] */
export const randomThemeColors = (kept = {}) =>
	Object.fromEntries(
		THEMES.map(({ id }) => [id, HUES.includes(kept[id]) ? kept[id] : randomHue()])
	);

/**
 * The style that hands a persona's colours to CSS as `--tint-<theme>`; app.css picks the one for the theme in effect.
 * @param {ThemeColors} colors
 */
export const tintStyle = (colors) =>
	THEMES.filter(({ id }) => HUES.includes(colors[id]))
		.map(({ id }) => `--tint-${id}: var(--color-${colors[id]})`)
		.join('; ');
