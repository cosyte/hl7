/**
 * `allergies` stub — implementation lives in Phase 4 Plan 04 (orders-and-
 * collections). One entry per AL1 segment in document order.
 */

import type { Hl7Message } from "../model/message.js";
import type { Allergy } from "./types.js";

/**
 * Walk every AL1 segment and return the list of Allergy entries in
 * document order. D-05: empty array when no AL1 present. Implementation
 * lives in Phase 4 Plan 04.
 *
 * @internal
 */
export function allergies(_msg: Hl7Message): readonly Allergy[] {
  throw new Error(
    "allergies: NOT IMPLEMENTED — Phase 4 Plan 04 (orders-and-collections) will fill this. " +
      "If you see this error, helper plans are running out of order.",
  );
}
