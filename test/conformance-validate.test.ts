/**
 * Conformance-profile engine tests (roadmap Phase U: `validateAgainstProfile`).
 *
 * Covers the four acceptance invariants directly:
 *   - **Never throws**: malformed profile / message yields findings, not an error.
 *   - **Valid ⇒ zero findings** (and the documented "not an attestation").
 *   - **No PHI in findings**: a finding names the locus + rule, never the value.
 *   - **Read-only**: validation never mutates the message.
 * plus the per-usage-code semantics, cardinality, length, value-set, per-rule
 * severity, and the fail-fast `defineConformanceProfile` gate.
 */

import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import {
  FINDING_CODES,
  ProfileDefinitionError,
  USAGE_CODES,
  defineConformanceProfile,
  parseHL7,
  usageOutcomes,
  validateAgainstProfile,
  type ConformanceFinding,
  type ConformanceProfile,
  type FieldRule,
  type SegmentRule,
  type UsageCode,
  type UsageCodeRegistryEntry,
  type UsageResolution,
} from "../src/index.js";

const FIX = join(import.meta.dirname, "fixtures", "conformance");
const readFix = (name: string): string => readFileSync(join(FIX, name), "utf8");
const readProfile = (name: string): ConformanceProfile =>
  JSON.parse(readFix(name)) as ConformanceProfile;

const MIN_PROFILE = readProfile("profile-adt-min.json");

describe("validateAgainstProfile: fixtures (roadmap accuracy bar)", () => {
  it("a conforming message produces ZERO findings", () => {
    const msg = parseHL7(readFix("adt-pass.hl7"));
    const result = validateAgainstProfile(msg, MIN_PROFILE);
    expect(result.profileName).toBe("example-adt-min");
    expect(result.findings).toEqual([]);
  });

  it("a missing Required field is one PROFILE_REQUIRED_ABSENT finding at the right locus", () => {
    const msg = parseHL7(readFix("adt-missing-required.hl7"));
    const { findings } = validateAgainstProfile(msg, MIN_PROFILE);
    expect(findings).toHaveLength(1);
    const [f] = findings;
    expect(f?.code).toBe(FINDING_CODES.PROFILE_REQUIRED_ABSENT);
    expect(f?.severity).toBe("error");
    expect(f?.locus).toMatchObject({ segment: "PID", field: 3 });
  });

  it("too many repetitions is a PROFILE_CARDINALITY finding", () => {
    const msg = parseHL7(readFix("adt-cardinality.hl7"));
    const { findings } = validateAgainstProfile(msg, MIN_PROFILE);
    expect(findings).toHaveLength(1);
    expect(findings[0]?.code).toBe(FINDING_CODES.PROFILE_CARDINALITY);
    expect(findings[0]?.locus).toMatchObject({ segment: "PID", field: 3 });
  });

  it("a code outside the supplied value set is a PROFILE_VALUE_NOT_IN_SET finding", () => {
    const msg = parseHL7(readFix("adt-value-not-in-set.hl7"));
    const { findings } = validateAgainstProfile(msg, MIN_PROFILE);
    expect(findings).toHaveLength(1);
    expect(findings[0]?.code).toBe(FINDING_CODES.PROFILE_VALUE_NOT_IN_SET);
    expect(findings[0]?.locus).toMatchObject({ segment: "PID", field: 8, component: 1 });
  });
});

describe("validateAgainstProfile: usage-code semantics", () => {
  const raw =
    "MSH|^~\\&|A|B|C|D|20260101||ADT^A01|MSG1|P|2.5\rEVN|A01|20260101\r" +
    "PID|1||MRN12345^^^H^MR||Doe^John||19800101|M";

  it("RE absent is NOT a violation; O absent is NOT a violation", () => {
    const msg = parseHL7(raw);
    const profile: ConformanceProfile = {
      name: "re-o",
      segments: [
        {
          segment: "PID",
          usage: "R",
          fields: [
            { field: 6, name: "Mother's Maiden Name", usage: "RE" },
            { field: 10, name: "Race", usage: "O" },
          ],
        },
      ],
    };
    expect(validateAgainstProfile(msg, profile).findings).toEqual([]);
  });

  it("C / CE presence is NOT evaluated (no predicate language): absent conditional is clean", () => {
    const msg = parseHL7(raw);
    const profile: ConformanceProfile = {
      name: "conditional",
      segments: [
        {
          segment: "PID",
          usage: "R",
          fields: [
            { field: 6, usage: "C" },
            { field: 10, usage: "CE" },
          ],
        },
      ],
    };
    expect(validateAgainstProfile(msg, profile).findings).toEqual([]);
  });

  it("X field present is PROFILE_NOT_PERMITTED", () => {
    const msg = parseHL7(raw);
    const profile: ConformanceProfile = {
      name: "x-field",
      segments: [{ segment: "PID", fields: [{ field: 8, name: "Sex", usage: "X" }] }],
    };
    const { findings } = validateAgainstProfile(msg, profile);
    expect(findings).toHaveLength(1);
    expect(findings[0]?.code).toBe(FINDING_CODES.PROFILE_NOT_PERMITTED);
    expect(findings[0]?.locus).toMatchObject({ segment: "PID", field: 8 });
  });

  it("R segment absent, X segment present, and segment cardinality all fire at segment level", () => {
    const msg = parseHL7(raw); // has MSH, EVN, PID: no PV1, no OBX
    const profile: ConformanceProfile = {
      name: "seg-level",
      segments: [
        { segment: "PV1", usage: "R" }, // absent → required-absent
        { segment: "PID", usage: "X" }, // present → not-permitted
        { segment: "EVN", cardinality: { min: 2, max: 3 } }, // 1 present, min 2 → cardinality
      ],
    };
    const { findings } = validateAgainstProfile(msg, profile);
    const codes = findings.map((f) => f.code);
    expect(codes).toContain(FINDING_CODES.PROFILE_REQUIRED_ABSENT);
    expect(codes).toContain(FINDING_CODES.PROFILE_NOT_PERMITTED);
    expect(codes).toContain(FINDING_CODES.PROFILE_CARDINALITY);
    // segment-level findings carry no `field`
    for (const f of findings) expect(f.locus.field).toBeUndefined();
  });

  it("a length overflow is a PROFILE_LENGTH finding; per-rule severity downgrades it", () => {
    const msg = parseHL7(raw); // MSH-10 control id = "MSG1" (length 4)
    const profile: ConformanceProfile = {
      name: "length",
      segments: [
        {
          segment: "MSH",
          fields: [{ field: 10, name: "Control ID", length: 2, severity: "warning" }],
        },
      ],
    };
    const { findings } = validateAgainstProfile(msg, profile);
    expect(findings).toHaveLength(1);
    expect(findings[0]?.code).toBe(FINDING_CODES.PROFILE_LENGTH);
    expect(findings[0]?.severity).toBe("warning");
  });

  it("value-set membership honours a non-default component", () => {
    const msg = parseHL7(raw); // PID-3.5 (identifier type code) = "MR"
    const profile: ConformanceProfile = {
      name: "component-vs",
      segments: [
        {
          segment: "PID",
          fields: [{ field: 3, name: "ID type", component: 5, valueSet: ["PI", "PN"] }],
        },
      ],
    };
    const { findings } = validateAgainstProfile(msg, profile);
    expect(findings).toHaveLength(1);
    expect(findings[0]?.code).toBe(FINDING_CODES.PROFILE_VALUE_NOT_IN_SET);
    expect(findings[0]?.locus).toMatchObject({ segment: "PID", field: 3, component: 5 });
  });
});

