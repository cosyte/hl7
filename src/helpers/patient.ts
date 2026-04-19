/**
 * `buildPatient` stub — implementation lives in Phase 4 Plan 02
 * (meta-and-patient). This stub exists so Plan 01 can wire the
 * `Hl7Message.patient` getter before Plan 02 runs. Invoking the stub throws;
 * the getter only calls it on first `.patient` access, so Plan 01's
 * typecheck, lint, build, and test all pass.
 */

import type { Hl7Message } from "../model/message.js";
import type { Patient } from "./types.js";

/**
 * Build the immutable `Patient` view from a parsed message's PID segment.
 * Returns `undefined` when the message has no PID (D-04). Implementation
 * lives in Phase 4 Plan 02.
 *
 * @internal
 */
export function buildPatient(_msg: Hl7Message): Patient | undefined {
  throw new Error(
    "buildPatient: NOT IMPLEMENTED — Phase 4 Plan 02 (meta-and-patient) will fill this. " +
      "If you see this error, helper plans are running out of order.",
  );
}
