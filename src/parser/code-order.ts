/**
 * One ordering for the identifiers the library sorts while it loads: message
 * codes, trigger events, overlay keys and warning codes.
 *
 * It compares UTF-16 code units, the order of `<` on strings, rather than
 * calling `localeCompare`. The first `localeCompare` in a process builds an ICU
 * collator, which cost several milliseconds of every import even though every
 * value sorted at load is plain ASCII. A test holds that this order matches the
 * collated one for every list sorted at load, so no published order moved.
 *
 * @internal
 */
export function compareCodeUnits(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0;
}