describe("validateAgainstProfile: never throws, read-only, PHI-safe", () => {
  it("never throws on a malformed profile: returns PROFILE_MALFORMED findings", () => {
    const msg = parseHL7("MSH|^~\\&|A|B|C|D|20260101||ADT^A01|M1|P|2.5");
    // A deliberately broken profile passed through `any`: the engine must not throw.
    const broken = {
      name: "",
      segments: [{ segment: "pid", usage: "NOPE", fields: [{ field: 0 }] }],
    };
    const result = validateAgainstProfile(msg, broken as unknown as ConformanceProfile);
    expect(result.findings.length).toBeGreaterThan(0);
    expect(result.findings.every((f) => f.code === FINDING_CODES.PROFILE_MALFORMED)).toBe(true);
    expect(result.profileName).toBe("(unnamed profile)");
  });

  it("never throws when handed a non-object profile", () => {
    const msg = parseHL7("MSH|^~\\&|A|B|C|D|20260101||ADT^A01|M1|P|2.5");
    for (const junk of [null, undefined, 42, "x", []]) {
      const result = validateAgainstProfile(msg, junk as unknown as ConformanceProfile);
      expect(result.findings[0]?.code).toBe(FINDING_CODES.PROFILE_MALFORMED);
    }
  });

  it("validation does not mutate the message (round-trip stable)", () => {
    const msg = parseHL7(readFix("adt-value-not-in-set.hl7"));
    const before = msg.toString();
    validateAgainstProfile(msg, MIN_PROFILE);
    expect(msg.toString()).toBe(before);
  });

  it("no finding message contains the offending field value (PHI safety)", () => {
    // The offending PID-8 value is "Q"; the MRN is "MRN12345". Neither the code
    // value nor the identifier may appear in any finding message.
    const msg = parseHL7(readFix("adt-value-not-in-set.hl7"));
    const wide: ConformanceProfile = {
      name: "wide",
      segments: [
        {
          segment: "PID",
          usage: "R",
          fields: [
            { field: 3, name: "MRN", usage: "R", length: 3, valueSet: ["MRN00000^^^H^MR"] },
            { field: 8, name: "Sex", valueSet: ["M", "F"] },
          ],
        },
      ],
    };
    const { findings } = validateAgainstProfile(msg, wide);
    expect(findings.length).toBeGreaterThan(0);
    for (const f of findings) {
      expect(f.message).not.toContain("MRN12345");
      // the bare code value "Q" must not be echoed
      expect(f.message).not.toMatch(/\bQ\b/u);
    }
  });
});

describe("defineConformanceProfile: fail-fast authoring gate", () => {
  it("returns the profile unchanged when well-formed", () => {
    const p = defineConformanceProfile(MIN_PROFILE);
    expect(p).toBe(MIN_PROFILE);
  });

  it("throws ProfileDefinitionError listing the defects when malformed", () => {
    expect(() => defineConformanceProfile({ name: "x", segments: [{ segment: "pid" }] })).toThrow(
      ProfileDefinitionError,
    );
  });

  it("the throw names the shape defect, never any message value", () => {
    try {
      defineConformanceProfile({
        name: "",
        segments: [{ segment: "PID", fields: [{ field: -1 }] }],
      });
      expect.unreachable("should have thrown");
    } catch (err) {
      expect(err).toBeInstanceOf(ProfileDefinitionError);
      expect((err as ProfileDefinitionError).message).toContain("must be a positive");
    }
  });
});

// ---------------------------------------------------------------------------
// The wider usage vocabulary: the declared conditional, `B`, and the
// caller-supplied resolutions that apply a conditional's outcome.
// ---------------------------------------------------------------------------

