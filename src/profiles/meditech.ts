/**
 * Meditech MAGIC / Expanse HL7 quirks. Ships minute-precision timestamps
 * (`YYYYMMDDHHmm`) — a non-HL7 format Meditech commonly uses in ADT and
 * scheduling feeds (HL7 spec is `YYYYMMDDHHmmss` with seconds). One
 * Z-segment: `ZVI` (visit info). BIP-03.
 *
 * @example
 * ```ts
 * import { parseHL7, profiles } from "@cosyte/hl7";
 * const msg = parseHL7(raw, profiles.meditech);
 * const zvi = msg.allSegments().find((s) => s.type === "ZVI");
 * console.log(zvi?.get("visitReason")?.value);
 * ```
 */

import { defineProfile } from "./define.js";

/**
 * Built-in Meditech MAGIC/Expanse profile (BIP-03). See file header for
 * rationale; use via `parseHL7(raw, profiles.meditech)`.
 *
 * @example
 * ```ts
 * import { parseHL7, profiles } from "@cosyte/hl7";
 * const msg = parseHL7(raw, profiles.meditech);
 * ```
 */
export const meditech = defineProfile({
  name: "meditech",
  description: "Meditech MAGIC/Expanse — minute-precision timestamps and visit-info Z-segment",
  dateFormats: ["YYYYMMDDHHmm"],
  customSegments: {
    ZVI: { fields: { visitReason: 3, admitSource: 5 } },
  },
});
