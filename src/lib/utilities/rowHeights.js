/**
 * How tall each of the hierarchical view's rows should be when one of them, the active one, is to show everything in it.
 * The active row gets the height it needs, as far as the others can give it up: they keep their usual heights while there
 * is room, and shrink together, none below `min`, when there isn't.
 *
 * @param {number[]} usual each row's usual height, top row first
 * @param {number} active the index of the active row
 * @param {number} need the height at which the active row shows all of its contents
 * @param {number} room the height the rows have between them
 * @param {number} min the least height a row is shrunk to (lower still when there are too many rows for that)
 * @returns {number[]}
 */
export function rowHeights(usual, active, need, room, min) {
	const others = usual.length - 1;
	const floor = Math.min(min, Math.floor(room / (usual.length + 1)));
	const tall = Math.max(floor, Math.min(Math.max(need, usual[active]), room - others * floor));
	const wanted = usual.reduce((sum, h, d) => (d === active ? sum : sum + h), 0);
	const spare = room - tall;
	// the share of its height above the floor that each other row keeps
	const share = wanted > spare ? Math.max(0, spare - others * floor) / Math.max(1, wanted - others * floor) : 1;
	return usual.map((h, d) => (d === active ? tall : Math.floor(floor + (h - floor) * share)));
}