/** A message carrying MSH, EVN and PID, with PID-8 (administrative sex) VALUED. */
const WITH_SEX =
  "MSH|^~\\&|A|B|C|D|20260101||ADT^A01|MSG1|P|2.5\rEVN|A01|20260101\r" +
  "PID|1||MRN12345^^^H^MR||Doe^John||19800101|M";

/** The same message with PID-8 ABSENT (empty). */
const WITHOUT_SEX =
  "MSH|^~\\&|A|B|C|D|20260101||ADT^A01|MSG1|P|2.5\rEVN|A01|20260101\r" +
  "PID|1||MRN12345^^^H^MR||Doe^John||19800101|";

/** The same message with PID-8 carrying THREE repetitions. */
const THREE_SEX_REPS =
  "MSH|^~\\&|A|B|C|D|20260101||ADT^A01|MSG1|P|2.5\rEVN|A01|20260101\r" +
  "PID|1||MRN12345^^^H^MR||Doe^John||19800101|M~F~U";

/** The same message with PID-8 carrying a single four-character value. */
const LONG_SEX =
  "MSH|^~\\&|A|B|C|D|20260101||ADT^A01|MSG1|P|2.5\rEVN|A01|20260101\r" +
  "PID|1||MRN12345^^^H^MR||Doe^John||19800101|MMMM";

/** MSH only: no EVN, no PID. */
const MSH_ONLY = "MSH|^~\\&|A|B|C|D|20260101||ADT^A01|MSG1|P|2.5";

/** A profile whose only rule is PID-8 with the given usage (plus extra constraints). */
const pid8Profile = (usage: unknown, extra: Record<string, unknown> = {}): ConformanceProfile =>
  ({
    name: "pid8",
    segments: [{ segment: "PID", fields: [{ field: 8, usage, ...extra }] }],
  }) as unknown as ConformanceProfile;

/** Validate with a resolution argument the type system would refuse. */
const validateWith = (
  raw: string,
  profile: ConformanceProfile,
  resolutions: unknown,
): readonly ConformanceFinding[] =>
  validateAgainstProfile(parseHL7(raw), profile, resolutions as readonly UsageResolution[])
    .findings;

const isProfileMalformed = (f: ConformanceFinding): boolean =>
  f.code === FINDING_CODES.PROFILE_MALFORMED;

describe("usage vocabulary: the exported registry (AC3, AC4, AC5)", () => {
  it("lists exactly the eight entries, the pin's six first and the two new ones after", () => {
    expect([...USAGE_CODES]).toEqual(["R", "RE", "C", "CE", "O", "X", "C(a/b)", "B"]);
    expect(USAGE_CODES).toHaveLength(8);
  });

  it("an add / remove / overwrite attempt leaves a subsequent read identical", () => {
    const before = [...USAGE_CODES];
    const mutable = USAGE_CODES as unknown as string[];
    const attempts = [
      (): void => {
        mutable.push("ZZ");
      },
      (): void => {
        mutable.pop();
      },
      (): void => {
        mutable[0] = "ZZ";
      },
    ];
    for (const attempt of attempts) {
      try {
        attempt();
      } catch {
        // The attempt MAY raise: the calling code's own strict-mode setting
        // decides that, not this package. The asserted observable is the read.
      }
    }
    expect([...USAGE_CODES]).toEqual(before);
    expect([...USAGE_CODES]).toEqual(["R", "RE", "C", "CE", "O", "X", "C(a/b)", "B"]);
  });

  it("is a vocabulary listing, not an accept-set: C(a/b) is listed and refused", () => {
    expect([...USAGE_CODES]).toContain("C(a/b)");
    expect([...USAGE_CODES]).not.toContain("C(RE/X)");
    expect(validateWith(WITH_SEX, pid8Profile("C(a/b)"), undefined).every(isProfileMalformed)).toBe(
      true,
    );
    expect(validateWith(WITH_SEX, pid8Profile("C(RE/X)"), undefined)).toEqual([]);
  });
});

describe("usage vocabulary: what a rule may declare (AC1, AC6)", () => {
  it("accepts all seven simple codes and a declared conditional on segment and field rules", () => {
    const profile = {
      name: "wide-vocabulary",
      segments: [
        { segment: "PID", usage: "R", fields: [{ field: 8, usage: "C(RE/X)" }] },
        { segment: "EVN", usage: "B" },
        { segment: "PV1", usage: "C(O/X)" },
        {
          segment: "OBX",
          usage: "O",
          fields: [
            { field: 1, usage: "R" },
            { field: 2, usage: "RE" },
            { field: 3, usage: "C" },
            { field: 4, usage: "CE" },
            { field: 5, usage: "O" },
            { field: 6, usage: "X" },
            { field: 7, usage: "B" },
          ],
        },
      ],
    } as unknown as ConformanceProfile;
    expect(() => defineConformanceProfile(profile)).not.toThrow();
    expect(validateAgainstProfile(parseHL7(WITH_SEX), profile).findings).toEqual([]);
  });

  it("records a declared conditional's outcomes as two separate simple codes", () => {
    const fieldRule = { field: 8, usage: "C(RE/X)" } as unknown as FieldRule;
    expect(usageOutcomes(fieldRule)).toEqual({ whenTrue: "RE", whenFalse: "X" });
    const segmentRule = { segment: "PID", usage: "C(R/B)" } as unknown as SegmentRule;
    expect(usageOutcomes(segmentRule)).toEqual({ whenTrue: "R", whenFalse: "B" });
  });

  it("reports NO outcomes, without throwing, for a simple or absent usage", () => {
    expect(usageOutcomes({ field: 8, usage: "R" } as unknown as FieldRule)).toBeUndefined();
    expect(usageOutcomes({ field: 8, usage: "B" } as unknown as FieldRule)).toBeUndefined();
    expect(usageOutcomes({ field: 8 })).toBeUndefined();
    expect(usageOutcomes({ segment: "PID" })).toBeUndefined();
    const junk: readonly unknown[] = [
      null,
      undefined,
      42,
      "R",
      [],
      { usage: 7 },
      { usage: "C(a/b)" },
    ];
    for (const value of junk) {
      expect(() => usageOutcomes(value as FieldRule)).not.toThrow();
      expect(usageOutcomes(value as FieldRule)).toBeUndefined();
    }
  });
});

