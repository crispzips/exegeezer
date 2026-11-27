/**
 * How tall each of the hierarchical view's rows should be when one of them, the active one, is to show everything in it.
 * The active row gets the height it needs, as far as the others can give it up: they keep their usual heights while there
 * is room, and shrink together when there isn't, none below its floor (the least that holds its largest section bubble).
 * A row whose floor is above its usual height stands at the floor. Only when the floors together are more than the room
 * do they give way too, all in proportion.
 *
 * @param {number[]} usual each row's usual height, top row first
 * @param {number} active the index of the active row (-1 when there is none)
 * @param {number} need the height at which the active row shows all of its contents
 * @param {number} room the height the rows have between them
 * @param {number[]} floors the least height each row is shrunk to
 * @returns {number[]}
 */
export function rowHeights(usual, active, need, room, floors) {
	const sum = (/** @type {number[]} */ list) => list.reduce((total, h, d) => (d === active ? total : total + h), 0);
	const fit = Math.min(1, room / Math.max(1, floors.reduce((total, h) => total + h, 0)));
	const least = floors.map((h) => h * fit);
	const wants = usual.map((h, d) => Math.max(h, least[d]));
	const tall = active === -1 ? 0 : Math.floor(Math.max(least[active], Math.min(Math.max(need, wants[active]), room - sum(least))));
	const spare = room - tall;
	// the share of its height above the floor that each other row keeps
	const share = sum(wants) > spare ? Math.max(0, spare - sum(least)) / Math.max(1, sum(wants) - sum(least)) : 1;
	return wants.map((h, d) => (d === active ? tall : Math.floor(least[d] + (h - least[d]) * share)));
}
