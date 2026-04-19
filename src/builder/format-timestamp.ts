/**
 * `formatHl7Timestamp` — format a JS `Date` to HL7 TS `YYYYMMDDHHmmss`
 * (UTC, second precision). Inverse of `src/parser/dates.ts::parseHl7Timestamp`
 * for the HL7 TS branch.
 *
 * Implementation lives in Phase 5 Plan 05 (build-message).
 *
 * Decisions:
 * - D-13: second precision only (no `.SSSS`); UTC via `getUTC*` methods.
 * - D-31: zero deps — stdlib `Date` only.
 *
 * @internal
 */

/**
 * Format a JS `Date` to HL7 TS `YYYYMMDDHHmmss` (UTC, second precision,
 * always 14 chars). Inverse of `parseHl7Timestamp` for the HL7 TS branch.
 * D-13: sub-second precision is NOT emitted (acceptable asymmetry — most
 * outbound use cases don't need ms, and HL7 TS `.SSSS` is optional).
 *
 * Always uses UTC — callers who need local-time emission should supply a
 * pre-formatted HL7 TS string to `buildMessage({ timestamp: "..." })`.
 *
 * On an Invalid Date (`new Date("not-a-date")`) the output is a string of
 * 14 `NaN`-derived chars. `buildMessage`'s upstream validation never passes
 * an invalid Date — sibling functions don't throw (D-07), so this pathological
 * case is accepted silently.
 *
 * @example
 * ```ts
 * // formatHl7Timestamp is @internal — call buildMessage's `timestamp`
 * // option instead. Internally this maps Date -> YYYYMMDDHHmmss:
 * //   new Date("2026-04-19T10:15:00Z") -> "20260419101500"
 * ```
 *
 * @internal
 */
export function formatHl7Timestamp(date: Date): string {
  const yyyy = String(date.getUTCFullYear()).padStart(4, "0");
  const mm = String(date.getUTCMonth() + 1).padStart(2, "0"); // +1: getUTCMonth is 0-indexed
  const dd = String(date.getUTCDate()).padStart(2, "0");
  const hh = String(date.getUTCHours()).padStart(2, "0");
  const min = String(date.getUTCMinutes()).padStart(2, "0");
  const ss = String(date.getUTCSeconds()).padStart(2, "0");
  return `${yyyy}${mm}${dd}${hh}${min}${ss}`;
}
