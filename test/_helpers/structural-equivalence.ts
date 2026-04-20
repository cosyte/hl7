import { expect } from "vitest";

import { parseHL7 } from "../../src/index.js";

/**
 * SER-02 structural round-trip — asserts `parseHL7(msg.toString())` yields
 * a message with the same `rawSegments` and `encodingCharacters` as the
 * original. Byte-identity is NOT required on the first pass (MLLP / BOM /
 * CRLF / custom-delimiter inputs emit spec-clean bytes).
 *
 * @example
 * ```ts
 * import { readFileSync } from "node:fs";
 * import { assertStructuralRoundTrip } from "./_helpers/structural-equivalence.js";
 * assertStructuralRoundTrip(readFileSync("test/fixtures/canonical/adt-a01.hl7", "utf8"));
 * ```
 */
export function assertStructuralRoundTrip(raw: string): void {
  const original = parseHL7(raw);
  const emitted = original.toString();
  const roundTripped = parseHL7(emitted);
  expect(roundTripped.rawSegments).toEqual(original.rawSegments);
  expect(roundTripped.encodingCharacters).toEqual(original.encodingCharacters);
}
