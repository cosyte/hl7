/**
 * Property tests for the conformance-profile engine (roadmap Phase U). These
 * are the generative analogues of the example-based
 * `test/conformance-validate.test.ts`, pinning the acceptance invariants across
 * thousands of message × profile pairs:
 *
 *   1. **Never throws**: for ANY message drawn from a valid pool and ANY
 *      profile-shaped object (well-formed or garbage), `validateAgainstProfile`
 *      returns a result; it never throws.
 *   2. **Read-only**: the message's serialization is byte-identical before and
 *      after validation.
 *   3. **Valid ⇒ zero findings**: an all-optional, constraint-free profile
 *      never fabricates a finding for any message.
 *   4. **Well-formed, PHI-safe findings**: every finding carries a valid
 *      severity, a structural locus, and a non-empty message string.
 */

import { describe, expect, it } from "vitest";
import fc from "fast-check";

import {
  FINDING_CODES,
  PREDICATE_CONNECTORS,
  PREDICATE_VERBS,
  parseHL7,
  validateAgainstProfile,
  type ConditionPredicate,
  type ConformanceProfile,
  type UsageResolution,
} from "../../src/index.js";

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

/** A field-rule arbitrary: valid indices mixed with garbage. */
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

/** A whole-profile arbitrary: mixes well-formed and malformed shapes. */
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
    // set, then assert it never surfaces in any finding message: the value-set,
    // length, and required paths all fire, and none may leak the value.
    fc.assert(
      fc.property(
        // A distinctive sentinel: the "ZQV" prefix cannot occur inside the
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

// ---------------------------------------------------------------------------
// The wider vocabulary and the caller-supplied resolutions. New arbitraries
// rather than widened ones, so every generator above keeps generating exactly
// what it did before.
// ---------------------------------------------------------------------------

/** The wider declarable vocabulary: seven simple codes plus declared conditionals. */
const WIDE_USAGE = fc.constantFrom(
  "R",
  "RE",
  "C",
  "CE",
  "O",
  "X",
  "B",
  "C(R/X)",
  "C(RE/X)",
  "C(O/B)",
  "C(R/RE)",
  "C(B/B)",
);

/** A field-rule arbitrary over the wider vocabulary, valid indices mixed with garbage. */
const wideFieldRuleArb = fc.record(
  {
    field: fc.oneof(fc.integer({ min: 1, max: 20 }), fc.integer({ min: -3, max: 0 }), fc.string()),
    usage: fc.option(fc.oneof(WIDE_USAGE, fc.string()), { nil: undefined }),
    cardinality: fc.option(cardinalityArb, { nil: undefined }),
    length: fc.option(fc.nat({ max: 10 }), { nil: undefined }),
    valueSet: fc.option(fc.array(fc.string(), { maxLength: 5 }), { nil: undefined }),
  },
  { requiredKeys: ["field"] },
);

/** A whole-profile arbitrary over the wider vocabulary. */
const wideProfileArb = fc.record({
  name: fc.oneof(fc.string({ minLength: 1 }), fc.integer()),
  segments: fc.oneof(
    fc.array(
      fc.record(
        {
          segment: fc.oneof(VALID_SEGMENT, fc.string()),
          usage: fc.option(fc.oneof(WIDE_USAGE, fc.string()), { nil: undefined }),
          cardinality: fc.option(cardinalityArb, { nil: undefined }),
          fields: fc.option(fc.array(wideFieldRuleArb, { maxLength: 4 }), { nil: undefined }),
        },
        { requiredKeys: ["segment"] },
      ),
      { maxLength: 5 },
    ),
    fc.constant(undefined),
  ),
});

/** One resolution-shaped value: well-formed, or garbage in every member position. */
const resolutionMemberArb = fc.oneof(
  fc.record(
    {
      segment: fc.oneof(VALID_SEGMENT, fc.string(), fc.integer(), fc.constant(null)),
      field: fc.oneof(fc.integer({ min: 1, max: 20 }), fc.integer(), fc.string()),
      outcome: fc.oneof(fc.boolean(), fc.string(), fc.constant(null)),
    },
    { requiredKeys: [] },
  ),
  fc.string(),
  fc.constant(null),
  fc.array(fc.string(), { maxLength: 2 }),
);

/** Any value at all in the resolution-argument position, absent included. */
const resolutionArgArb = fc.oneof(
  fc.constant(undefined),
  fc.constant(null),
  fc.string(),
  fc.integer(),
  fc.boolean(),
  fc.record({ segment: VALID_SEGMENT, outcome: fc.boolean() }),
  fc.array(resolutionMemberArb, { maxLength: 5 }),
);

/** The engine's signature is typed; these properties feed it what a caller can. */
const runWith = (
  msg: (typeof MESSAGE_POOL)[number],
  profile: unknown,
  resolutions: unknown,
): ReturnType<typeof validateAgainstProfile> =>
  validateAgainstProfile(
    msg,
    profile as ConformanceProfile,
    resolutions as readonly UsageResolution[],
  );

describe("property: the wider vocabulary and caller-supplied resolutions", () => {
  it("never throws for any message × any profile × any resolution argument", () => {
    fc.assert(
      fc.property(
        fc.nat({ max: MESSAGE_POOL.length - 1 }),
        wideProfileArb,
        resolutionArgArb,
        (idx, profile, resolutions) => {
          const msg = MESSAGE_POOL[idx];
          if (msg === undefined) return;
          const result = runWith(msg, profile, resolutions);
          expect(Array.isArray(result.findings)).toBe(true);
          expect(typeof result.profileName).toBe("string");
        },
      ),
      RUN_CONFIG,
    );
  });

  it("validation still never mutates the message under a resolution argument", () => {
    fc.assert(
      fc.property(
        fc.nat({ max: MESSAGE_POOL.length - 1 }),
        wideProfileArb,
        resolutionArgArb,
        (idx, profile, resolutions) => {
          const msg = MESSAGE_POOL[idx];
          if (msg === undefined) return;
          const before = msg.toString();
          runWith(msg, profile, resolutions);
          expect(msg.toString()).toBe(before);
        },
      ),
      RUN_CONFIG,
    );
  });

  it("every finding stays well-formed and PHI-free of the message's own values", () => {
    fc.assert(
      fc.property(
        fc.nat({ max: MESSAGE_POOL.length - 1 }),
        wideProfileArb,
        resolutionArgArb,
        (idx, profile, resolutions) => {
          const msg = MESSAGE_POOL[idx];
          if (msg === undefined) return;
          for (const f of runWith(msg, profile, resolutions).findings) {
            expect(["error", "warning", "info"]).toContain(f.severity);
            expect(typeof f.locus.segment).toBe("string");
            expect(f.message.length).toBeGreaterThan(0);
            expect(f.message).not.toContain("MRN1");
            expect(f.message).not.toContain("Doe");
          }
        },
      ),
      RUN_CONFIG,
    );
  });

  it("a result carrying any PROFILE_MALFORMED carries no message-level finding", () => {
    fc.assert(
      fc.property(
        fc.nat({ max: MESSAGE_POOL.length - 1 }),
        wideProfileArb,
        resolutionArgArb,
        (idx, profile, resolutions) => {
          const msg = MESSAGE_POOL[idx];
          if (msg === undefined) return;
          const { findings } = runWith(msg, profile, resolutions);
          const malformed = findings.some((f) => f.code === FINDING_CODES.PROFILE_MALFORMED);
          if (!malformed) return;
          expect(findings.every((f) => f.code === FINDING_CODES.PROFILE_MALFORMED)).toBe(true);
        },
      ),
      RUN_CONFIG,
    );
  });

  it("absent, undefined and an empty list are one argument for any profile", () => {
    fc.assert(
      fc.property(fc.nat({ max: MESSAGE_POOL.length - 1 }), wideProfileArb, (idx, profile) => {
        const msg = MESSAGE_POOL[idx];
        if (msg === undefined) return;
        const absent = validateAgainstProfile(msg, profile as ConformanceProfile).findings;
        expect(runWith(msg, profile, undefined).findings).toEqual(absent);
        expect(runWith(msg, profile, []).findings).toEqual(absent);
      }),
      RUN_CONFIG,
    );
  });

  it("an unresolved declared conditional with NO predicate, and B, are identical to C", () => {
    const substitutable = fc.constantFrom("C(R/X)", "C(RE/X)", "C(O/B)", "C(B/B)", "B");
    fc.assert(
      fc.property(
        fc.nat({ max: MESSAGE_POOL.length - 1 }),
        VALID_SEGMENT,
        fc.integer({ min: 1, max: 12 }),
        substitutable,
        fc.option(cardinalityArb, { nil: undefined }),
        (idx, segment, field, usage, cardinality) => {
          const msg = MESSAGE_POOL[idx];
          if (msg === undefined) return;
          const build = (declared: string): ConformanceProfile =>
            ({
              name: "substitution",
              segments: [
                { segment, usage: declared, cardinality },
                { segment, fields: [{ field, usage: declared, cardinality, length: 3 }] },
              ],
            }) as unknown as ConformanceProfile;
          // Two rules name the same segment, so a resolution here would be
          // ambiguous; nothing is resolved, which is exactly the case under test.
          expect(validateAgainstProfile(msg, build(usage)).findings).toEqual(
            validateAgainstProfile(msg, build("C")).findings,
          );
        },
      ),
      RUN_CONFIG,
    );
  });
});

// ---------------------------------------------------------------------------
// Condition predicates. New arbitraries and new properties rather than widened
// ones, so every generator above keeps generating exactly what it did before
// and the no-predicate path stays pinned by the properties that already pass.
// ---------------------------------------------------------------------------

/** A location arbitrary: valid coordinates mixed with shapes that address nothing. */
const locationArb = fc.record(
  {
    segment: fc.oneof(VALID_SEGMENT, fc.string()),
    field: fc.option(fc.oneof(fc.integer({ min: 1, max: 20 }), fc.integer(), fc.string()), {
      nil: undefined,
    }),
    component: fc.option(fc.oneof(fc.integer({ min: 1, max: 4 }), fc.integer()), {
      nil: undefined,
    }),
    subcomponent: fc.option(fc.integer({ min: 1, max: 3 }), { nil: undefined }),
  },
  { requiredKeys: [] },
);

/**
 * A well-formed statement that ALSO carries a discriminant key set to
 * `undefined`, which is a different shape from one that omits it.
 *
 * `fc.record` with `requiredKeys` OMITS an optional key rather than valuing it
 * `undefined`, so no arbitrary here could build this shape - and this shape is
 * exactly the one a union's excess-property check admits from plain TypeScript
 * (`{ connector: undefined, location, verb: "is", values: [...] }` type-checks
 * against `ConditionPredicate`), and exactly the one a helper assembling a
 * predicate from an options bag returns on every call. Reading a discriminant
 * by value admits it and then reads it as a different statement; reading by key
 * presence refuses it. Generated so the properties below can falsify that.
 */
const strayDiscriminantArb = fc.oneof(
  fc.record(
    {
      location: locationArb,
      verb: fc.oneof(fc.constantFrom(...PREDICATE_VERBS), fc.string()),
      values: fc.array(fc.string(), { maxLength: 3 }),
      presence: fc.constant(undefined),
      connector: fc.constant(undefined),
    },
    { requiredKeys: ["location", "verb", "values"] },
  ),
  fc.record(
    {
      location: locationArb,
      presence: fc.constantFrom("is valued", "is not valued"),
      verb: fc.constant(undefined),
      connector: fc.constant(undefined),
    },
    { requiredKeys: ["location", "presence"] },
  ),
);

/** One statement: a presence or a comparison, well-formed or garbage in every position. */
const statementArb = fc.oneof(
  fc.record({
    location: locationArb,
    presence: fc.oneof(fc.constantFrom("is valued", "is not valued"), fc.string()),
  }),
  fc.record(
    {
      location: locationArb,
      verb: fc.oneof(fc.constantFrom(...PREDICATE_VERBS), fc.string()),
      values: fc.oneof(
        fc.array(fc.string(), { maxLength: 3 }),
        fc.array(fc.integer(), { maxLength: 2 }),
        fc.string(),
      ),
    },
    { requiredKeys: ["location", "verb"] },
  ),
  strayDiscriminantArb,
  fc.string(),
  fc.constant(null),
  fc.integer(),
);

/** Any condition-shaped value at all, one connector deep. */
const conditionArb = fc.oneof(
  statementArb,
  fc.record(
    {
      connector: fc.oneof(fc.constantFrom(...PREDICATE_CONNECTORS), fc.string()),
      left: statementArb,
      right: statementArb,
      // A connector may carry the stray keys too, on the same terms.
      verb: fc.constant(undefined),
      presence: fc.constant(undefined),
    },
    { requiredKeys: ["connector"] },
  ),
);

/** The wider vocabulary again, this time with a condition riding on each rule. */
const predicatedProfileArb = fc.record({
  name: fc.oneof(fc.string({ minLength: 1 }), fc.integer()),
  segments: fc.array(
    fc.record(
      {
        segment: fc.oneof(VALID_SEGMENT, fc.string()),
        usage: fc.option(fc.oneof(WIDE_USAGE, fc.string()), { nil: undefined }),
        condition: fc.option(conditionArb, { nil: undefined }),
        cardinality: fc.option(cardinalityArb, { nil: undefined }),
        fields: fc.option(
          fc.array(
            fc.record(
              {
                field: fc.oneof(fc.integer({ min: 1, max: 20 }), fc.string()),
                usage: fc.option(fc.oneof(WIDE_USAGE, fc.string()), { nil: undefined }),
                condition: fc.option(conditionArb, { nil: undefined }),
                length: fc.option(fc.nat({ max: 10 }), { nil: undefined }),
                valueSet: fc.option(fc.array(fc.string(), { maxLength: 4 }), { nil: undefined }),
              },
              { requiredKeys: ["field"] },
            ),
            { maxLength: 4 },
          ),
          { nil: undefined },
        ),
      },
      { requiredKeys: ["segment"] },
    ),
    { maxLength: 5 },
  ),
});

/**
 * Locations every message in the pool carries content at, so a COMPARISON
 * against one of them is always decidable. Presence statements are decidable
 * everywhere by definition, so they need no such restriction.
 */
const DECIDABLE_LOCATION = fc.constantFrom(
  { segment: "MSH", field: 3 },
  { segment: "MSH", field: 10 },
  { segment: "MSH", field: 12 },
  { segment: "MSH", field: 9, component: 1 },
);

const ANY_LOCATION = fc.oneof(
  DECIDABLE_LOCATION,
  fc.constantFrom(
    { segment: "PID", field: 3 },
    { segment: "PID", field: 8 },
    { segment: "ZFA", field: 1 },
    { segment: "PV1" },
  ),
);

/** A well-formed, ALWAYS-DECIDABLE predicate. */
const decidableStatement = fc.oneof(
  fc.record({
    location: ANY_LOCATION,
    presence: fc.constantFrom("is valued" as const, "is not valued" as const),
  }),
  fc.record({
    location: DECIDABLE_LOCATION,
    verb: fc.constantFrom(...PREDICATE_VERBS),
    values: fc.array(fc.constantFrom("A", "2.5", "ADT", "M1", "LAB", "[A-Z]+"), {
      minLength: 1,
      maxLength: 3,
    }),
  }),
) as fc.Arbitrary<ConditionPredicate>;

const decidableTree = fc.oneof(
  decidableStatement,
  fc.record({
    connector: fc.constantFrom(...PREDICATE_CONNECTORS),
    left: decidableStatement,
    right: decidableStatement,
  }) as fc.Arbitrary<ConditionPredicate>,
);

describe("property: condition predicates", () => {
  it("never throws for any message x any predicate-carrying profile x any resolution", () => {
    fc.assert(
      fc.property(
        fc.nat({ max: MESSAGE_POOL.length - 1 }),
        predicatedProfileArb,
        resolutionArgArb,
        (idx, profile, resolutions) => {
          const msg = MESSAGE_POOL[idx];
          if (msg === undefined) return;
          const result = runWith(msg, profile, resolutions);
          expect(Array.isArray(result.findings)).toBe(true);
          expect(typeof result.profileName).toBe("string");
        },
      ),
      RUN_CONFIG,
    );
  });

  it("a predicate never mutates the message it reads", () => {
    fc.assert(
      fc.property(
        fc.nat({ max: MESSAGE_POOL.length - 1 }),
        predicatedProfileArb,
        (idx, profile) => {
          const msg = MESSAGE_POOL[idx];
          if (msg === undefined) return;
          const before = msg.toString();
          runWith(msg, profile, undefined);
          expect(msg.toString()).toBe(before);
        },
      ),
      RUN_CONFIG,
    );
  });

  it("a result carrying any PROFILE_MALFORMED still carries no message-level finding", () => {
    fc.assert(
      fc.property(
        fc.nat({ max: MESSAGE_POOL.length - 1 }),
        predicatedProfileArb,
        (idx, profile) => {
          const msg = MESSAGE_POOL[idx];
          if (msg === undefined) return;
          const { findings } = runWith(msg, profile, undefined);
          if (!findings.some((f) => f.code === FINDING_CODES.PROFILE_MALFORMED)) return;
          expect(findings.every((f) => f.code === FINDING_CODES.PROFILE_MALFORMED)).toBe(true);
        },
      ),
      RUN_CONFIG,
    );
  });

  it("a conformant message against a predicate-carrying profile yields ZERO findings", () => {
    fc.assert(
      fc.property(
        fc.nat({ max: MESSAGE_POOL.length - 1 }),
        decidableTree,
        decidableTree,
        decidableTree,
        (idx, a, b, c) => {
          const msg = MESSAGE_POOL[idx];
          if (msg === undefined) return;
          // Every rule below is satisfied by every message in the pool under
          // BOTH of its outcomes, so whichever branch the predicate picks, the
          // message conforms. MSH is always present (R and RE both hold), ZFA
          // never is (X and O both hold), and the field rule imposes no
          // presence obligation under either of its outcomes.
          const profile: ConformanceProfile = {
            name: "satisfied-under-either-outcome",
            segments: [
              { segment: "MSH", usage: "C(R/RE)", condition: a },
              { segment: "ZFA", usage: "C(X/O)", condition: b },
              { segment: "MSH", fields: [{ field: 10, usage: "C(RE/O)", condition: c }] },
            ],
          };
          expect(validateAgainstProfile(msg, profile).findings).toEqual([]);
        },
      ),
      RUN_CONFIG,
    );
  });

  it("a statement carrying more than one discriminant KEY is refused, never decided", () => {
    /** How many of the three discriminant keys a candidate statement carries. */
    const discriminantKeys = (value: unknown): number =>
      typeof value === "object" && value !== null
        ? ["presence", "verb", "connector"].filter((key) => key in value).length
        : 0;

    // Counted, because an arbitrary that never produces the shape would make
    // this property pass by saying nothing: `fc.record` OMITS an optional key,
    // and omitting is the case that was never broken.
    let generated = 0;

    fc.assert(
      fc.property(
        fc.nat({ max: MESSAGE_POOL.length - 1 }),
        strayDiscriminantArb,
        (idx, condition) => {
          const msg = MESSAGE_POOL[idx];
          if (msg === undefined) return;
          if (discriminantKeys(condition) < 2) return;
          generated++;
          const profile = {
            name: "stray-discriminant",
            segments: [{ segment: "MSH", fields: [{ field: 3, usage: "C(R/X)", condition }] }],
          };
          // Exactly the refusal, and nothing else: not a decided outcome from
          // whichever discriminant the engine happened to look at first, and
          // not an empty findings list either.
          expect(runWith(msg, profile, undefined).findings.map((f) => f.code)).toEqual([
            FINDING_CODES.PROFILE_MALFORMED,
          ]);
        },
      ),
      RUN_CONFIG,
    );

    expect(generated).toBeGreaterThan(0);
  });

  it("a decidable predicate never leaves a stray unevaluatable finding behind", () => {
    fc.assert(
      fc.property(fc.nat({ max: MESSAGE_POOL.length - 1 }), decidableTree, (idx, condition) => {
        const msg = MESSAGE_POOL[idx];
        if (msg === undefined) return;
        const profile: ConformanceProfile = {
          name: "decidable",
          segments: [
            { segment: "PID", usage: "C(O/O)", condition },
            { segment: "OBX", fields: [{ field: 5, usage: "C(O/O)", condition }] },
          ],
        };
        const { findings } = validateAgainstProfile(msg, profile);
        expect(
          findings.filter((f) => f.code === FINDING_CODES.PROFILE_CONDITION_UNEVALUATABLE),
        ).toEqual([]);
      }),
      RUN_CONFIG,
    );
  });

  it("no predicate finding echoes a message value or a value list drawn from the profile", () => {
    fc.assert(
      fc.property(
        // Two distinctive sentinels: one planted in the MESSAGE and one in the
        // PROFILE's own value list. The "ZQV" prefix cannot occur inside the
        // finding vocabulary, so a hit is a genuine leak rather than a
        // coincidental substring of English prose.
        fc.stringMatching(/^[A-Za-z0-9]{1,8}$/u).map((s) => `ZQVMSG${s}`),
        fc.stringMatching(/^[A-Za-z0-9]{1,8}$/u).map((s) => `ZQVSET${s}`),
        fc.boolean(),
        (inMessage, inProfile, undecidable) => {
          const raw =
            `MSH|^~\\&|A|B|C|D|20260101||ADT^A01|M1|P|2.5\rPID|1||MRN9^^^H^MR||Doe^John||19800101|` +
            inMessage;
          const msg = parseHL7(raw);
          // Either a predicate that cannot be decided (its location names a
          // segment the message does not carry) or one that can, and whose
          // selected outcome then fires the rule's other constraints.
          const condition: ConditionPredicate = undecidable
            ? { location: { segment: "PV1", field: 2 }, verb: "is", values: [inProfile] }
            : { location: { segment: "PID", field: 8 }, verb: "is", values: [inProfile] };
          const profile: ConformanceProfile = {
            name: "leak-probe",
            segments: [
              {
                segment: "PID",
                fields: [
                  { field: 8, usage: "C(R/X)", condition, valueSet: [inProfile], length: 1 },
                ],
              },
            ],
          };
          const { findings } = validateAgainstProfile(msg, profile);
          expect(findings.length).toBeGreaterThan(0);
          for (const f of findings) {
            expect(f.message).not.toContain(inMessage);
            expect(f.message).not.toContain(inProfile);
            // The locus stays structural: a segment name and indices only.
            expect(typeof f.locus.segment).toBe("string");
            expect(f.locus.segment).not.toContain(inMessage);
          }
        },
      ),
      RUN_CONFIG,
    );
  });

  it("no coding-system finding ever echoes the claim the message made", () => {
    // A value-set binding carries a coding-system identifier, so the engine now
    // READS a component it never read before and REPORTS on it. That is a new
    // route by which message content could reach a consumer's log, and a leaked
    // value is the one failure here no re-run undoes. So: a sentinel in the
    // coding-system component the finding is ABOUT, and a second in the code
    // beside it, neither of which may appear anywhere in any finding.
    fc.assert(
      fc.property(
        fc.stringMatching(/^[A-Za-z0-9]{1,8}$/u).map((s) => `ZQVSYS${s}`),
        fc.stringMatching(/^[A-Za-z0-9]{1,8}$/u).map((s) => `ZQVCODE${s}`),
        fc.constantFrom(1, 4),
        fc.boolean(),
        (claimedSystem, code, component, blank) => {
          // The whole triplet is planted: the code, its text, and the claim.
          // `blank` swaps the claim for whitespace, which is the absent-claim
          // path: it reports too, and it must not echo the code beside it.
          const system = blank ? "   " : claimedSystem;
          const triplet =
            component === 1
              ? `${code}^${code}TEXT^${system}`
              : `PRIMARY^PRIMARYTEXT^LN^${code}^${code}TEXT^${system}`;
          const raw = [
            "MSH|^~\\&|A|B|C|D|20260101||ORU^R01|M1|P|2.5",
            "PID|1||MRN9^^^H^MR||Doe^John||19800101|M",
            `OBX|1|NM|${triplet}||7.5`,
          ].join("\r");
          const profile: ConformanceProfile = {
            name: "coding-system-leak-probe",
            segments: [
              {
                segment: "OBX",
                fields: [{ field: 3, component, valueSet: ["WBC", "RBC"], codingSystem: "LN" }],
              },
            ],
          };
          const { findings } = validateAgainstProfile(parseHL7(raw), profile);
          // The claim is never LN, so the mismatch always fires.
          expect(
            findings.some((f) => f.code === FINDING_CODES.PROFILE_CODING_SYSTEM_MISMATCH),
          ).toBe(true);
          for (const f of findings) {
            expect(f.message).not.toContain(claimedSystem);
            expect(f.message).not.toContain(code);
            expect(JSON.stringify(f)).not.toContain("ZQV");
            // The locus stays structural: a segment name and indices only.
            expect(f.locus.segment).toBe("OBX");
            expect(typeof f.locus.component).toBe("number");
          }
        },
      ),
      RUN_CONFIG,
    );
  });

  it("no MALFORMED diagnostic about a coding-system binding echoes what the author wrote", () => {
    // The refusal path reads a PROFILE-supplied identifier. An unrecognized one
    // is echoed on purpose (an author debugging a typo needs it), so what this
    // pins is the other half: a binding that is not a string has no token worth
    // echoing, and its diagnostic names the value's TYPE instead of its content.
    fc.assert(
      fc.property(
        fc.stringMatching(/^[A-Za-z0-9]{1,8}$/u).map((s) => `ZQVBIND${s}`),
        (secret) => {
          const msg = MESSAGE_POOL[1];
          if (msg === undefined) return;
          const profile = {
            name: "binding-shape-probe",
            segments: [
              {
                segment: "OBX",
                fields: [{ field: 3, valueSet: ["WBC"], codingSystem: { claimed: secret } }],
              },
            ],
          };
          const { findings } = runWith(msg, profile, undefined);
          expect(findings.length).toBeGreaterThan(0);
          expect(findings.every((f) => f.code === FINDING_CODES.PROFILE_MALFORMED)).toBe(true);
          for (const f of findings) expect(f.message).not.toContain(secret);
        },
      ),
      RUN_CONFIG,
    );
  });

  it("no MALFORMED diagnostic about a predicate echoes its value list either", () => {
    fc.assert(
      fc.property(
        fc.stringMatching(/^[A-Za-z0-9]{1,8}$/u).map((s) => `ZQVSET${s}`),
        (secret) => {
          const msg = MESSAGE_POOL[0];
          if (msg === undefined) return;
          const profile = {
            name: "malformed-probe",
            segments: [
              {
                segment: "PID",
                fields: [
                  {
                    field: 8,
                    usage: "C(R/X)",
                    // An uncompilable regular expression carrying the sentinel.
                    condition: {
                      location: { segment: "PID", field: 8 },
                      verb: "matches",
                      values: [`(${secret}`],
                    },
                  },
                ],
              },
            ],
          };
          const { findings } = runWith(msg, profile, undefined);
          expect(findings.length).toBeGreaterThan(0);
          for (const f of findings) expect(f.message).not.toContain(secret);
        },
      ),
      RUN_CONFIG,
    );
  });
});

// ---------------------------------------------------------------------------
// Coding-system bindings. New arbitraries again rather than widened ones, so
// every generator above keeps generating exactly what it did before and the
// invariants they pin stay pinned on the same inputs.
// ---------------------------------------------------------------------------

/** Anything an author might put in the binding position, recognized or not. */
const codingSystemArb = fc.oneof(
  fc.constantFrom("LN", "SCT", "CVX", "UCUM", "loinc", " LN ", "SNOMED"),
  fc.constantFrom("", "   ", "ZZZ", "0396", "LOINC-2"),
  fc.string(),
  fc.integer(),
  fc.constant(null),
  fc.array(fc.string(), { maxLength: 2 }),
);

/** A field rule that always declares a binding, well-formed or not. */
const boundFieldRuleArb = fc.record(
  {
    field: fc.oneof(fc.integer({ min: 1, max: 20 }), fc.integer({ min: -3, max: 0 })),
    component: fc.option(fc.integer({ min: 1, max: 8 }), { nil: undefined }),
    valueSet: fc.option(fc.array(fc.string(), { maxLength: 4 }), { nil: undefined }),
    codingSystem: codingSystemArb,
    codingSystemComponent: fc.option(
      fc.oneof(fc.integer({ min: -2, max: 9 }), fc.constant(2.5), fc.string()),
      { nil: undefined },
    ),
    severity: fc.option(fc.constantFrom("error", "warning", "info"), { nil: undefined }),
  },
  { requiredKeys: ["field", "codingSystem"] },
);

const boundProfileArb = fc.record({
  name: fc.string({ minLength: 1 }),
  segments: fc.array(
    fc.record(
      {
        segment: VALID_SEGMENT,
        fields: fc.array(boundFieldRuleArb, { maxLength: 4 }),
      },
      { requiredKeys: ["segment"] },
    ),
    { maxLength: 4 },
  ),
});

describe("property: coding-system bindings", () => {
  it("never throws for any message × any binding-shaped profile", () => {
    fc.assert(
      fc.property(fc.nat({ max: MESSAGE_POOL.length - 1 }), boundProfileArb, (idx, profile) => {
        const msg = MESSAGE_POOL[idx];
        if (msg === undefined) return;
        const result = runWith(msg, profile, undefined);
        expect(Array.isArray(result.findings)).toBe(true);
      }),
      RUN_CONFIG,
    );
  });

  it("validation never mutates the message, binding or no binding", () => {
    fc.assert(
      fc.property(fc.nat({ max: MESSAGE_POOL.length - 1 }), boundProfileArb, (idx, profile) => {
        const msg = MESSAGE_POOL[idx];
        if (msg === undefined) return;
        const before = msg.toString();
        runWith(msg, profile, undefined);
        expect(msg.toString()).toBe(before);
      }),
      RUN_CONFIG,
    );
  });

  it("every coding-system finding is well-formed and names a component it read", () => {
    fc.assert(
      fc.property(fc.nat({ max: MESSAGE_POOL.length - 1 }), boundProfileArb, (idx, profile) => {
        const msg = MESSAGE_POOL[idx];
        if (msg === undefined) return;
        const { findings } = runWith(msg, profile, undefined);
        for (const f of findings) {
          expect(["error", "warning", "info"]).toContain(f.severity);
          expect(f.message.length).toBeGreaterThan(0);
          if (f.code !== FINDING_CODES.PROFILE_CODING_SYSTEM_MISMATCH) continue;
          expect(typeof f.locus.field).toBe("number");
          expect(typeof f.locus.component).toBe("number");
          expect(typeof f.locus.repetition).toBe("number");
          expect(typeof f.locus.occurrence).toBe("number");
        }
      }),
      RUN_CONFIG,
    );
  });

  it("a rule that declares NO binding never produces a coding-system finding", () => {
    // The additive half of the contract, generatively: the previously-shipping
    // bare-array form cannot start emitting a code it never emitted.
    fc.assert(
      fc.property(fc.nat({ max: MESSAGE_POOL.length - 1 }), profileArb, (idx, profile) => {
        const msg = MESSAGE_POOL[idx];
        if (msg === undefined) return;
        const { findings } = runWith(msg, profile, undefined);
        expect(findings.some((f) => f.code === FINDING_CODES.PROFILE_CODING_SYSTEM_MISMATCH)).toBe(
          false,
        );
      }),
      RUN_CONFIG,
    );
  });
});
