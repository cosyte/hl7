/**
 * `buildMeta` stub — implementation lives in Phase 4 Plan 02
 * (meta-and-patient). This stub exists so Plan 01 can wire the
 * `Hl7Message.meta` getter before Plan 02 runs. Invoking the stub throws;
 * the getter only calls it on first `.meta` access, so Plan 01's typecheck,
 * lint, build, and test all pass even though the function body will be
 * filled later.
 */

import type { Hl7Message } from "../model/message.js";
import type { Meta } from "./types.js";

/**
 * Build the immutable `Meta` view from a parsed message's MSH segment.
 * Implementation lives in Phase 4 Plan 02. See `Hl7Message.meta` for the
 * public accessor that caches this result (D-02 memoization).
 *
 * @internal
 */
export function buildMeta(_msg: Hl7Message): Meta {
  throw new Error(
    "buildMeta: NOT IMPLEMENTED — Phase 4 Plan 02 (meta-and-patient) will fill this. " +
      "If you see this error, helper plans are running out of order.",
  );
}
