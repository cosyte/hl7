/**
 * EX-03: Parse, mutate one field, and re-serialize to spec-clean HL7.
 * Demonstrates the mutation + round-trip access path and Postel's Law:
 * the serializer always produces spec-clean HL7, regardless of input
 * quirks.
 *
 * The re-serialized message carries the patient's identity, so it is sent on,
 * never printed: the example prints its segment count and whether the change
 * survived the round trip.
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

// The whole message: hand it to your transport, never to a log.
const reserialized = msg.toString();
const reparsed = parseHL7(reserialized);
console.log("Re-serialized HL7 segments:", reparsed.allSegments().length);
console.log("Location after round trip:", reparsed.get("PV1.3.1"));
console.log("Warnings after round trip:", reparsed.warnings.length);
console.log(
  "-> parse -> setField -> toString() produced spec-clean HL7 (Postel's Law)",
);
