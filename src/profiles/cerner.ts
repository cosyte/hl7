/**
 * Cerner Millennium HL7 quirks. Ships ISO-8601-with-T format
 * (`YYYY-MM-DDTHH:mm:ss`) plus ISO-date-only (`YYYY-MM-DD`), observed
 * across Millennium's native outbound feeds. Z-segments: `ZDS`
 * (discharge summary text) and `ZCO` (comment overflow for long fields).
 * BIP-02.
 *
 * @example
 * ```ts
 * import { parseHL7, profiles } from "@cosyte/hl7-parser";
 * const msg = parseHL7(raw, profiles.cerner);
 * const zds = msg.allSegments().find((s) => s.type === "ZDS");
 * console.log(zds?.get("summaryText")?.value);
 * ```
 */

import { defineProfile } from "./define.js";

/**
 * Built-in Cerner Millennium profile (BIP-02). See file header for
 * rationale; use via `parseHL7(raw, profiles.cerner)`.
 *
 * @example
 * ```ts
 * import { parseHL7, profiles } from "@cosyte/hl7-parser";
 * const msg = parseHL7(raw, profiles.cerner);
 * ```
 */
export const cerner = defineProfile({
  name: "cerner",
  description: "Cerner Millennium — ISO-style timestamps and common Z-segments",
  dateFormats: ["YYYY-MM-DDTHH:mm:ss", "YYYY-MM-DD"],
  customSegments: {
    ZDS: { fields: { summaryText: 3 } },
    ZCO: { fields: { commentText: 3, continuationFlag: 5 } },
  },
});
