/**
 * `insurance` stub — implementation lives in Phase 4 Plan 04 (orders-and-
 * collections). One entry per IN1 segment with positional IN2/IN3 presence
 * flags (D-05 extension).
 */

import type { Hl7Message } from "../model/message.js";
import type { Insurance } from "./types.js";

/**
 * Walk every IN1 segment (attaching IN2/IN3 positionally) and return the
 * list of Insurance entries in document order. D-05: empty array when no
 * IN1 present. Implementation lives in Phase 4 Plan 04.
 *
 * @internal
 */
export function insurance(_msg: Hl7Message): readonly Insurance[] {
  throw new Error(
    "insurance: NOT IMPLEMENTED — Phase 4 Plan 04 (orders-and-collections) will fill this. " +
      "If you see this error, helper plans are running out of order.",
  );
}
