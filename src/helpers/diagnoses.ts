/**
 * `diagnoses` stub — implementation lives in Phase 4 Plan 04 (orders-and-
 * collections). One entry per DG1 segment in document order.
 */

import type { Hl7Message } from "../model/message.js";
import type { Diagnosis } from "./types.js";

/**
 * Walk every DG1 segment and return the list of Diagnosis entries in
 * document order. D-05: empty array when no DG1 present. Implementation
 * lives in Phase 4 Plan 04.
 *
 * @internal
 */
export function diagnoses(_msg: Hl7Message): readonly Diagnosis[] {
  throw new Error(
    "diagnoses: NOT IMPLEMENTED — Phase 4 Plan 04 (orders-and-collections) will fill this. " +
      "If you see this error, helper plans are running out of order.",
  );
}