describe("usage vocabulary: refusing what the grammar rejects (AC2, AC7, AC8, AC14, AC15)", () => {
  it("an undefined usage code is one PROFILE_MALFORMED finding NAMING that code", () => {
    const findings = validateWith(WITH_SEX, pid8Profile("RQ"), undefined);
    expect(findings).toHaveLength(1);
    expect(findings[0]?.code).toBe(FINDING_CODES.PROFILE_MALFORMED);
    expect(findings[0]?.severity).toBe("error");
    expect(findings[0]?.message).toContain("RQ");
    expect(findings[0]?.locus).toMatchObject({ segment: "PID", field: 8 });
  });

  it("the literal C(a/b) on a rule is EXACTLY ONE finding naming that token, never two", () => {
    // The placeholder satisfies both "the reserved notation" and "an outcome
    // that is not a simple code". A rule declares ONE usage token, so a token
    // the grammar rejects is ONE defect however many ways it is wrong.
    const findings = validateWith(WITH_SEX, pid8Profile("C(a/b)"), undefined);
    expect(findings).toHaveLength(1);
    expect(findings[0]?.code).toBe(FINDING_CODES.PROFILE_MALFORMED);
    expect(findings[0]?.message).toContain("C(a/b)");
  });

  it("a bad, nested, spaced or lower-case token is one finding naming the token AS A WHOLE", () => {
    for (const token of ["C(C(R/X)/O)", "c(r/x)", "C(R / X)", "C(R/ZZ)", "C(R/X", "C(R/X/O)"]) {
      const findings = validateWith(WITH_SEX, pid8Profile(token), undefined);
      expect(findings, token).toHaveLength(1);
      expect(findings[0]?.code).toBe(FINDING_CODES.PROFILE_MALFORMED);
      expect(findings[0]?.message, token).toContain(token);
    }
  });

  it("a malformed usage yields NO message-level finding", () => {
    // PID-20 would be a PROFILE_REQUIRED_ABSENT if the profile were trusted.
    const profile = {
      name: "malformed-plus-violation",
      segments: [
        {
          segment: "PID",
          fields: [
            { field: 8, usage: "RQ" },
            { field: 20, usage: "R" },
          ],
        },
      ],
    } as unknown as ConformanceProfile;
    const findings = validateWith(WITH_SEX, profile, undefined);
    expect(findings).toHaveLength(1);
    expect(findings.every(isProfileMalformed)).toBe(true);
  });

  it("an over-length token is echoed at its first 32 characters and no further", () => {
    const garbage = "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789abcd"; // 40 characters
    const token = `C(R/${garbage})`;
    const findings = validateWith(WITH_SEX, pid8Profile(token), undefined);
    expect(findings).toHaveLength(1);
    const message = findings[0]?.message ?? "";
    expect(message).toContain(token.slice(0, 32));
    expect(message).not.toContain(token.slice(0, 33));
    expect(message).not.toContain(token);
  });

  it("a non-string usage names the offending value's TYPE, never its content", () => {
    const findings = validateWith(WITH_SEX, pid8Profile(12_345_678), undefined);
    expect(findings).toHaveLength(1);
    expect(findings[0]?.code).toBe(FINDING_CODES.PROFILE_MALFORMED);
    expect(findings[0]?.message).toContain("number");
    expect(findings[0]?.message).not.toContain("12345678");
  });

  it("no finding message carries a value read from the message", () => {
    const findings = validateWith(WITH_SEX, pid8Profile("C(a/b)"), [
      { segment: "PID", field: 8, outcome: true },
    ]);
    expect(findings.length).toBeGreaterThan(0);
    for (const f of findings) {
      expect(f.message).not.toContain("MRN12345");
      expect(f.message).not.toContain("Doe");
      expect(f.message).not.toContain("19800101");
    }
  });
});

