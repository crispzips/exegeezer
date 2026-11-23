/**
 * Reading mode sets a paragraph's first and last sentences apart (larger, on their own lines, highlighted).
 * Each can be turned off independently, in the rally's options; both are on by default. Shared by every view.
 */
export const emphasis = $state({ first: true, last: true });
