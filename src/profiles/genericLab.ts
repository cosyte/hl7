/**
 * Generic reference-laboratory shape (LabCorp / Quest-style). Ships two
 * non-HL7 date formats: `YYYYMMDD HHmm` (ASTM-era space-separated) and
 * `YYYY-MM-DD` (ISO date-only). Two Z-segments: `ZLB` (lab-override
 * flags) and `ZNT` (lab note).
 *
 * The canonical HL7 format `YYYYMMDDHHmmss` is NOT shipped here: it's
 * already the parser's primary (zero-warning) match for TS/DTM.
 *
 * @example
 * ```ts
 * import { parseHL7, profiles } from "@cosyte/hl7";
 * const msg = parseHL7(raw, profiles.genericLab);
 * const znt = msg.allSegments().find((s) => s.type === "ZNT");
 * console.log(znt?.get("noteText")?.value);
 * ```
 */

import { defineProfile } from "./define.js";

/**
 * Built-in generic reference-laboratory profile. See file
 * header for rationale; use via `parseHL7(raw, profiles.genericLab)`.
 *
 * @example
 * ```ts
 * import { parseHL7, profiles } from "@cosyte/hl7";
 * const msg = parseHL7(raw, profiles.genericLab);
 * ```
 */
const options = {
  name: "genericLab",
  description: "Generic reference-laboratory: ASTM-era + ISO-date formats + lab Z-segments",
  dateFormats: ["YYYYMMDD HHmm", "YYYY-MM-DD"],
  customSegments: {
    ZLB: { fields: { specimenOverride: 3, methodOverride: 5 } },
    ZNT: { fields: { noteText: 3 } },
  },
};

/** Build the profile above; `profiles.genericLab` calls it on its first read. @internal */
export const genericLab = () => defineProfile(options);
