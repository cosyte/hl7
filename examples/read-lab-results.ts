/**
 * EX-02: Iterate lab observations from an ORU^R01 message using
 * `msg.observations()`. Demonstrates the collection-iteration access path:
 * one call returns every OBX as a typed `Observation` in document order.
 *
 * Run from repo root:
 *
 *     pnpm tsx examples/read-lab-results.ts
 *
 * Expected stdout contains `Observation` (marker asserted by
 * `scripts/run-examples.ts`).
 *
 * Note on types: `obs.identifier` and `obs.units` are `CWE` composites,
 * `.identifier` is the code (e.g. `"WBC"`), `.text` is the human-readable
 * name (e.g. `"White Blood Cells"`). This example prints the codes, the value
 * type and the abnormal flag. The result value itself is part of the
 * patient's record, so it is read into a variable and never printed.
 */

import { readFileSync } from "node:fs";

import { parseHL7 } from "@cosyte/hl7";

const raw = readFileSync("examples/data/oru-r01-lab.hl7", "utf8");
const msg = parseHL7(raw);

const observations = msg.observations();
console.log(`Found ${observations.length} observation(s):`);
for (const obs of observations) {
  const code = obs.identifier.identifier ?? "(no-code)";
  // `units` is a CWE composite; use its `.identifier` component for a
  // unit code (e.g. "g/dL"). Falls back to empty string when OBX-6 is absent.
  const units = obs.units?.identifier ?? "";
  // The result value: read it, never log it. The first one is 7.5, synthetic.
  const value = obs.value;
  console.log(
    `  Observation ${obs.setId ?? "?"}: ${code} ${obs.valueType} ${units}` +
      ` flag=${obs.abnormalFlags ?? "-"} has value=${String(value !== undefined)}`,
  );
}
console.log(
  `-> iterated ${String(observations.length)} observations via msg.observations()`,
);
