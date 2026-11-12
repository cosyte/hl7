/**
 * athenahealth Interop API HL7 quirks. Ships US-short-date format
 * (`MM/DD/YYYY`) commonly used in athena ADT outbound. One Z-segment:
 * `ZCA` (care team membership).
 *
 * No AM/PM variant (`MM/DD/YYYY hh:mm A`) ships in this profile. The date
 * grammar supports one (`SUPPORTED_DATE_TOKENS` includes `hh`, `h` and `A`),
 * so a consumer that receives it can extend this profile with that format.
 *
 * @example
 * ```ts
 * import { parseHL7, profiles } from "@cosyte/hl7";
 * const msg = parseHL7(raw, profiles.athena);
 * const zca = msg.allSegments().find((s) => s.type === "ZCA");
 * console.log(zca?.get("providerName")?.value);
 * ```
 */

import { defineProfile } from "./define.js";

/**
 * Built-in athenahealth Interop profile. See file header for
 * rationale; use via `parseHL7(raw, profiles.athena)`.
 *
 * @example
 * ```ts
 * import { parseHL7, profiles } from "@cosyte/hl7";
 * const msg = parseHL7(raw, profiles.athena);
 * ```
 */
export const athena = defineProfile({
  name: "athena",
  description: "athenahealth Interop: US-short-date format and care-team Z-segment",
  dateFormats: ["MM/DD/YYYY"],
  customSegments: {
    ZCA: { fields: { careTeamRole: 3, providerId: 5, providerName: 6 } },
  },
});
