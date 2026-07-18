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
invented (root `CLAUDE.md`; ADR 0018 — "real artifact" includes publicly
available specs, not only private feeds).

| Fixture | Profile | Grounded in |
| --- | --- | --- |
| `epic/adt-a01.hl7` | `profiles.epic` | Epic Bridges Interconnect interface conventions (`open.epic.com/Interface/HL7v2`); Z-segment field names are community-sourced. |
| `cerner/oru-r01.hl7` | `profiles.cerner` | Oracle Health / Cerner Millennium outbound conventions; Z-segment specifics community-sourced. |
| `meditech/adt-a04.hl7` | `profiles.meditech` | MEDITECH EXPANSE/MAGIC tolerant-parser conventions; community-sourced. |
| `athena/adt-a01.hl7` | `profiles.athena` | athenahealth ambulatory date conventions; community-sourced. |
| `genericLab/oru-r01.hl7` | `profiles.genericLab` | Generic reference-lab (ASTM-era / ISO date) conventions; community-sourced. |
| `visage/orm-o01.hl7` | `profiles.visage` | **Public** — [Visage 7 HL7 Interface Specification](https://www.visageimaging.com/downloads/Visage7/Visage7_HL7InterfaceSpecification.pdf) (V23.00, Jun 2026, Visage Imaging GmbH): §4.4 ORM^O01 example + the ZDS segment table ("Study Instance UID … contained in the first component of the first field of the ZDS Segment"). The `ZDS` DICOM Study Instance UID is the IHE Radiology RIS↔PACS bridge segment. |
| `philips/orm-o01.hl7` | `profiles.philips` | **Public** — [Vue PACS 12.2.8 HL7 Interface Specifications](https://www.documents.philips.com/assets/Conformance%20Statements/20240409/8941f89d89aa4983aab7b14d00db578c.pdf) (Philips, doc HA1669 Rev A): §5.11 `ZDS` (Study Instance UID, RP composite), §5.12 `ZLK` (linked studies/orders), §5.13 `ZAO` (order additional details — field positions transcribed verbatim incl. the spec's missing field 7). Order-filler side. |
| `philips/adt-a08.hl7` | `profiles.philips` | **Public** — same spec, patient/visit-filler side: §5.14 `ZEB` (encrypted patient info), §5.15 `ZAP` (patient additional details — incl. the spec's missing field 2), §5.16 `ZAV` (visit additional details). |

The first five profiles' Z-segment field maps are **community-sourced** priors
(honest uncertainty #2 in the hl7 roadmap): they predate the public-corpus
mandate and are not vendor-spec-cited. `visage` and `philips` are the
vendor-shape fixtures grounded in a **publicly published, downloadable vendor
interface specification** (ADR 0018) — `visage` first, `philips` second.

The `philips` fixtures carry base64 blobs in the `ZAO`/`ZAP`/`ZAV` "additional
details" fields and the `ZEB` "encrypted patient info" field. Every one is
**synthetic**: the base64 decodes to a placeholder `<GenericData…/>` stub or a
literal `{synthetic-non-real-encrypted-blob}` marker — no real patient
information is encoded, encrypted, or committed. `ZEB` genuinely carries
encrypted PHI in production, which is exactly why the profile *names* the field
(so a consumer knows not to log it) and why this fixture's value is a marker,
not a real ciphertext. The fixture's DICOM Study Instance UID is
**synthetic**: it uses the Medical Connections free UID root
(`1.2.826.0.1.3680043`, publicly offered for exactly this use) with a made-up
suffix — mirroring the vendor example's own choice of a non-DICOM-standard
instance-UID root, and deliberately **not** the reserved DICOM `1.2.840.10008`
arc. Note a *real* Study Instance UID is a HIPAA Safe-Harbor identifier
(§164.514(b)(2)(i)(R), "any other unique identifying number") and must be
de-identified before it leaves the box — only this synthetic one is safe to
commit.
