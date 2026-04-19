/**
 * `generateControlId` — synthesise an HL7 message control ID for outbound
 * messages. Shape: 17-char UTC timestamp `YYYYMMDDHHmmssSSS` + 6 random
 * alphanumeric chars = 23 chars total (D-12).
 *
 * Implementation lives in Phase 5 Plan 05 (build-message).
 *
 * Decisions:
 * - D-12: exact shape above; uniqueness via `Date.now()` + cryptographic
 *   random bytes from `node:crypto.randomBytes` (WR-03 hardening — was
 *   `Math.random` originally); alphabet is plain `[A-Za-z0-9]` (Claude's
 *   Discretion: readability doesn't matter — IDs aren't human-typed).
 * - D-31: zero deps — Node stdlib only (`node:crypto` is stdlib).
 *
 * @internal
 */

import { randomBytes } from "node:crypto";

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
 *
 * The 6-char suffix is sourced from `node:crypto.randomBytes(6)` and mapped
 * into the 62-char alnum alphabet. This avoids the `Math.random` collision
 * risk flagged in WR-03 under heavy concurrent load (many parallel workers
 * generating IDs in the same millisecond). Note: mapping 256-bucket bytes
 * into a 62-bucket alphabet via modulo introduces a tiny distributional
 * bias (the first 20 alphabet slots are ~slightly more likely than the
 * last 42), but the bias is negligible for uniqueness — the effective
 * entropy on the suffix remains > 35 bits, and the 17-char ms timestamp
 * prefix further partitions the ID space.
 *
 * Zero dependencies — uses `Date` + `node:crypto` only (D-31); both are
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
  const bytes = randomBytes(6);
  let suffix = "";
  for (let i = 0; i < 6; i++) {
    // noUncheckedIndexedAccess: bytes is a Buffer of known length 6, so
    // bytes[i] is a number (0..255). The `?? 0` reflects that invariant
    // without a forbidden non-null assertion — the loop bound is a literal 6
    // that matches the requested byte count, so bytes[i] is always defined.
    const byte = bytes[i] ?? 0;
    const idx = byte % ALNUM_ALPHABET.length;
    // ALNUM_ALPHABET.charAt(idx) is always a single-char string.
    suffix += ALNUM_ALPHABET.charAt(idx);
  }
  return ts + suffix;
}
