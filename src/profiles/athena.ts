/**
 * athenahealth Interop API HL7 quirks. Ships US-short-date format
 * (`MM/DD/YYYY`) commonly used in athena ADT outbound. One Z-segment:
 * `ZCA` (care team membership). BIP-04.
 *
 * The AM/PM meridian variant (`MM/DD/YYYY HH:mm AM/PM`) is intentionally
 * NOT shipped — the library's format-token set does not include AM/PM
 * (`SUPPORTED_DATE_TOKENS` = YYYY/MM/DD/HH/mm/ss/SSSS). Consumers needing
 * meridian support can extend this profile or supply their own format
 * handler.
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
 * Built-in athenahealth Interop profile (BIP-04). See file header for
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
  description: "athenahealth Interop — US-short-date format and care-team Z-segment",
  dateFormats: ["MM/DD/YYYY"],
  customSegments: {
    ZCA: { fields: { careTeamRole: 3, providerId: 5, providerName: 6 } },
  },
});
