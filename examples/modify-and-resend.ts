/**
 * EX-03 — Parse, mutate one field, and re-serialize to spec-clean HL7.
 * Demonstrates the mutation + round-trip access path and Postel's Law:
 * the serializer always produces spec-clean HL7, regardless of input
 * quirks.
 *
 * Run from repo root:
 *
 *     pnpm tsx examples/modify-and-resend.ts
 *
 * Expected stdout contains `Re-serialized HL7` (marker asserted by
 * `scripts/run-examples.ts`).
 */

import { readFileSync } from "node:fs";

import { parseHL7 } from "@cosyte/hl7";

const raw = readFileSync("examples/data/adt-mutate-source.hl7", "utf8");
const msg = parseHL7(raw);

console.log("Original PV1.3 (location):", msg.get("PV1.3.1"));
msg.setField("PV1.3.1", "NEW-WARD");
console.log("Modified PV1.3 (location):", msg.get("PV1.3.1"));

const reserialized = msg.toString();
console.log("--- Re-serialized HL7 ---");
console.log(reserialized);
console.log(
  "-> parse -> setField -> toString() produced spec-clean HL7 (Postel's Law)",
);
