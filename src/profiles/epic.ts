/**
 * Epic Bridges Interconnect HL7 quirks. Ships non-HL7 date formats
 * (`MM/DD/YYYY HH:mm:ss`, `MM/DD/YYYY`) commonly seen in ADT outbound
 * feeds, plus two Z-segments: `ZDP` (department context) and `ZRS`
 * (result status). BIP-01.
 *
 * Authored from the public `defineProfile()` API — zero privileged
 * internal coupling. Consumers extend this profile via
 * `defineProfile({ name: '...', extends: profiles.epic, ... })`.
 *
 * @example
 * ```ts
 * import { parseHL7, profiles } from "@cosyte/hl7";
 * const msg = parseHL7(raw, profiles.epic);
 * const zdp = msg.allSegments().find((s) => s.type === "ZDP");
 * console.log(zdp?.get("departmentCode")?.value);
 * ```
 */

import { defineProfile } from "./define.js";

/**
 * Built-in Epic Bridges Interconnect profile (BIP-01). See file header
 * for rationale; use via `parseHL7(raw, profiles.epic)`.
 *
 * @example
 * ```ts
 * import { parseHL7, profiles } from "@cosyte/hl7";
 * const msg = parseHL7(raw, profiles.epic);
 * ```
 */
export const epic = defineProfile({
  name: "epic",
  description: "Epic Bridges Interconnect — ADT-style date formats and common Z-segments",
  dateFormats: ["MM/DD/YYYY HH:mm:ss", "MM/DD/YYYY"],
  customSegments: {
    ZDP: { fields: { departmentCode: 3, departmentName: 4 } },
    ZRS: { fields: { resultStatus: 1, statusDateTime: 2 } },
  },
});
