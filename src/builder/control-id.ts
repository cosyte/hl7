/**
 * `generateControlId` — synthesise an HL7 message control ID for outbound
 * messages. Shape: 17-char UTC timestamp `YYYYMMDDHHmmssSSS` + 6 random
 * alphanumeric chars = 23 chars total (D-12).
 *
 * Implementation lives in Phase 5 Plan 05 (build-message).
 *
 * Decisions:
 * - D-12: exact shape above; uniqueness via `Date.now()` + `Math.random()`;
 *   alphabet is plain `[A-Za-z0-9]` (Claude's Discretion: readability
 *   doesn't matter — IDs aren't human-typed).
 * - D-31: zero deps — stdlib only.
 *
 * @internal
 */

/**
 * Alphabet for the random suffix — plain alphanumeric. Readability doesn't
 * matter (IDs aren't human-typed), so no ambiguous-char filtering.
 * @internal
 */
const ALNUM_ALPHABET = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";

/**
 * Zero-pad a number to N digits (stdlib — avoid regex for perf).
 * @internal
 */
function pad(n: number, width: number): string {
  return String(n).padStart(width, "0");
}

/**
 * Generate an HL7 message control ID per D-12. Shape: 17-char UTC timestamp
 * `YYYYMMDDHHmmssSSS` + 6 random alphanumeric chars = 23 chars total.
 * Uniqueness is strong enough for outbound test messages and small tools
 * (62^6 ≈ 5.68e10 distinct suffixes per millisecond); callers with stricter
 * requirements should pass their own `controlId` to `buildMessage`.
 *
 * Zero dependencies — uses `Date` + `Math.random` only (D-31).
 *
 * @internal
 */
export function generateControlId(): string {
  const now = new Date();
  const ts =
    pad(now.getUTCFullYear(), 4) +
    pad(now.getUTCMonth() + 1, 2) +
    pad(now.getUTCDate(), 2) +
    pad(now.getUTCHours(), 2) +
    pad(now.getUTCMinutes(), 2) +
    pad(now.getUTCSeconds(), 2) +
    pad(now.getUTCMilliseconds(), 3);
  let suffix = "";
  for (let i = 0; i < 6; i++) {
    const idx = Math.floor(Math.random() * ALNUM_ALPHABET.length);
    // noUncheckedIndexedAccess: ALNUM_ALPHABET.charAt(idx) is always a string.
    suffix += ALNUM_ALPHABET.charAt(idx);
  }
  return ts + suffix;
}
