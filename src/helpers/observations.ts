/**
 * `observations` + `buildObservation` stubs — implementations live in Phase
 * 4 Plan 03 (visit-and-observations). `buildObservation` is exported as a
 * per-segment builder so Plan 04 (`orders`) can reuse it for OBX grouping
 * without re-implementing the value-type dispatch.
 */

import type { Hl7Message } from "../model/message.js";
import type { Segment } from "../model/segment.js";
import type { Observation } from "./types.js";

/**
 * Walk every OBX segment of the message and return the list as typed
 * Observations in document order (D-05 never-undefined, D-11 flat list).
 * Implementation lives in Phase 4 Plan 03.
 *
 * @internal
 */
export function observations(_msg: Hl7Message): readonly Observation[] {
  throw new Error(
    "observations: NOT IMPLEMENTED — Phase 4 Plan 03 (visit-and-observations) will fill this. " +
      "If you see this error, helper plans are running out of order.",
  );
}

/**
 * Build a single Observation from one OBX Segment — extracted so
 * `orders()` (Plan 04) can reuse the same OBX → Observation logic while
 * grouping positionally. Implementation lives in Phase 4 Plan 03.
 *
 * @internal
 */
export function buildObservation(_seg: Segment): Observation {
  throw new Error(
    "buildObservation: NOT IMPLEMENTED — Phase 4 Plan 03 (visit-and-observations) will fill this. " +
      "If you see this error, helper plans are running out of order.",
  );
}