describe("declared conditionals: applying a caller-supplied outcome (AC1, AC9)", () => {
  it("a true resolution evaluates the rule exactly as its true outcome", () => {
    const findings = validateWith(WITHOUT_SEX, pid8Profile("C(R/X)"), [
      { segment: "PID", field: 8, outcome: true },
    ]);
    expect(findings).toHaveLength(1);
    expect(findings[0]?.code).toBe(FINDING_CODES.PROFILE_REQUIRED_ABSENT);
    expect(findings[0]?.locus).toMatchObject({ segment: "PID", field: 8 });
  });

  it("a false resolution evaluates the rule exactly as its false outcome", () => {
    const findings = validateWith(WITH_SEX, pid8Profile("C(R/X)"), [
      { segment: "PID", field: 8, outcome: false },
    ]);
    expect(findings).toHaveLength(1);
    expect(findings[0]?.code).toBe(FINDING_CODES.PROFILE_NOT_PERMITTED);
    expect(findings[0]?.locus).toMatchObject({ segment: "PID", field: 8 });
  });

  it("a resolved rule is findings-identical to the same rule declared with that outcome", () => {
    const cases = [
      ["C(R/X)", true, "R"],
      ["C(R/X)", false, "X"],
      ["C(RE/B)", true, "RE"],
      ["C(RE/B)", false, "B"],
    ] as const;
    for (const [token, outcome, plain] of cases) {
      for (const raw of [WITH_SEX, WITHOUT_SEX, THREE_SEX_REPS]) {
        const resolved = validateWith(raw, pid8Profile(token), [
          { segment: "PID", field: 8, outcome },
        ]);
        const direct = validateWith(raw, pid8Profile(plain), undefined);
        expect(resolved, `${token} ${String(outcome)}`).toEqual(direct);
      }
    }
  });

  it("a segment-rule resolution applies to EVERY occurrence of that segment", () => {
    const raw =
      "MSH|^~\\&|A|B|C|D|20260101||ADT^A01|MSG1|P|2.5\rOBX|1|NM|WBC^^LN||7.5\rOBX|2|NM|RBC^^LN||4.2";
    const profile = {
      name: "seg-resolution",
      segments: [{ segment: "OBX", usage: "C(X/O)", fields: [{ field: 1, usage: "R" }] }],
    } as unknown as ConformanceProfile;
    const findings = validateWith(raw, profile, [{ segment: "OBX", outcome: true }]);
    expect(findings).toHaveLength(1);
    expect(findings[0]?.code).toBe(FINDING_CODES.PROFILE_NOT_PERMITTED);
    expect(findings[0]?.locus.field).toBeUndefined();
  });
});

describe("unresolved conditionals and B behave exactly as C (AC10, AC11)", () => {
  const unresolved = [
    ["C(R/X)", "an unresolved declared conditional"],
    ["B", "a Backward Compatible rule"],
  ] as const;

  for (const [token, label] of unresolved) {
    it(`${label} is findings-identical to the same rule declared C`, () => {
      for (const raw of [WITH_SEX, WITHOUT_SEX, THREE_SEX_REPS, LONG_SEX]) {
        for (const extra of [{}, { cardinality: { min: 1, max: 2 } }, { length: 3 }]) {
          expect(validateWith(raw, pid8Profile(token, extra), undefined)).toEqual(
            validateWith(raw, pid8Profile("C", extra), undefined),
          );
        }
      }
    });

    it(`${label}: an absent element yields ZERO findings even under cardinality min 1`, () => {
      const profile = pid8Profile(token, { cardinality: { min: 1, max: 2 } });
      expect(validateWith(WITHOUT_SEX, profile, undefined)).toEqual([]);
    });

    it(`${label}: three repetitions yield exactly one PROFILE_CARDINALITY`, () => {
      const profile = pid8Profile(token, { cardinality: { min: 1, max: 2 } });
      const findings = validateWith(THREE_SEX_REPS, profile, undefined);
      expect(findings).toHaveLength(1);
      expect(findings[0]?.code).toBe(FINDING_CODES.PROFILE_CARDINALITY);
    });

    it(`${label}: one over-long repetition yields exactly one PROFILE_LENGTH`, () => {
      const profile = pid8Profile(token, { cardinality: { min: 1, max: 2 }, length: 3 });
      const findings = validateWith(LONG_SEX, profile, undefined);
      expect(findings).toHaveLength(1);
      expect(findings[0]?.code).toBe(FINDING_CODES.PROFILE_LENGTH);
    });
  }

  it("a B segment rule with cardinality min 1 whose segment is absent yields zero findings", () => {
    const profile = {
      name: "b-segment",
      segments: [{ segment: "PV1", usage: "B", cardinality: { min: 1 } }],
    } as unknown as ConformanceProfile;
    expect(validateWith(WITH_SEX, profile, undefined)).toEqual([]);
  });
});

