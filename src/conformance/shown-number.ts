/**
 * The one rule for a number a conformance diagnostic shows.
 *
 * A profile and a resolution argument are caller-supplied, and a number in one
 * can be data as easily as structure: a field index or a cardinality bound of
 * 19800101 reads the same as a date of birth, and a long one reads the same as
 * a record number. So a number taken from the profile or the resolution
 * argument (a field, component or subcomponent index, a cardinality bound, a
 * declared length) is shown only when it has passed its own check and is at
 * most {@link MAX_SHOWN_NUMBER}: four digits, small enough to be a count or an
 * index and nothing else. Any other number is replaced by a fixed phrase, and
 * the text still names the position and the fault.
 *
 * Counts the engine computes itself (how many repetitions a message carries,
 * how many codes a value set holds, where a member sits in a list) are not
 * caller-supplied and are shown as they are.
 *
 * @internal
 */

/** The largest number a diagnostic shows. @internal */
export const MAX_SHOWN_NUMBER = 9999;

/** What a diagnostic shows in place of a number it does not show. @internal */
export const UNSHOWN_NUMBER = `(a number above ${String(MAX_SHOWN_NUMBER)})`;

/**
 * Is `n` a number a diagnostic may show: a non-negative integer of at most
 * {@link MAX_SHOWN_NUMBER}? The caller has already checked it against its own
 * rule; this is the bound on top of that.
 *
 * @internal
 */
export function isShownNumber(n: number): boolean {
  return Number.isInteger(n) && n >= 0 && n <= MAX_SHOWN_NUMBER;
}

/**
 * Render a checked number for a diagnostic: the number itself when
 * {@link isShownNumber} admits it, otherwise {@link UNSHOWN_NUMBER}.
 *
 * @internal
 */
export function showNumber(n: number): string {
  return isShownNumber(n) ? String(n) : UNSHOWN_NUMBER;
}
