/**
 * Property tests for the conformance-profile engine (roadmap Phase U). These
 * are the generative analogues of the example-based
 * `test/conformance-validate.test.ts`, pinning the acceptance invariants across
 * thousands of message × profile pairs:
 *
 *   1. **Never throws** — for ANY message drawn from a valid pool and ANY
 *      profile-shaped object (well-formed or garbage), `validateAgainstProfile`
 *      returns a result; it never throws.
 *   2. **Read-only** — the message's serialization is byte-identical before and
 *      after validation.
 *   3. **Valid ⇒ zero findings** — an all-optional, constraint-free profile
 *      never fabricates a finding for any message.
 *   4. **Well-formed, PHI-safe findings** — every finding carries a valid
 *      severity, a structural locus, and a non-empty message string.
 */

import { describe, expect, it } from "vitest";
import fc from "fast-check";

import { parseHL7, validateAgainstProfile, type ConformanceProfile } from "../../src/index.js";

const RUN_CONFIG = { numRuns: 500, seed: 0x07_21_2026 } as const;

/** A pool of valid messages to validate against (parsed once). */
const MESSAGE_POOL = [
  "MSH|^~\\&|A|B|C|D|20260101||ADT^A01|M1|P|2.5\rEVN|A01|20260101\rPID|1||MRN1^^^H^MR||Doe^John||19800101|M",
  "MSH|^~\\&|LAB|MAIN|EHR|REF|20260101||ORU^R01|M2|P|2.5\rPID|1||MRN2^^^H^MR||Roe^Jane||19700101|F\rOBR|1|O1|F1|CBC^^L\rOBX|1|NM|WBC^^LN||7.5|x|4-11|N|||F",
  "MSH|^~\\&|X|Y|Z|W|20260101||SIU^S12|M3|P|2.5", // MSH only
  "MSH|^~\\&|A|B|C|D|20260101||ADT^A08|M4|P|2.3\rPID|1||MRN3~MRN4||Poe^Al||19900101|U",
].map((raw) => parseHL7(raw));

const VALID_USAGE = fc.constantFrom("R", "RE", "C", "CE", "O", "X");
const VALID_SEGMENT = fc.constantFrom("MSH", "PID", "PV1", "OBX", "EVN", "OBR", "ZFA");

/** A cardinality arbitrary that mixes valid and garbage shapes. */
const cardinalityArb = fc.oneof(
  fc.record({ min: fc.nat({ max: 4 }), max: fc.nat({ max: 4 }) }),
  fc.record({ min: fc.nat({ max: 3 }), max: fc.constant("*") }),
  fc.record({ min: fc.constant(-1) }), // malformed
  fc.constant<Record<string, unknown>>({}),
);

/** A field-rule arbitrary — valid indices mixed with garbage. */
const fieldRuleArb = fc.record(
  {
    field: fc.oneof(fc.integer({ min: 1, max: 20 }), fc.integer({ min: -3, max: 0 }), fc.string()),
    name: fc.option(fc.string(), { nil: undefined }),
    usage: fc.option(fc.oneof(VALID_USAGE, fc.string()), { nil: undefined }),
    cardinality: fc.option(cardinalityArb, { nil: undefined }),
    length: fc.option(fc.oneof(fc.nat({ max: 10 }), fc.integer({ min: -5, max: -1 })), {
      nil: undefined,
    }),
    component: fc.option(fc.integer({ min: 1, max: 6 }), { nil: undefined }),
    valueSet: fc.option(fc.array(fc.string(), { maxLength: 5 }), { nil: undefined }),
  },
  { requiredKeys: ["field"] },
);

/** A segment-rule arbitrary. */
const segmentRuleArb = fc.record(
  {
    segment: fc.oneof(VALID_SEGMENT, fc.string()),
    usage: fc.option(fc.oneof(VALID_USAGE, fc.string()), { nil: undefined }),
    cardinality: fc.option(cardinalityArb, { nil: undefined }),
    fields: fc.option(fc.array(fieldRuleArb, { maxLength: 6 }), { nil: undefined }),
  },
  { requiredKeys: ["segment"] },
);