describe("resolutions: what is refused, and how many findings that is (AC12, AC13, AC20, AC21)", () => {
  it("a locus matching no declared rule is one finding at that locus", () => {
    const findings = validateWith(WITHOUT_SEX, pid8Profile("C(R/X)"), [
      { segment: "ZZZ", outcome: true },
    ]);
    expect(findings).toHaveLength(1);
    expect(findings[0]?.code).toBe(FINDING_CODES.PROFILE_MALFORMED);
    expect(findings[0]?.locus).toMatchObject({ segment: "ZZZ" });
  });

  it("a locus whose one declared rule is NOT a declared conditional is one finding", () => {
    const findings = validateWith(WITHOUT_SEX, pid8Profile("R"), [
      { segment: "PID", field: 8, outcome: true },
    ]);
    expect(findings).toHaveLength(1);
    expect(findings[0]?.code).toBe(FINDING_CODES.PROFILE_MALFORMED);
    expect(findings[0]?.locus).toMatchObject({ segment: "PID", field: 8 });
  });

  it("N duplicates at one locus are ONE finding however large N is, agreeing or not", () => {
    const outcomeSets = [
      [true, true],
      [true, false],
      [false, false, true, true, false],
    ];
    for (const outcomes of outcomeSets) {
      const findings = validateWith(
        WITHOUT_SEX,
        pid8Profile("C(R/X)"),
        outcomes.map((outcome) => ({ segment: "PID", field: 8, outcome })),
      );
      expect(findings, JSON.stringify(outcomes)).toHaveLength(1);
      expect(findings[0]?.code).toBe(FINDING_CODES.PROFILE_MALFORMED);
      expect(findings[0]?.locus).toMatchObject({ segment: "PID", field: 8 });
    }
  });

  it("a locus matching MORE THAN ONE declared rule is one finding at that locus", () => {
    const profile = {
      name: "two-obx-rules",
      segments: [
        { segment: "OBX", usage: "C(R/X)" },
        { segment: "OBX", usage: "O" },
      ],
    } as unknown as ConformanceProfile;
    const findings = validateWith(WITH_SEX, profile, [{ segment: "OBX", outcome: true }]);
    expect(findings).toHaveLength(1);
    expect(findings[0]?.code).toBe(FINDING_CODES.PROFILE_MALFORMED);
    expect(findings[0]?.locus).toMatchObject({ segment: "OBX" });
    expect(findings[0]?.locus.field).toBeUndefined();
  });

  it("a locus both DUPLICATED and AMBIGUOUS is exactly one finding, the ambiguity one", () => {
    const profile = {
      name: "two-obx-conditionals",
      segments: [
        { segment: "OBX", usage: "C(R/X)" },
        { segment: "OBX", usage: "C(O/X)" },
      ],
    } as unknown as ConformanceProfile;
    const findings = validateWith(WITH_SEX, profile, [
      { segment: "OBX", outcome: true },
      { segment: "OBX", outcome: false },
    ]);
    expect(findings).toHaveLength(1);
    expect(findings[0]?.message).toContain("no single rule");
  });

  it("a locus both DUPLICATED and aimed at a NON-CONDITIONAL rule is exactly one finding", () => {
    // Two resolutions at PID-5, whose declared usage is `R`. The target is not a
    // declared conditional, which makes the resolution unusable whatever its
    // outcome and however often it was supplied: ONE finding, that one.
    const profile = {
      name: "pid5-required",
      segments: [{ segment: "PID", fields: [{ field: 5, usage: "R" }] }],
    } as unknown as ConformanceProfile;
    const findings = validateWith(WITH_SEX, profile, [
      { segment: "PID", field: 5, outcome: true },
      { segment: "PID", field: 5, outcome: false },
    ]);
    expect(findings).toHaveLength(1);
    expect(findings[0]?.code).toBe(FINDING_CODES.PROFILE_MALFORMED);
    expect(findings[0]?.locus).toMatchObject({ segment: "PID", field: 5 });
    expect(findings[0]?.message).toContain("not a declared conditional");
  });

  it("a resolution argument that is not a list is one finding at the profile sentinel", () => {
    const junk: readonly unknown[] = [
      "PID/8=true",
      null,
      42,
      true,
      { segment: "PID", field: 8, outcome: true },
    ];
    for (const value of junk) {
      const findings = validateWith(WITHOUT_SEX, pid8Profile("C(R/X)"), value);
      expect(findings, JSON.stringify(value)).toHaveLength(1);
      expect(findings[0]?.code).toBe(FINDING_CODES.PROFILE_MALFORMED);
      expect(findings[0]?.locus).toMatchObject({ segment: "(profile)" });
    }
  });

  it("a list member that is not a well-formed resolution is one finding at the sentinel", () => {
    const badMembers: readonly unknown[] = [
      "PID",
      null,
      42,
      [],
      {},
      { segment: "PID", field: 8 },
      { segment: 8, outcome: true },
      { segment: "", outcome: true },
      { segment: "PID", field: null, outcome: true },
      { segment: "PID", field: "8", outcome: true },
      { segment: "PID", field: [], outcome: true },
      { segment: "PID", field: 0, outcome: true },
      { segment: "PID", field: 1.5, outcome: true },
      { segment: "PID", field: 8, outcome: "ZQVYES" },
      { segment: "PID", field: 8, outcome: null },
    ];
    for (const member of badMembers) {
      const findings = validateWith(WITHOUT_SEX, pid8Profile("C(R/X)"), [member]);
      expect(findings, JSON.stringify(member)).toHaveLength(1);
      expect(findings[0]?.code).toBe(FINDING_CODES.PROFILE_MALFORMED);
      expect(findings[0]?.locus).toMatchObject({ segment: "(profile)" });
      expect(findings[0]?.message, JSON.stringify(member)).not.toContain("ZQVYES");
    }
  });

  it("a malformed resolution never degrades to 'no resolutions supplied'", () => {
    // The clean result this must NOT return: PID-8 is absent and unresolved, so
    // "no resolutions" would be zero findings for an element nothing checked.
    expect(validateWith(WITHOUT_SEX, pid8Profile("C(R/X)"), undefined)).toEqual([]);
    expect(validateWith(WITHOUT_SEX, pid8Profile("C(R/X)"), "PID/8=true")).toHaveLength(1);
  });

  it("shape defects come first, then resolution defects in supply order", () => {
    const profile = {
      name: "shape-and-resolutions",
      segments: [{ segment: "PID", fields: [{ field: 8, usage: "RQ" }] }],
    } as unknown as ConformanceProfile;
    const findings = validateWith(WITH_SEX, profile, [
      { segment: "ZZA", outcome: true },
      { segment: "ZZB", outcome: true },
    ]);
    expect(findings).toHaveLength(3);
    expect(findings.every(isProfileMalformed)).toBe(true);
    expect(findings.map((f) => f.locus.segment)).toEqual(["PID", "ZZA", "ZZB"]);
  });

  it("a bad locus supplied BEFORE an ill-typed member is reported BEFORE it", () => {
    // The two kinds are found by different checks (a member's shape, then its
    // locus), but they are ONE supply-ordered group: index 0 is reported first
    // whichever kind it is.
    const findings = validateWith(WITHOUT_SEX, pid8Profile("C(R/X)"), [
      { segment: "ZZA", outcome: true },
      42,
    ]);
    expect(findings).toHaveLength(2);
    expect(findings.every(isProfileMalformed)).toBe(true);
    expect(findings.map((f) => f.locus.segment)).toEqual(["ZZA", "(profile)"]);
  });

  it("resolution defects of both kinds interleave in supply order", () => {
    const findings = validateWith(WITHOUT_SEX, pid8Profile("C(R/X)"), [
      { segment: "ZZA", outcome: true },
      "junk",
      { segment: "ZZB", outcome: true },
    ]);
    expect(findings).toHaveLength(3);
    expect(findings.every(isProfileMalformed)).toBe(true);
    expect(findings.map((f) => f.locus.segment)).toEqual(["ZZA", "(profile)", "ZZB"]);
  });

  it("a locus is reported where it FIRST appears, not where its duplicate does", () => {
    // PID-8 is supplied at index 0 and again at index 3, so its ONE duplicate
    // finding stands at index 0's position: ahead of the ill-typed member at
    // index 1 and the bad locus at index 2.
    const findings = validateWith(WITHOUT_SEX, pid8Profile("C(R/X)"), [
      { segment: "PID", field: 8, outcome: true },
      42,
      { segment: "ZZB", outcome: true },
      { segment: "PID", field: 8, outcome: false },
    ]);
    expect(findings).toHaveLength(3);
    expect(findings.every(isProfileMalformed)).toBe(true);
    expect(findings.map((f) => f.locus.segment)).toEqual(["PID", "(profile)", "ZZB"]);
    expect(findings[0]?.locus.field).toBe(8);
    expect(findings[0]?.message).toContain("2 resolutions were supplied");
  });

  it("shape defects still precede an INTERLEAVED run of resolution defects", () => {
    const profile = {
      name: "shape-then-interleaved",
      segments: [{ segment: "PID", fields: [{ field: 8, usage: "RQ" }] }],
    } as unknown as ConformanceProfile;
    const findings = validateWith(WITH_SEX, profile, [
      { segment: "ZZA", outcome: true },
      42,
      { segment: "ZZB", outcome: true },
    ]);
    expect(findings).toHaveLength(4);
    expect(findings.every(isProfileMalformed)).toBe(true);
    expect(findings.map((f) => f.locus.segment)).toEqual(["PID", "ZZA", "(profile)", "ZZB"]);
  });

  it("N ill-typed members are N findings at the sentinel, one per member", () => {
    // The per-locus rule collapses defects at ONE locus. An ill-typed member has
    // no locus: `(profile)` is where a finding with none is hung, not a locus
    // these share, so three bad members stay three findings naming three indexes.
    const findings = validateWith(WITHOUT_SEX, pid8Profile("C(R/X)"), [42, "junk", null]);
    expect(findings).toHaveLength(3);
    expect(findings.every(isProfileMalformed)).toBe(true);
    expect(findings.every((f) => f.locus.segment === "(profile)")).toBe(true);
    expect(findings[0]?.message).toContain("resolutions[0]");
    expect(findings[1]?.message).toContain("resolutions[1]");
    expect(findings[2]?.message).toContain("resolutions[2]");
  });

  it("every resolution defect carries severity error", () => {
    const findings = validateWith(WITHOUT_SEX, pid8Profile("C(R/X)"), [
      { segment: "ZZZ", outcome: true },
      "junk",
    ]);
    expect(findings).toHaveLength(2);
    for (const f of findings) expect(f.severity).toBe("error");
  });

  it("a resolution's segment name is echoed under the same 32-character bound", () => {
    const long = "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789abcd";
    const findings = validateWith(WITHOUT_SEX, pid8Profile("C(R/X)"), [
      { segment: long, outcome: true },
    ]);
    expect(findings).toHaveLength(1);
    expect(findings[0]?.locus.segment).toBe(long.slice(0, 32));
    expect(findings[0]?.message).not.toContain(long);
  });
});

