/**
 * Visage 7 imaging/PACS HL7 interface quirks. Radiology/PACS order feeds
 * carry the DICOM **Study Instance UID** in a `ZDS` Z-segment (field 1,
 * first component) so the receiving image manager can correlate the HL7
 * order with the DICOM study — the classic RIS/PACS ↔ HL7 bridge segment
 * defined by the IHE Radiology Technical Framework. BIP-07.
 *
 * Grounded in the public **Visage 7 – HL7 Interface Specification**
 * (V23.00, Jun 2026, Visage Imaging GmbH), §4.4 "ORM Messages" + the ZDS
 * segment table ("Study Instance UID … contained in the first component of
 * the first field of the ZDS Segment") — a publicly downloadable vendor
 * interface spec, not an invented quirk (ADR 0018). Dates in that spec use
 * the HL7-native `YYYYMMDDHHMMSS` form, so this profile declares **no**
 * custom `dateFormats` — only the ZDS segment.
 *
 * Authored from the public `defineProfile()` API — zero privileged internal
 * coupling. Consumers extend this profile via
 * `defineProfile({ name: '...', extends: profiles.visage, ... })`.
 *
 * @example
 * ```ts
 * import { parseHL7, profiles } from "@cosyte/hl7";
 * const msg = parseHL7(raw, profiles.visage);
 * const zds = msg.allSegments().find((s) => s.type === "ZDS");
 * console.log(zds?.get("studyInstanceUid")?.value); // "1.2.826.0.1.3680043.10.99999.20250326.1"
 * ```
 */

import { defineProfile } from "./define.js";

/**
 * Built-in Visage 7 imaging/PACS profile (BIP-07). See file header for
 * rationale; use via `parseHL7(raw, profiles.visage)`.
 *
 * @example
 * ```ts
 * import { parseHL7, profiles } from "@cosyte/hl7";
 * const msg = parseHL7(raw, profiles.visage);
 * ```
 */
export const visage = defineProfile({
  name: "visage",
  description: "Visage 7 imaging/PACS — ZDS DICOM Study Instance UID segment (IHE RAD)",
  customSegments: {
    ZDS: { fields: { studyInstanceUid: 1 } },
  },
});
