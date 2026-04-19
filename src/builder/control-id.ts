/**
 * `generateControlId` — synthesise an HL7 message control ID for outbound
 * messages. Shape: 17-char UTC timestamp `YYYYMMDDHHmmssSSS` + 6 random
 * alphanumeric chars = 23 chars total (D-12).
 *
 * Implementation lives in Phase 5 Plan 05 (build-message). Stub throws.
 *
 * Decisions (for Plan 05 implementer):
 * - D-12: exact shape above; uniqueness via `Date.now()` + `Math.random()`;
 *   alphabet is plain `[A-Za-z0-9]` (Claude's Discretion: readability
 *   doesn't matter — IDs aren't human-typed).
 * - D-31: zero deps — stdlib only.
 *
 * @internal
 */

/** @internal */
export function generateControlId(): string {
  throw new Error(
    "generateControlId: NOT IMPLEMENTED — Phase 5 Plan 05 (build-message) will fill this. " +
      "If you see this error, builder plans are running out of order.",
  );
}
