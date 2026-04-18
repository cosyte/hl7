/**
 * MLLP (Minimal Lower Layer Protocol) framing byte removal for the
 * `@cosyte/hl7-parser` parser pipeline. MLLP wraps an HL7 v2 message with a
 * start-block byte (`0x0B` / VT) and an end-block pair (`0x1C` / FS followed
 * by `0x0D` / CR). This module strips those control bytes and flags the event
 * via the `MLLP_FRAMING_STRIPPED` Tier-2 warning (TOL-06).
 *
 * Per CONTEXT.md D-03, MLLP stripping runs after BOM strip and before
 * line-ending normalization in the overall pipeline. Plan 06 composes the
 * full pipeline; this module stays standalone so Plan 06 can invoke it in the
 * exact right position.
 */

import { mllpFramingStripped } from "./warnings.js";
import type { Hl7ParseWarning } from "./warnings.js";
import type { Hl7Position } from "./types.js";

/**
 * Result of an MLLP framing strip. `wasFramed` is `true` iff any of the three
 * MLLP control bytes (VT = `0x0B`, FS = `0x1C`, trailing CR = `0x0D` paired
 * with an FS) were removed from the input — the signal downstream code uses
 * to decide whether to emit an `MLLP_FRAMING_STRIPPED` warning.
 *
 * @example
 * ```ts
 * import { stripMllp, type StripMllpResult } from "@cosyte/hl7-parser";
 * const r: StripMllpResult = stripMllp("\u000BMSH|...\u001C\u000D");
 * // r.stripped === "MSH|..."; r.wasFramed === true
 * ```
 */
export interface StripMllpResult {
  readonly stripped: string;
  readonly wasFramed: boolean;
}

/**
 * Strip MLLP framing bytes from a raw HL7 message string. Removes all
 * occurrences of VT (`\u000B`) and FS (`\u001C`); additionally removes a
 * single trailing CR (`\u000D`) if and only if it was paired with a trailing
 * FS (the MLLP end-block convention). Data CRs in the middle of the payload
 * are preserved as segment terminators.
 *
 * Pure function: safe to call on any string. Returns the original string
 * unchanged with `wasFramed: false` when no framing bytes are present.
 *
 * @example
 * ```ts
 * import { stripMllp } from "@cosyte/hl7-parser";
 * const { stripped, wasFramed } = stripMllp("\u000BMSH|^~\\&|APP\rPID|1\u001C\u000D");
 * // stripped === "MSH|^~\\&|APP\rPID|1"; wasFramed === true
 * ```
 */
export function stripMllp(input: string): StripMllpResult {
  const hasVt = input.includes("\u000B");
  const hasFs = input.includes("\u001C");
  if (!hasVt && !hasFs) {
    return { stripped: input, wasFramed: false };
  }

  const originalEndedWithFsCr = /\u001C\u000D$/u.test(input);
  let s = input.replace(/[\u000B\u001C]/gu, "");
  if (originalEndedWithFsCr && s.endsWith("\u000D")) {
    s = s.slice(0, -1);
  }
  return { stripped: s, wasFramed: true };
}

/**
 * Emit an `MLLP_FRAMING_STRIPPED` warning via the supplied callback when the
 * given strip result indicates framing bytes were removed. No-op when
 * `result.wasFramed` is false. Kept as a companion helper (rather than
 * collapsed into `stripMllp`) so the two concerns — transform and emit —
 * stay testable in isolation, per CLAUDE.md guardrails.
 *
 * @example
 * ```ts
 * import { stripMllp, emitIfFramed } from "@cosyte/hl7-parser";
 * const result = stripMllp(raw);
 * emitIfFramed(result, (w) => console.warn(w.code), { segmentIndex: 0 });
 * ```
 */
export function emitIfFramed(
  result: StripMllpResult,
  emit: (warning: Hl7ParseWarning) => void,
  position: Hl7Position,
): void {
  if (result.wasFramed) {
    emit(mllpFramingStripped(position));
  }
}
