/**
 * `generateControlId`: synthesise an HL7 message control ID for outbound
 * messages. Shape: 17-char UTC timestamp `YYYYMMDDHHmmssSSS` + 6 random
 * alphanumeric chars = 23 chars total.
 *
 * Decisions:
 * - Exact shape above; uniqueness via `Date.now()` + cryptographic
 *   random draws from `node:crypto.randomInt` (it was `Math.random`
 *   originally); alphabet is plain `[A-Za-z0-9]` (readability doesn't
 *   matter: IDs aren't human-typed).
 * - Zero deps: Node stdlib only (`node:crypto` is stdlib).
 *
 * @internal
 */

import { randomInt } from "node:crypto";

/**
 * Alphabet for the random suffix: plain alphanumeric. Readability doesn't
 * matter (IDs aren't human-typed), so no ambiguous-char filtering.
 * @internal
 */
const ALNUM_ALPHABET = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";

/**
 * Zero-pad a number to N digits (stdlib: avoid regex for perf).
 * @internal
 */
function pad(n: number, width: number): string {
  return String(n).padStart(width, "0");
}

/**
 * Generate an HL7 message control ID. Shape: 17-char UTC timestamp
 * `YYYYMMDDHHmmssSSS` + 6 random alphanumeric chars = 23 chars total.
 *
 * Each of the 6 suffix characters is drawn with `node:crypto.randomInt`,
 * a cryptographically secure source that samples the 62-char alnum
 * alphabet uniformly (it rejects out-of-range draws rather than reducing
 * them modulo 62, which would favor the first 8 characters). This avoids
 * the `Math.random` collision risk under heavy concurrent
 * load (many parallel workers generating IDs in the same millisecond): the
 * suffix carries 6 * log2(62), about 35.7 bits, and the 17-char ms
 * timestamp prefix further partitions the ID space.
 *
 * Zero dependencies: uses `Date` + `node:crypto` only; both are
 * Node stdlib.
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
    // randomInt(max) returns an integer in [0, max) with every value equally
    // likely, so ALNUM_ALPHABET.charAt(idx) is always a single-char string.
    const idx = randomInt(ALNUM_ALPHABET.length);
    suffix += ALNUM_ALPHABET.charAt(idx);
  }
  return ts + suffix;
}
