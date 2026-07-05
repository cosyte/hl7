/**
 * EX-01 — Extract patient info from a parsed ADT^A01 message using the
 * named-helper API (`msg.patient`, `msg.meta`). Demonstrates the
 * zero-HL7-knowledge access path promised by the library's core value prop.
 *
 * Run from repo root:
 *
 *     pnpm tsx examples/extract-patient-info.ts
 *
 * Expected stdout starts with `Patient MRN:` (marker asserted by
 * `scripts/run-examples.ts`).
 */

import { readFileSync } from "node:fs";

import { parseHL7 } from "@cosyte/hl7";

const raw = readFileSync("examples/data/adt-a01.hl7", "utf8");
const msg = parseHL7(raw);

console.log("Patient MRN:", msg.patient.mrn);
console.log("Full name:", msg.patient.fullName);
// Datetimes are a fidelity TS — precision + timezone preserved, no eager Date.
console.log("DOB:", msg.patient.dateOfBirth?.raw, `(precision: ${msg.patient.dateOfBirth?.precision})`);
console.log("Sex:", msg.patient.sex);
console.log("Message type:", msg.meta.type);
console.log("Message timestamp:", msg.meta.timestamp?.raw);
console.log(
  "-> extracted 6 fields via msg.patient + msg.meta (zero HL7-path knowledge required)",
);
