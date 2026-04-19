/**
 * `emitMessage` — top-level HL7 string emitter. Composes `emitSegment` from
 * `./emit-field.ts`, special-cases MSH-1 / MSH-2 per D-06, and joins segments
 * with strict CR (`\r`) per D-05.
 *
 * Implementation lives in Phase 5 Plan 02 (to-string-and-round-trip). This
 * stub exists so Plan 01 can wire the `Hl7Message.toString` instance method
 * before Plan 02 runs; invoking it throws.
 *
 * Decisions (for Plan 02 implementer):
 * - D-01: walk `msg.rawSegments` verbatim.
 * - D-04: every field string passes through `emitField` (which calls
 *   `reescape` internally).
 * - D-05: segments joined by `\r`; trailing `\r` after the last segment.
 * - D-06: MSH-1 / MSH-2 inlined (see CONTEXT §specifics emission trace).
 * - D-07: pure — never warns, never throws.
 * - D-08: no MLLP wrapping.
 *
 * @internal
 */

import type { Hl7Message } from "../model/message.js";

/** @internal */
export function emitMessage(_msg: Hl7Message): string {
  throw new Error(
    "emitMessage: NOT IMPLEMENTED — Phase 5 Plan 02 (to-string-and-round-trip) will fill this. " +
      "If you see this error, serialize plans are running out of order.",
  );
}