describe("the engine never throws for any resolution argument (AC16)", () => {
  it("returns a result for every shape of garbage", () => {
    const msg = parseHL7(WITH_SEX);
    const junk: readonly unknown[] = [
      undefined,
      null,
      "",
      "PID",
      0,
      Number.NaN,
      true,
      [],
      [null],
      [[]],
      [{ segment: "PID", field: Number.POSITIVE_INFINITY, outcome: true }],
      { length: 3 },
      new Map(),
      Symbol("x"),
      (): boolean => true,
    ];
    for (const value of junk) {
      const run = (): unknown =>
        validateAgainstProfile(msg, pid8Profile("C(R/X)"), value as readonly UsageResolution[]);
      expect(run).not.toThrow();
      const result = validateAgainstProfile(
        msg,
        pid8Profile("C(R/X)"),
        value as readonly UsageResolution[],
      );
      expect(Array.isArray(result.findings)).toBe(true);
    }
  });

  it("returns a result for a garbage profile AND a garbage resolution argument together", () => {
    const msg = parseHL7(WITH_SEX);
    expect(() =>
      validateAgainstProfile(
        msg,
        null as unknown as ConformanceProfile,
        "nope" as unknown as readonly UsageResolution[],
      ),
    ).not.toThrow();
  });
});

