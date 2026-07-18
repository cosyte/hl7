/**
 * Philips Vue PACS ("IS Link") imaging HL7 interface quirks. The Vue PACS
 * IS Link component receives RIS-side ORM/ADT feeds and carries its
 * PACS-specific data in six custom Z-segments the HL7 standard does not
 * define — one per *filler role*:
 *
 * - **`ZDS`** — Order Filler: the DICOM **Study Instance UID** (field 1,
 *   first component), the RIS↔PACS bridge (as in the IHE Radiology TF and
 *   the `visage` profile); IS Link uses it to update the accession number.
 * - **`ZLK`** — Order Filler: study/order **linking** ids (external
 *   workitem id, order link id) that group studies and orders.
 * - **`ZAO`** — Order Filler: order **additional details** (a base64 XML
 *   key/value blob) plus modality, body part, transfer/acquisition status,
 *   technician + radiologist names/ids, and vendor "custom" string/number/
 *   date slots.
 * - **`ZEB`** — Patient Filler: an **encrypted** patient-info blob (base64).
 * - **`ZAP`** — Patient Filler: patient **additional details** (base64 XML)
 *   plus patient "custom" string/number/date slots.
 * - **`ZAV`** — Visit Filler: visit **additional details** (base64 XML).
 *
 * Grounded in the public **Vue PACS 12.2.8 HL7 Interface Specifications**
 * (Philips, document HA1669 Rev A), §§5.11–5.16 — a publicly downloadable
 * vendor interface spec, not an invented quirk (ADR 0018). The spec's
 * `TS` timestamps are the HL7-native `YYYYMMDDHHMMSS` form (§2.6), so this
 * profile declares **no** custom `dateFormats` — only the Z-segments.
 *
 * Field positions are transcribed verbatim from the spec's segment tables,
 * including two of its own gaps/quirks: `ZAO` has **no field 7** (the table
 * jumps 6 → 8) and `ZAP` has **no field 2** (jumps 1 → 3); the three
 * `ZAO`/`ZAP` "Custom Date" rows are all printed "…Date 1" in the spec (a
 * transcription slip) but sit at consecutive positions, so they are named
 * `…CustomDate1/2/3` here to keep each field name unique.
 *
 * `ZEB` holds *encrypted* patient information and `ZAP`/`ZAV` carry
 * patient/visit blobs — naming the field is exactly how a consumer learns
 * that segment is PHI-bearing and must not be logged. This profile only
 * *names* the fields; it never decodes, decrypts, or rewrites them.
 *
 * Authored from the public `defineProfile()` API — zero privileged internal
 * coupling. Consumers extend this profile via
 * `defineProfile({ name: '...', extends: profiles.philips, ... })`.
 *
 * @example
 * ```ts
 * import { parseHL7, profiles } from "@cosyte/hl7";
 * const msg = parseHL7(raw, profiles.philips);
 * const zds = msg.allSegments().find((s) => s.type === "ZDS");
 * console.log(zds?.get("studyInstanceUid")?.value); // "1.2.826.0.1.3680043.10.99999.20250326.7"
 * ```
 */

import { defineProfile } from "./define.js";

/**
 * Built-in Philips Vue PACS ("IS Link") imaging profile (BIP-08). See file
 * header for rationale; use via `parseHL7(raw, profiles.philips)`.
 *
 * @example
 * ```ts
 * import { parseHL7, profiles } from "@cosyte/hl7";
 * const msg = parseHL7(raw, profiles.philips);
 * ```
 */
export const philips = defineProfile({
  name: "philips",
  description:
    "Philips Vue PACS (IS Link) imaging — ZDS/ZLK/ZAO/ZEB/ZAP/ZAV order/patient/visit-filler Z-segments",
  customSegments: {
    // §5.11 ZDS — Order Filler: DICOM Study Instance UID (RP, comp 1).
    ZDS: { fields: { studyInstanceUid: 1 } },
    // §5.12 ZLK — Order Filler: study/order linking ids.
    ZLK: { fields: { externalWorkitemId: 1, orderLinkId: 2 } },
    // §5.13 ZAO — Order Filler: order additional details (note: no field 7).
    ZAO: {
      fields: {
        orderAdditionalDetails: 1,
        orderWithNoImages: 2,
        modality: 3,
        bodyPart: 4,
        resultTransferStatus: 5,
        departmentId: 6,
        device: 8,
        section: 9,
        orderCustomString1: 10,
        orderCustomString2: 11,
        orderCustomString3: 12,
        orderCustomString4: 13,
        orderCustomString5: 14,
        orderCustomString6: 15,
        orderCustomString7: 16,
        orderCustomNumber1: 17,
        orderCustomNumber2: 18,
        orderCustomDate1: 19,
        orderCustomDate2: 20,
        orderCustomDate3: 21,
        technicianFamilyName: 22,
        technicianGivenName: 23,
        technicianMiddleName: 24,
        technicianId: 25,
        radiologistFamilyName: 26,
        radiologistGivenName: 27,
        radiologistMiddleName: 28,
        radiologistId: 29,
        orderCreatedBy: 30,
        orderUpdatedBy: 31,
        acquisitionStatus: 32,
      },
    },
    // §5.14 ZEB — Patient Filler: encrypted patient-info blob (PHI-bearing).
    ZEB: { fields: { encryptedPatientInfo: 1 } },
    // §5.15 ZAP — Patient Filler: patient additional details (note: no field 2).
    ZAP: {
      fields: {
        patientAdditionalDetails: 1,
        patientCustomString1: 3,
        patientCustomString2: 4,
        patientCustomString3: 5,
        patientCustomString4: 6,
        patientCustomString5: 7,
        patientCustomString6: 8,
        patientCustomString7: 9,
        patientCustomNumber1: 10,
        patientCustomNumber2: 11,
        patientCustomDate1: 12,
        patientCustomDate2: 13,
        patientCustomDate3: 14,
      },
    },
    // §5.16 ZAV — Visit Filler: visit additional details.
    ZAV: { fields: { visitAdditionalDetails: 1 } },
  },
});
