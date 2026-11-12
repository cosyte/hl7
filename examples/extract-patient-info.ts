/**
 * EX-01: Extract patient info from a parsed ADT^A01 message using the
 * named-helper API (`msg.patient`, `msg.meta`). Demonstrates the
 * zero-HL7-knowledge access path promised by the library's core value prop.
 *
 * It reads the fields that identify the patient into variables and prints
 * only what is safe to log: the message type, codes, booleans, counts and the
 * precision of a date. An example that logs a patient's name teaches a reader
 * to log one, so none of these values is printed, synthetic as they are.
 *
 * Run from repo root:
 *
 *     pnpm tsx examples/extract-patient-info.ts
 *
 * Expected stdout starts with `Message type:` (marker asserted by
 * `scripts/run-examples.ts`).
 */

import { readFileSync } from "node:fs";

import { parseHL7 } from "@cosyte/hl7";

const raw = readFileSync("examples/data/adt-a01.hl7", "utf8");
const msg = parseHL7(raw);

// Fields that identify a person: read, never printed or logged.
const mrn = msg.patient?.mrn; // "MRN12345", synthetic
const fullName = msg.patient?.fullName; // "John Q Doe", synthetic
const dateOfBirth = msg.patient?.dateOfBirth; // raw "19800115", synthetic

// What is safe to log.
console.log("Message type:", msg.meta.type);
console.log("Has a record number:", mrn !== undefined);
console.log("Has a name:", fullName !== undefined);
// Datetimes are a fidelity TS: precision + timezone preserved, no eager Date.
console.log("Birth date precision:", dateOfBirth?.precision);
console.log("Message time precision:", msg.meta.timestamp?.precision);
console.log("Warnings:", msg.warnings.length);
console.log(
  "-> read 5 fields via msg.patient + msg.meta (zero HL7-path knowledge required)",
);
