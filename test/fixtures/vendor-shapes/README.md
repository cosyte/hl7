# vendor-shapes fixtures

One synthetic fixture per built-in vendor profile (`src/profiles/*`). Each pairs
with a `describe` block in `test/profiles-builtins.test.ts` that asserts:

- the profile's declared Z-segment(s) parse without `UNKNOWN_SEGMENT`,
- the Z-segment fields resolve by their declared names,
- the vendor's date format resolves (where the profile declares one),
- parse → serialize round-trips byte-identically with and without the profile.

All fixtures are **synthetic**: `\r`-separated, patient `Doe^John` (and other
allow-listed names in `scripts/phi-allow-list.txt`), no real PHI. They are swept
by `scripts/phi-scan.ts` (`pnpm phi-scan`).

## Provenance (honest grounding)

A vendor quirk is encoded **only when a real artifact grounds it**, never
invented (root `CLAUDE.md`; ADR 0018: "real artifact" includes publicly
available specs, not only private feeds).

| Fixture | Profile | Grounded in |
| --- | --- | --- |
| `epic/adt-a01.hl7` | `profiles.epic` | Epic Bridges Interconnect interface conventions (`open.epic.com/Interface/HL7v2`); Z-segment field names are community-sourced. |
| `cerner/oru-r01.hl7` | `profiles.cerner` | Oracle Health / Cerner Millennium outbound conventions; Z-segment specifics community-sourced. |
| `meditech/dft-p03.hl7` | `profiles.meditech` | **Public**: [MEDITECH Ancillary Charges (LAB/PHA/ITS/IDM) Outbound](https://ehr.meditech.com/sites/default/files/documents/20240613/ancillary-charges-outbound-21.pdf) (Version 2.1, © 2021 Medical Information Technology, Inc.): the DFT `ZF1` ("PROVIDER ENCOUNTER COPAY DATA") + `ZF2` ("ENCOUNTER PROCEDURE DATA") segment field tables. The `YYYYMMDDHHMM` minute-precision timestamp is confirmed by that spec (MSH-7 length 12; EVN-2/PID-7 "Format is YYYYMMDDHHMM") **and** by [MEDITECH Admissions and Registration to Other Vendor Ancillary](https://ehr.meditech.com/sites/default/files/documents/20240613/admissions-registration-outbound-24.pdf) (Version 2.4, © 2021): "Date and Time in Admissions. Format is YYYYMMDDHHMM". |
| `athena/adt-a01.hl7` | `profiles.athena` | athenahealth ambulatory date conventions; community-sourced. |
| `genericLab/oru-r01.hl7` | `profiles.genericLab` | Generic reference-lab (ASTM-era / ISO date) conventions; community-sourced. |
| `visage/orm-o01.hl7` | `profiles.visage` | **Public**: [Visage 7 HL7 Interface Specification](https://www.visageimaging.com/downloads/Visage7/Visage7_HL7InterfaceSpecification.pdf) (V23.00, Jun 2026, Visage Imaging GmbH): §4.4 ORM^O01 example + the ZDS segment table ("Study Instance UID … contained in the first component of the first field of the ZDS Segment"). The `ZDS` DICOM Study Instance UID is the IHE Radiology RIS↔PACS bridge segment. |
| `philips/orm-o01.hl7` | `profiles.philips` | **Public**: [Vue PACS 12.2.8 HL7 Interface Specifications](https://www.documents.philips.com/assets/Conformance%20Statements/20240409/8941f89d89aa4983aab7b14d00db578c.pdf) (Philips, doc HA1669 Rev A): §5.11 `ZDS` (Study Instance UID, RP composite), §5.12 `ZLK` (linked studies/orders), §5.13 `ZAO` (order additional details: field positions transcribed verbatim incl. the spec's missing field 7). Order-filler side. |
| `philips/adt-a08.hl7` | `profiles.philips` | **Public**: same spec, patient/visit-filler side: §5.14 `ZEB` (encrypted patient info), §5.15 `ZAP` (patient additional details: incl. the spec's missing field 2), §5.16 `ZAV` (visit additional details). |
| `va/oru-r01.hl7` | `profiles.va` | **Public**: [Radiology/Nuclear Medicine 5.0 HL7 Interface Specification](https://www.va.gov/vdl/documents/clinical/radiology_nuclear_med/ra5_0hl7is.pdf) (Version 3.6, Patch RA\*5.0\*203, June 2024, U.S. Department of Veterans Affairs; HL7 **v2.4**): the spec documents "ZDS Segment Fields in ORU and ORM" with `ZDS-1` = Study Instance UID (`RP`; UID in comp 1 = ZDS-1.1 "Pointer"). This fixture exercises the **ORU^R01** (result) shape the `visage`/`philips` ORM fixtures do not cover. `ZDS` is the IHE Radiology RIS↔PACS bridge: the same cross-vendor extension as `visage`/`philips`, grounded here in a distinct federal spec. |

`epic`, `cerner`, `athena`, and `genericLab` still carry Z-segment field maps
that are **community-sourced** priors (honest uncertainty #2 in the hl7
roadmap): they predate the public-corpus mandate and are not yet vendor-spec-
cited. `meditech` has been **re-grounded** to a publicly downloadable MEDITECH
interface specification (HL7-I, ADR 0018): its community-sourced `ZVI` "visit
info" prior (which had no citable public source) was replaced with the DFT
`ZF1`/`ZF2` charge segments that MEDITECH documents verbatim in the Ancillary
Charges spec, and its minute-precision date format is now spec-confirmed.
`visage`, `philips`, and `va` are the vendor-shape fixtures grounded in a
**publicly published, downloadable vendor/agency interface specification**
(ADR 0018): `visage` first, `philips` second, the `meditech` re-grounding
third, and `va` (a **federal** VistA Radiology/Nuclear Medicine spec) fourth.
The `va` ZDS is the **same IHE Radiology cross-vendor bridge segment** as
`visage`/`philips` (not a VA-proprietary quirk) so `profiles.va`'s value is a
distinct named federal source plus the ORU (result) message shape the imaging-
vendor ORM fixtures do not cover; its synthetic Study Instance UID reuses the
Medical Connections free UID root (`1.2.826.0.1.3680043`), not the reserved
DICOM `1.2.840.10008` arc (a real Study Instance UID is a HIPAA Safe-Harbor
identifier and must be de-identified before it leaves the box).

The `philips` fixtures carry base64 blobs in the `ZAO`/`ZAP`/`ZAV` "additional
details" fields and the `ZEB` "encrypted patient info" field. Every one is
**synthetic**: the base64 decodes to a placeholder `<GenericData…/>` stub or a
literal `{synthetic-non-real-encrypted-blob}` marker. No real patient
information is encoded, encrypted, or committed. `ZEB` genuinely carries
encrypted PHI in production, which is exactly why the profile *names* the field
(so a consumer knows not to log it) and why this fixture's value is a marker,
not a real ciphertext. The fixture's DICOM Study Instance UID is
**synthetic**: it uses the Medical Connections free UID root
(`1.2.826.0.1.3680043`, publicly offered for exactly this use) with a made-up
suffix, mirroring the vendor example's own choice of a non-DICOM-standard
instance-UID root, and deliberately **not** the reserved DICOM `1.2.840.10008`
arc. Note a *real* Study Instance UID is a HIPAA Safe-Harbor identifier
(§164.514(b)(2)(i)(R), "any other unique identifying number") and must be
de-identified before it leaves the box. Only this synthetic one is safe to
commit.