/** A whole-profile arbitrary — mixes well-formed and malformed shapes. */
const profileArb = fc.record({
  name: fc.oneof(fc.string({ minLength: 1 }), fc.integer()),
  segments: fc.oneof(fc.array(segmentRuleArb, { maxLength: 6 }), fc.constant(undefined)),
});

describe("property: conformance engine invariants", () => {
  it("never throws for any message × any profile-shaped object", () => {
    fc.assert(
      fc.property(fc.nat({ max: MESSAGE_POOL.length - 1 }), profileArb, (idx, profile) => {
        const msg = MESSAGE_POOL[idx];
        if (msg === undefined) return;
        const result = validateAgainstProfile(msg, profile as unknown as ConformanceProfile);
        expect(Array.isArray(result.findings)).toBe(true);
        expect(typeof result.profileName).toBe("string");
      }),
      RUN_CONFIG,
    );
  });

  it("validation never mutates the message (serialization stable)", () => {
    fc.assert(
      fc.property(fc.nat({ max: MESSAGE_POOL.length - 1 }), profileArb, (idx, profile) => {
        const msg = MESSAGE_POOL[idx];
        if (msg === undefined) return;
        const before = msg.toString();
        validateAgainstProfile(msg, profile as unknown as ConformanceProfile);
        expect(msg.toString()).toBe(before);
      }),
      RUN_CONFIG,
    );
  });

  it("every finding is well-formed (valid severity, structural locus, non-empty message)", () => {
    fc.assert(
      fc.property(fc.nat({ max: MESSAGE_POOL.length - 1 }), profileArb, (idx, profile) => {
        const msg = MESSAGE_POOL[idx];
        if (msg === undefined) return;
        const { findings } = validateAgainstProfile(msg, profile as unknown as ConformanceProfile);
        for (const f of findings) {
          expect(["error", "warning", "info"]).toContain(f.severity);
          expect(typeof f.locus.segment).toBe("string");
          expect(f.message.length).toBeGreaterThan(0);
        }
      }),
      RUN_CONFIG,
    );
  });

  it("no finding message ever echoes the offending field value (generative PHI check)", () => {
    // Inject a distinctive value into PID-8 that is guaranteed NOT in the value
    // set, then assert it never surfaces in any finding message — the value-set,
    // length, and required paths all fire, and none may leak the value.
    fc.assert(
      fc.property(
        // A distinctive sentinel — the "ZQV" prefix cannot occur inside the
        // finding vocabulary (no fixed message word contains it), so a hit means
        // a genuine value leak, never a coincidental substring of English prose.
        fc.stringMatching(/^[A-Za-z0-9]{1,9}$/u).map((s) => `ZQV${s}`),
        (secret) => {
          const raw =
            `MSH|^~\\&|A|B|C|D|20260101||ADT^A01|M1|P|2.5\rPID|1||MRN9^^^H^MR||Doe^John||19800101|` +
            secret;
          const msg = parseHL7(raw);
          const profile: ConformanceProfile = {
            name: "phi-probe",
            segments: [
              {
                segment: "PID",
                fields: [{ field: 8, name: "Sex", valueSet: ["M", "F", "U"], length: 1 }],
              },
            ],
          };
          const { findings } = validateAgainstProfile(msg, profile);
          expect(findings.length).toBeGreaterThan(0); // value-not-in-set (+ length if >1 char)
          for (const f of findings) expect(f.message).not.toContain(secret);
        },
      ),
      RUN_CONFIG,
    );
  });

  it("valid ⇒ zero findings: an all-optional, constraint-free profile never fires", () => {
    const constraintFree = fc.array(
      fc.record({ segment: VALID_SEGMENT, usage: fc.constant("O" as const) }),
      { maxLength: 6 },
    );
    fc.assert(
      fc.property(fc.nat({ max: MESSAGE_POOL.length - 1 }), constraintFree, (idx, segments) => {
        const msg = MESSAGE_POOL[idx];
        if (msg === undefined) return;
        const profile: ConformanceProfile = { name: "all-optional", segments };
        expect(validateAgainstProfile(msg, profile).findings).toEqual([]);
      }),
      RUN_CONFIG,
    );
  });
});
