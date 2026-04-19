/**
 * `orders` stub — implementation lives in Phase 4 Plan 04 (orders-and-
 * collections). Groups OBX segments under their preceding OBR positionally
 * per D-12. Consumes `buildObservation` from `./observations.js`.
 */

import type { Hl7Message } from "../model/message.js";
import type { Order } from "./types.js";

/**
 * Walk every OBR segment, grouping following OBX segments positionally
 * (D-12), and return the list of Orders in document order. D-05: empty
 * array when no OBR present. Implementation lives in Phase 4 Plan 04.
 *
 * @internal
 */
export function orders(_msg: Hl7Message): readonly Order[] {
  throw new Error(
    "orders: NOT IMPLEMENTED — Phase 4 Plan 04 (orders-and-collections) will fill this. " +
      "If you see this error, helper plans are running out of order.",
  );
}
