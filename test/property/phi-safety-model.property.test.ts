/**
 * PHI safety on the **parsed model**, as distinct from the diagnostic surfaces.
 *
 * `phi-safety.property.test.ts` and `phi-safety-surfaces.property.test.ts`
 * assert that no field VALUE reaches a warning or error **message**. That is a
 * necessary property and it is not a sufficient one, which this file exists to
 * say out loud.
 *
 * A message fix protects **this package's** diagnostics. It does nothing for a
 * downstream package that reads the model and builds its **own** diagnostics
 * from it. `Segment.type` presents itself as a structural identifier, so a
 * consumer reasonably treats it as safe to interpolate into a label, a locus or
 * a report. When a field-internal line break forges a segment, that "identifier"
 * was the entire remainder of a narrative field: thousands of characters of
 * clinical prose, on lenient defaults, with no options set. Bounding the message
 * left it untouched.
 *
 * So the invariant here is stated over the model, not the message: **a model
 * field that claims to be an identifier carries a bounded identifier.**
 *
 * ## What is deliberately NOT bounded, and why that is not a hole
 *
 * The model separates **identifiers** from **values**. Values are the message
 * content and bounding them would be a mis-parse, not a fix:
 *
 *   - `Meta.*` is the documented value view of the MSH header (`controlId`,
 *     `sendingApp`, and `version` as MSH-12 literally contained it).
 *   - `Segment.fields`, `Segment.raw` and `Hl7Message.rawSegments` are the raw
 *     tokenization, load-bearing for the byte-verbatim round-trip guarantee:
 *     `to-string.ts` and `emit-field.ts` serialize from `raw.name`.
 *   - `toString()` / `prettyPrint()` ARE the message.
 *   - `toJSON()` is a documented raw-tree mirror of it. Note the precise
 *     reason it is not bounded: there is no deserializer for
 *     `SerializedMessage` anywhere in `src/`, so "it must round-trip" would be
 *     false. What holds is the asserted `JSON.stringify(msg) === JSON.stringify(snap)`
 *     contract, which bounding a name would break.
 *
 * Those are content surfaces and are documented as such. The identifiers below
 * are not, and a consumer cannot tell the difference by looking at the type.
 */

import { describe, expect, it } from "vitest";
import fc from "fast-check";

import { parseHL7 } from "../../src/index.js";

const RUN_CONFIG = { numRuns: 100, seed: 0x07_30_2026 } as const;

/**
 * Longest legitimate value any bounded identifier can hold. Kept only as a
 * coarse backstop: the real assertion is {@link expectIdentifierShaped}.
 *
 * A length assertion alone is the weakness this whole slice is about. A
 * regression from the shape test back to a 16-character truncation would emit
 * sixteen characters of a patient name and still satisfy `length <= 16`, which
 * is precisely the "green over an unreachable case" failure the message-only
 * tests already made once here. So length is asserted second, and shape first.
 */
const IDENTIFIER_BOUND = 16;

/** The withheld sentinel, which is a legitimate value for a bounded field. */
const WITHHELD = "<withheld>";

/**
 * Assert a model identifier is either absent, withheld, or actually
 * identifier-shaped. This is what fails if the bound ever degrades into a
 * truncation, which a length check cannot see.
 */
function expectIdentifierShaped(value: string, field: string): void {
  const ok = value === "" || value === WITHHELD || /^[A-Za-z0-9][A-Za-z0-9._^-]{0,15}$/.test(value);
  expect(
    ok,
    `${field} is neither absent, withheld, nor identifier-shaped: ${JSON.stringify(value)}`,
  ).toBe(true);
  expect(value.length, `${field} exceeded the coarse backstop`).toBeLessThanOrEqual(
    IDENTIFIER_BOUND,
  );
}

function messageWithForgedSegment(marker: string, repeats: number): string {
  return [
    "MSH|^~\\&|SENDAPP|SENDFAC|RECVAPP|RECVFAC|20250101||ORU^R01|CTRL1|P|2.5",
    "PID|||X||Y||19800101|M",
    `OBX|1|TX|IMP||Impression: unremarkable.\n${(marker + " continued prose ").repeat(repeats)}`,
  ].join("\r");
}

describe("model invariant: an identifier field carries a bounded identifier", () => {
  it("Segment.type never carries narrative prose from a forged segment", () => {
    const msg = parseHL7(messageWithForgedSegment("ZZMARKERZZ", 200));
    const types = msg.allSegments().map((s) => s.type);

    // Sanity: the forged segment must exist, or the bound assertion is vacuous.
    expect(types.length, "fixture produced no segments").toBeGreaterThan(2);

    for (const t of types) {
      expectIdentifierShaped(t, "Segment.type");
      expect(t.includes("ZZMARKERZZ"), `Segment.type leaked forged content: ${t}`).toBe(false);
    }
  });

  it("Hl7Message.version and MessageStructure identifiers stay bounded on junk input", () => {
    const junk = "XX".repeat(500);
    const withJunkVersion = [
      "MSH|^~\\&|A|B|C|D|20250101||ORU^R01|M1|P|" + junk,
      "OBX|1|TX|I||x",
    ].join("\r");
    expectIdentifierShaped(parseHL7(withJunkVersion).version, "Hl7Message.version");

    const withJunkType = [
      "MSH|^~\\&|A|B|C|D|20250101||" + junk + "|M1|P|2.5",
      "OBX|1|TX|I||x",
    ].join("\r");
    const structure = parseHL7(withJunkType).structure;
    expectIdentifierShaped(structure.messageCode ?? "", "MessageStructure.messageCode");
    expectIdentifierShaped(structure.triggerEvent ?? "", "MessageStructure.triggerEvent");
  });

  it("property: no forged-segment content of any size reaches Segment.type", () => {
    const markerChar = fc.constantFrom(..."ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789-, ".split(""));
    // minLength 3, not 6: at 6 the arb can never generate the SHORT residue the
    // shape legitimately accepts, so the accepted case would go untested.
    const tokenArb = fc
      .stringOf(markerChar, { minLength: 3, maxLength: 40 })
      .filter((t) => t.trim().length >= 3);

    fc.assert(
      fc.property(tokenArb, fc.integer({ min: 1, max: 50 }), (token, repeats) => {
        const msg = parseHL7(messageWithForgedSegment(token, repeats));
        for (const seg of msg.allSegments()) {
          expectIdentifierShaped(seg.type, "Segment.type");
          expect(seg.type.includes(token.trim().slice(0, 6))).toBe(false);
        }
      }),
      RUN_CONFIG,
    );
  });

  it("real segment identifiers, including Z-segments and lowercase, are untouched", () => {
    const msg = parseHL7(
      [
        "MSH|^~\\&|A|B|C|D|20250101||ADT^A01|M1|P|2.5",
        "PID|||MRN1||Doe^Jane||19800101|F",
        "ZZZ|vendor|payload",
      ].join("\r"),
    );
    expect(msg.allSegments().map((s) => s.type)).toEqual(["MSH", "PID", "ZZZ"]);
    expect(msg.segments("PID").length).toBe(1);
    expect(msg.segments("ZZZ").length).toBe(1);
    expect(msg.version).toBe("2.5");
  });
});
