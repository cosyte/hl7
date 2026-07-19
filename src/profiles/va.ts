/**
 * VA VistA Radiology / Nuclear Medicine imaging HL7 interface quirks. The
 * Veterans Affairs VistA Radiology package exchanges HL7 **v2.4** messages
 * with commercial RIS/PACS systems and carries the DICOM **Study Instance
 * UID** in a `ZDS` Z-segment (field 1, `RP` "Reference Pointer" composite —
 * the UID sits in the first component, ZDS-1.1 "Pointer"), so the receiving
 * image manager can correlate the HL7 order/result with the DICOM study.
 * This is the same IHE Radiology cross-vendor bridge segment declared by the
 * `visage` and `philips` profiles — `ZDS` is an IHE extension, not a
 * VA-proprietary quirk; the value this profile adds is a **named federal
 * source** grounded in a distinct public spec, plus coverage of the shape the
 * VA spec documents that the imaging-vendor specs do not: `ZDS` on **ORU**
 * result messages (VistA sends `ZDS` in **both ORM and ORU**), not just on
 * the ORM order.
 *
 * Grounded in the public **Radiology/Nuclear Medicine 5.0 HL7 Interface
 * Specification** (Version 3.6, revised for Patch RA*5.0*203, June 2024, U.S.
 * Department of Veterans Affairs), which documents "ZDS Segment Fields in ORU
 * and ORM" with `ZDS-1` = Study Instance UID (`RP`: 1.1 Pointer, 1.2
 * Application ID, 1.3 Type of Data, 1.4 Subtype). It is a publicly
 * downloadable federal interface spec on the VA VistA Documentation Library
 * (`va.gov/vdl`), not an invented quirk (ADR 0018). The spec's messaging is
 * HL7-native v2.4, so its `TS` timestamps use the `YYYYMMDDHHMMSS` form — this
 * profile therefore declares **no** custom `dateFormats`, only the ZDS
 * segment.
 *
 * Authored from the public `defineProfile()` API — zero privileged internal
 * coupling. Consumers extend this profile via
 * `defineProfile({ name: '...', extends: profiles.va, ... })`.
 *
 * @example
 * ```ts
 * import { parseHL7, profiles } from "@cosyte/hl7";
 * const msg = parseHL7(raw, profiles.va);
 * const zds = msg.allSegments().find((s) => s.type === "ZDS");
 * console.log(zds?.get("studyInstanceUid")?.value); // "1.2.826.0.1.3680043.10.99999.20250326.9"
 * ```
 */

import { defineProfile } from "./define.js";

/**
 * Built-in VA VistA Radiology / Nuclear Medicine imaging profile (BIP-09).
 * See file header for rationale; use via `parseHL7(raw, profiles.va)`.
 *
 * @example
 * ```ts
 * import { parseHL7, profiles } from "@cosyte/hl7";
 * const msg = parseHL7(raw, profiles.va);
 * ```
 */
export const va = defineProfile({
  name: "va",
  description:
    "VA VistA Radiology/Nuclear Medicine imaging — ZDS DICOM Study Instance UID segment (ORM + ORU, IHE RAD)",
  customSegments: {
    // ZDS-1 = Study Instance UID (RP), UID in the first component (1.1 Pointer).
    // VA Radiology/Nuclear Medicine 5.0 HL7 IS v3.6 (June 2024): "ZDS Segment
    // Fields in ORU and ORM".
    ZDS: { fields: { studyInstanceUid: 1 } },
  },
});
