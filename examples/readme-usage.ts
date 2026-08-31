/**
 * The `## Usage` block from the root README.md, kept executable.
 *
 * The README shows this code and the output beside it. This file runs the
 * same code and then asserts that it printed exactly those lines, so the
 * output in the README is verified by `pnpm examples` rather than asserted
 * by whoever last edited the prose. A reader who copies the block gets
 * working code; if that ever stops being true, this example fails.
 *
 * Run from repo root:
 *
 *     pnpm tsx examples/readme-usage.ts
 *
 * Keep the region between the two BEGIN/END markers byte-identical to the
 * fenced `ts` block under `## Usage`, and keep EXPECTED_OUTPUT identical to
 * the fenced output block that follows it.
 */

/**
 * Harness, not part of the README block: record every line the block prints
 * while still printing it, so the assertion below can compare.
 */
const printed: string[] = [];
const realLog = console.log.bind(console);
console.log = (...args: unknown[]): void => {
  printed.push(args.map((a) => (typeof a === "string" ? a : String(a))).join(" "));
  realLog(...args);
};

// --- BEGIN README ## Usage block ---
import { parseHL7 } from "@cosyte/hl7";

// An ADT^A01 admit. HL7 v2 separates segments with a carriage return.
const raw = [
  "MSH|^~\\&|EPIC|MAIN|LIS|REF|20260419101500||ADT^A01^ADT_A01|EX00001|P|2.5",
  "EVN|A01|20260419101500",
  "PID|1||MRN12345^^^HOSP^MR||Doe^John^Q||19800115|M",
  "PV1|1|I|ICU^101^A^HOSP",
].join("\r");

const msg = parseHL7(raw);

console.log("Patient record number:", msg.patient?.mrn);
console.log("Full name:", msg.patient?.fullName);
console.log("Date of birth:", msg.patient?.dateOfBirth?.raw);
console.log("Precision:", msg.patient?.dateOfBirth?.precision);
console.log("Message type:", msg.meta.type);
console.log("Sent at:", msg.meta.timestamp?.raw);
console.log("Ward:", msg.visit?.location?.pointOfCare);
// --- END README ## Usage block ---

/** The output block the README shows beside the code above. */
const EXPECTED_OUTPUT = [
  "Patient record number: MRN12345",
  "Full name: John Q Doe",
  "Date of birth: 19800115",
  "Precision: day",
  "Message type: ADT^A01^ADT_A01",
  "Sent at: 20260419101500",
  "Ward: ICU",
];

console.log = realLog;

if (printed.length !== EXPECTED_OUTPUT.length) {
  console.error(
    `FAIL readme-usage: printed ${String(printed.length)} line(s), the README shows ${String(EXPECTED_OUTPUT.length)}.`,
  );
  process.exit(1);
}

for (let i = 0; i < EXPECTED_OUTPUT.length; i++) {
  if (printed[i] !== EXPECTED_OUTPUT[i]) {
    console.error(
      `FAIL readme-usage: line ${String(i + 1)} of the README output block is stale.\n` +
        `  README: ${EXPECTED_OUTPUT[i] ?? ""}\n` +
        `  actual: ${printed[i] ?? ""}`,
    );
    process.exit(1);
  }
}