describe("the fail-fast gate refuses exactly what validation refuses (AC17, AC23)", () => {
  it("raises on a typo and names the offending token", () => {
    expect(() => defineConformanceProfile(pid8Profile("RQ"))).toThrow(ProfileDefinitionError);
    try {
      defineConformanceProfile(pid8Profile("RQ"));
      expect.unreachable("should have thrown");
    } catch (err) {
      expect((err as ProfileDefinitionError).message).toContain("RQ");
    }
  });

  it("raises on every token the validation path refuses", () => {
    for (const token of ["RQ", "C(a/b)", "c(r/x)", "C(C(R/X)/O)", "C(R / X)"]) {
      expect(() => defineConformanceProfile(pid8Profile(token)), token).toThrow(
        ProfileDefinitionError,
      );
    }
    expect(() => defineConformanceProfile(pid8Profile(7))).toThrow(ProfileDefinitionError);
  });

  it("names EVERY usage defect it found, each bounded to 32 characters", () => {
    const garbage = "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789abcd";
    const long = `C(R/${garbage})`;
    const profile = {
      name: "many-defects",
      segments: [
        { segment: "PID", usage: "RQ", fields: [{ field: 8, usage: "c(r/x)" }] },
        { segment: "PV1", usage: long },
      ],
    } as unknown as ConformanceProfile;
    try {
      defineConformanceProfile(profile);
      expect.unreachable("should have thrown");
    } catch (err) {
      const { message } = err as ProfileDefinitionError;
      expect(message).toContain("RQ");
      expect(message).toContain("c(r/x)");
      expect(message).toContain(long.slice(0, 32));
      expect(message).not.toContain(long);
    }
  });

  it("does NOT raise on an omitted usage, and accepts every declarable token", () => {
    expect(() =>
      defineConformanceProfile({
        name: "omitted",
        segments: [{ segment: "PID", fields: [{ field: 8, length: 3 }] }],
      }),
    ).not.toThrow();
    for (const token of ["R", "RE", "C", "CE", "O", "X", "B", "C(RE/X)", "C(B/B)"]) {
      expect(() => defineConformanceProfile(pid8Profile(token)), token).not.toThrow();
    }
  });
});

describe("profile shapes this change must leave alone (AC18, AC19, AC22, AC23)", () => {
  it("an empty list of segment rules is zero findings and no throw", () => {
    const profile: ConformanceProfile = { name: "empty", segments: [] };
    expect(() => validateAgainstProfile(parseHL7(WITH_SEX), profile)).not.toThrow();
    expect(validateAgainstProfile(parseHL7(WITH_SEX), profile).findings).toEqual([]);
    expect(() => defineConformanceProfile(profile)).not.toThrow();
  });

  it("a segment rule with NO field rules is not a defect and still fires its own usage", () => {
    const profile: ConformanceProfile = {
      name: "fieldless",
      segments: [{ segment: "PID", usage: "R" }],
    };
    expect(() => defineConformanceProfile(profile)).not.toThrow();
    const { findings } = validateAgainstProfile(parseHL7(MSH_ONLY), profile);
    expect(findings).toHaveLength(1);
    expect(findings[0]?.code).toBe(FINDING_CODES.PROFILE_REQUIRED_ABSENT);
    expect(findings[0]?.locus).toMatchObject({ segment: "PID" });
  });

  it("an omitted usage is accepted and evaluated exactly as it was before", () => {
    const profile: ConformanceProfile = {
      name: "omitted-usage",
      segments: [{ segment: "PID", usage: "R", fields: [{ field: 8, length: 3 }] }],
    };
    expect(() => defineConformanceProfile(profile)).not.toThrow();
    expect(validateAgainstProfile(parseHL7(WITHOUT_SEX), profile).findings).toEqual([]);
    const { findings } = validateAgainstProfile(parseHL7(LONG_SEX), profile);
    expect(findings).toHaveLength(1);
    expect(findings[0]?.code).toBe(FINDING_CODES.PROFILE_LENGTH);
  });

  it("absent, undefined and an empty list are the same argument", () => {
    const profile: ConformanceProfile = {
      name: "pin-vocabulary",
      segments: [
        { segment: "PV1", usage: "R" },
        { segment: "PID", usage: "X" },
        { segment: "EVN", cardinality: { min: 2, max: 3 } },
        {
          segment: "PID",
          fields: [
            { field: 3, usage: "R", length: 3 },
            { field: 8, usage: "RE", valueSet: ["M", "F"] },
            { field: 6, usage: "C" },
            { field: 10, usage: "O" },
            { field: 20 },
          ],
        },
      ],
    };
    const msg = parseHL7(WITH_SEX);
    const absent = validateAgainstProfile(msg, profile).findings;
    const undef = validateAgainstProfile(msg, profile, undefined).findings;
    const empty = validateAgainstProfile(msg, profile, []).findings;
    expect(absent.length).toBeGreaterThan(0);
    expect(undef).toEqual(absent);
    expect(empty).toEqual(absent);
  });
});

describe("the exported shapes are separate types (AC24)", () => {
  it("accepts a simple code, B, and a declared conditional where a usage is expected", () => {
    const simple: UsageCode = "R";
    const backward: UsageCode = "B";
    const conditional: UsageCode = "C(RE/X)";
    expect([simple, backward, conditional]).toEqual(["R", "B", "C(RE/X)"]);
  });

  it("rejects a typo and the placeholder at compile time", () => {
    // @ts-expect-error "RQ" is not a usage code a rule may declare
    const typo: UsageCode = "RQ";
    // @ts-expect-error the placeholder notation is a listing entry, never a declarable usage
    const placeholder: UsageCode = "C(a/b)";
    expect([typo, placeholder]).toEqual(["RQ", "C(a/b)"]);
  });

  it("does not type the registry as the type a rule's usage is declared with", () => {
    const entry: UsageCodeRegistryEntry = "C(a/b)";
    // @ts-expect-error a registry entry is not assignable where a rule usage is expected
    const asUsage: UsageCode = entry;
    expect(asUsage).toBe("C(a/b)");
  });

  it("neither exported shape widens to a bare string", () => {
    const loose: string = "anything";
    // @ts-expect-error the declarable-usage type is not a bare string
    const asUsage: UsageCode = loose;
    // @ts-expect-error the registry's element type is not a bare string either
    const asEntry: UsageCodeRegistryEntry = loose;
    expect([asUsage, asEntry]).toEqual(["anything", "anything"]);
  });
});
