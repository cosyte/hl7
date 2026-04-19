/**
 * `emitPrettyPrint` — human-readable multi-line rendering of an `Hl7Message`
 * for logs and debugging (SER-04).
 *
 * Implementation lives in Phase 5 Plan 04 (pretty-print). Stub throws.
 *
 * Decisions (for Plan 04 implementer):
 * - D-22: no options — single opinionated format.
 * - D-23: segment-per-line with labeled fields `[N]=value`. Field values
 *   shown verbatim with active delimiters; empty trailing positions suppressed.
 * - D-24: resolution depth stops at field level — composite values render as
 *   their raw HL7 string (e.g. `Smith^John^Q`).
 * - D-25: first line is a metadata header
 *   `HL7 <type>  controlId=<id>  timestamp=<iso>  (<N> segments)`.
 * - D-26: pure — never warns or throws.
 *
 * @internal
 */

import type { Hl7Message } from "../model/message.js";

/** @internal */
export function emitPrettyPrint(_msg: Hl7Message): string {
  throw new Error(
    "emitPrettyPrint: NOT IMPLEMENTED — Phase 5 Plan 04 (pretty-print) will fill this. " +
      "If you see this error, serialize plans are running out of order.",
  );
}
