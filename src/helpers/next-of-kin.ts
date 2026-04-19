/**
 * `nextOfKin` stub — implementation lives in Phase 4 Plan 04 (orders-and-
 * collections). One entry per NK1 segment in document order.
 */

import type { Hl7Message } from "../model/message.js";
import type { NextOfKin } from "./types.js";

/**
 * Walk every NK1 segment and return the list of NextOfKin entries in
 * document order. D-05: empty array when no NK1 present. Implementation
 * lives in Phase 4 Plan 04.
 *
 * @internal
 */
export function nextOfKin(_msg: Hl7Message): readonly NextOfKin[] {
  throw new Error(
    "nextOfKin: NOT IMPLEMENTED — Phase 4 Plan 04 (orders-and-collections) will fill this. " +
      "If you see this error, helper plans are running out of order.",
  );
}
