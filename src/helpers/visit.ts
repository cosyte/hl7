/**
 * `buildVisit` stub — implementation lives in Phase 4 Plan 03
 * (visit-and-observations). This stub exists so Plan 01 can wire the
 * `Hl7Message.visit` getter before Plan 03 runs. Invoking the stub throws;
 * the getter only calls it on first `.visit` access.
 */

import type { Hl7Message } from "../model/message.js";
import type { Visit } from "./types.js";

/**
 * Build the immutable `Visit` view from a parsed message's PV1 segment.
 * Returns `undefined` when the message has no PV1 (HELPERS-03). Implementation
 * lives in Phase 4 Plan 03.
 *
 * @internal
 */
export function buildVisit(_msg: Hl7Message): Visit | undefined {
  throw new Error(
    "buildVisit: NOT IMPLEMENTED — Phase 4 Plan 03 (visit-and-observations) will fill this. " +
      "If you see this error, helper plans are running out of order.",
  );
}
