/**
 * `formatHl7Timestamp` — format a JS `Date` to HL7 TS `YYYYMMDDHHmmss`
 * (UTC, second precision). Inverse of `src/parser/dates.ts::parseHl7Timestamp`
 * for the HL7 TS branch.
 *
 * Implementation lives in Phase 5 Plan 05 (build-message). Stub throws.
 *
 * Decisions (for Plan 05 implementer):
 * - D-13: second precision only (no `.SSSS`); UTC via `getUTC*` methods.
 * - D-31: zero deps — stdlib `Date` only.
 *
 * @internal
 */

/** @internal */
export function formatHl7Timestamp(_date: Date): string {
  throw new Error(
    "formatHl7Timestamp: NOT IMPLEMENTED — Phase 5 Plan 05 (build-message) will fill this. " +
      "If you see this error, builder plans are running out of order.",
  );
}
