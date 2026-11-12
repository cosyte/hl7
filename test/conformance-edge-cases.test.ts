/**
 * Edge cases of the conformance engine the main suites do not reach: shape
 * defects a JavaScript caller can write past the types, locations deeper than a
 * message carries, a message built by hand with holes in it, and a profile
 * whose properties change after its shape check has passed.
 *
 * The engine's contract is that it never throws and that every outcome is a
 * typed finding, so each case asserts the findings a consumer reads. All values
 * are synthetic.
 */

import { describe, expect, it } from "vitest";

import {
  DEFAULT_ENCODING_CHARACTERS,
  FINDING_CODES,
  Hl7Message,
  ProfileDefinitionError,
  conformance,
  defineConformanceProfile,
  parseHL7,
  validateAgainstProfile,
  type ConformanceFinding,
  type ConformanceProfile,
  type RawField,
  type Segment,
  type UsageResolution,
} from "../src/index.js";

const MSH = "MSH|^~\\&|A|B|C|D|20260101||ADT^A01|MSG1|P|2.5";

const message = (...segments: readonly string[]): Hl7Message =>
  parseHL7([MSH, ...segments].join("\r"));

const findingsOf = (
  msg: Hl7Message,
  profile: unknown,
  resolutions?: unknown,
): readonly ConformanceFinding[] =>
  validateAgainstProfile(
    msg,
    profile as ConformanceProfile,
    resolutions as readonly UsageResolution[],
  ).findings;

const codes = (findings: readonly ConformanceFinding[]): readonly string[] =>
  findings.map((f) => f.code);

const details = (profile: unknown): readonly string[] =>
  conformance.collectProfileDefects(profile).map((d) => d.detail);

/** A PID-8 rule whose conditional usage is decided by `condition`. */
const pid8When = (condition: unknown): unknown => ({
  name: "pid8",
  segments: [{ segment: "PID", fields: [{ field: 8, usage: "C(R/X)", condition }] }],
});

describe("cardinality findings", () => {
  it("names only the minimum when the rule declares no maximum", () => {
    const findings = findingsOf(message("PID|1", "OBX|1"), {
      name: "min-only",
      segments: [{ segment: "OBX", cardinality: { min: 2 } }],
    });
    expect(codes(findings)).toEqual([FINDING_CODES.PROFILE_CARDINALITY]);
    expect(findings[0]?.message).toContain("(min 2)");
    expect(findings[0]?.message).not.toContain("max");
  });
});

describe("predicate locations deeper than the message carries", () => {
  it("a presence statement at a component the field lacks is not valued", () => {
    // PID-5 carries two components; component 4 is absent, so C(R/X) selects X.
    const findings = findingsOf(
      message("PID|1||||Doe^John|||M"),
      pid8When({ location: { segment: "PID", field: 5, component: 4 }, presence: "is valued" }),
    );
    expect(codes(findings)).toEqual([FINDING_CODES.PROFILE_NOT_PERMITTED]);
  });

  it("a presence statement at a subcomponent reads that subcomponent", () => {
    const at = { segment: "PID", field: 5, component: 1, subcomponent: 2 };
    const condition = { location: at, presence: "is valued" };
    expect(findingsOf(message("PID|1||||Doe&Jr^John|||M"), pid8When(condition))).toEqual([]);
    expect(codes(findingsOf(message("PID|1||||Doe^John|||M"), pid8When(condition)))).toEqual([
      FINDING_CODES.PROFILE_NOT_PERMITTED,
    ]);
  });

  it("a comparison at a component the field lacks is undecided, never guessed", () => {
    const findings = findingsOf(
      message("PID|1||||Doe^John|||M"),
      pid8When({ location: { segment: "PID", field: 5, component: 4 }, verb: "is", values: ["X"] }),
    );
    expect(codes(findings)).toEqual([FINDING_CODES.PROFILE_CONDITION_UNEVALUATABLE]);
  });

  it("an undecided subcomponent location is named down to the subcomponent", () => {
    const findings = findingsOf(
      message("PID|1||||Doe^John|||M"),
      pid8When({
        location: { segment: "PID", field: 5, component: 1, subcomponent: 2 },
        verb: "is",
        values: ["Jr"],
      }),
    );
    expect(codes(findings)).toEqual([FINDING_CODES.PROFILE_CONDITION_UNEVALUATABLE]);
    expect(findings[0]?.message).toContain("PID-5 component 1 subcomponent 2");
  });
});

describe("profile shape defects", () => {
  it("refuses a subcomponent that is not a positive integer", () => {
    const defects = details(
      pid8When({
        location: { segment: "PID", field: 5, component: 1, subcomponent: 0 },
        presence: "is valued",
      }),
    );
    expect(defects.some((d) => d.includes("location.subcomponent must be a positive"))).toBe(true);
  });

  it("refuses a cardinality that is not an object", () => {
    expect(details({ name: "p", segments: [{ segment: "PID", cardinality: 2 }] })).toEqual([
      'segment "PID" cardinality must be an object.',
    ]);
  });

  it("refuses a maximum that is neither an integer nor *", () => {
    expect(
      details({ name: "p", segments: [{ segment: "PID", cardinality: { max: "many" } }] }),
    ).toEqual(['segment "PID" cardinality.max must be a non-negative integer or "*".']);
  });

  it("an implementable claim adds nothing to a usage the usage check already refused", () => {
    for (const usage of [5, "bogus"]) {
      const defects = details({
        name: "p",
        level: "implementable",
        segments: [{ segment: "PID", usage }],
      });
      expect(defects).toHaveLength(1);
      expect(defects[0]).toMatch(/^segment "PID" usage /);
    }
  });

  it("refuses a segments value that is not an array", () => {
    expect(details({ name: "p", segments: "PID" })).toEqual([
      "profile.segments must be an array of segment rules.",
    ]);
  });

  it("refuses a minimum that is not a non-negative integer", () => {
    for (const min of [-1, 1.5, "1"]) {
      expect(
        details({ name: "p", segments: [{ segment: "PID", cardinality: { min } }] }),
        String(min),
      ).toEqual(['segment "PID" cardinality.min must be a non-negative integer.']);
    }
  });

  it("refuses a maximum below the minimum", () => {
    expect(
      details({ name: "p", segments: [{ segment: "PID", cardinality: { min: 2, max: 1 } }] }),
    ).toEqual(['segment "PID" cardinality.max (1) is less than min (2).']);
  });

  it("refuses a field length that is not a non-negative integer", () => {
    for (const length of [-1, 2.5, "10"]) {
      expect(
        details({ name: "p", segments: [{ segment: "PID", fields: [{ field: 5, length }] }] }),
        String(length),
      ).toEqual(['segment "PID" field 5 length must be a non-negative integer.']);
    }
  });

  it("refuses a segment rule that is not an object and keeps checking the rest", () => {
    expect(details({ name: "p", segments: ["PID", { segment: "PV1", usage: "Q" }] })).toEqual([
      "segments[0] must be an object.",
      expect.stringMatching(/^segment "PV1" usage is not a usage code/) as string,
    ]);
  });

  it("refuses a fields value that is not an array", () => {
    expect(details({ name: "p", segments: [{ segment: "PID", fields: { 3: "R" } }] })).toEqual([
      'segment "PID" fields must be an array.',
    ]);
  });

  it("refuses a field rule that is not an object", () => {
    expect(details({ name: "p", segments: [{ segment: "PID", fields: [null] }] })).toEqual([
      'segment "PID" fields[0] must be an object.',
    ]);
  });

  it("refuses a component that is not a positive integer", () => {
    expect(
      details({ name: "p", segments: [{ segment: "PID", fields: [{ field: 5, component: 0 }] }] }),
    ).toEqual(['segment "PID" field 5 component must be a positive (1-indexed) integer.']);
  });

  it("refuses a value set carrying a non-string entry", () => {
    expect(
      details({
        name: "p",
        segments: [{ segment: "PID", fields: [{ field: 8, valueSet: ["M", 1] }] }],
      }),
    ).toEqual(['segment "PID" field 8 valueSet entries must all be strings.']);
  });

  it("the authoring gate names no profile when the name is not a string", () => {
    let thrown: unknown;
    try {
      defineConformanceProfile({ name: 7, segments: [] });
    } catch (error) {
      thrown = error;
    }
    expect(thrown).toBeInstanceOf(ProfileDefinitionError);
    expect((thrown as ProfileDefinitionError).profileName).toBeUndefined();
    expect((thrown as ProfileDefinitionError).message).toContain("profile.name");
  });
});

describe("resolutions against a malformed profile", () => {
  const resolution = [{ segment: "PID", field: 8, outcome: true }];

  it("are refused as unmatched when the profile is not an object", () => {
    const findings = findingsOf(message("PID|1"), "not a profile", resolution);
    expect(findings.length).toBeGreaterThan(0);
    expect(findings.every((f) => f.code === FINDING_CODES.PROFILE_MALFORMED)).toBe(true);
  });

  it("skip segment entries and field entries that declare no locus", () => {
    const profile = {
      name: "p",
      segments: [
        7,
        { usage: "R" },
        { segment: "PID", fields: [null, { field: 8, usage: "C(R/X)" }] },
      ],
    };
    // The well-formed PID-8 rule is still found: only the entries around it are skipped.
    const defects = conformance.collectProfileDefects(profile).map((d) => d.detail);
    const findings = findingsOf(message("PID|1"), profile, resolution);
    expect(findings.map((f) => f.message)).toEqual(
      defects.map((d) => expect.stringContaining(d) as string),
    );
    expect(findings.some((f) => /resolution/u.test(f.message))).toBe(false);
  });

  it("are refused as unmatched when the profile's segments are not an array", () => {
    const findings = findingsOf(message("PID|1"), { name: "p", segments: "PID" }, resolution);
    expect(findings.length).toBeGreaterThan(0);
    expect(findings.every((f) => f.code === FINDING_CODES.PROFILE_MALFORMED)).toBe(true);
  });

  it("skip a field entry whose position is not a positive integer", () => {
    const profile = {
      name: "p",
      segments: [
        {
          segment: "PID",
          fields: [{ field: 0 }, { field: "8" }, { field: 8, usage: "C(R/X)" }],
        },
      ],
    };
    // The well-formed PID-8 rule is still found: only the entries before it are skipped.
    const defects = conformance.collectProfileDefects(profile).map((d) => d.detail);
    const findings = findingsOf(message("PID|1"), profile, resolution);
    expect(findings.map((f) => f.message)).toEqual(
      defects.map((d) => expect.stringContaining(d) as string),
    );
    expect(findings.some((f) => /resolution/u.test(f.message))).toBe(false);
  });
});

describe("a message built by hand", () => {
  const field = (...values: string[]): RawField => ({
    repetitions: values.map((v) => ({ components: [{ subcomponents: [v] }] })),
    isNull: false,
  });
  const absent: RawField = { repetitions: [], isNull: false };

  it("skips a hole in a field's repetitions and checks the repetitions around it", () => {
    const sparse: RawField = { repetitions: [], isNull: false };
    (sparse.repetitions as unknown[])[1] = { components: [{ subcomponents: ["Q"] }] };
    const msg = new Hl7Message({
      segments: [
        {
          name: "PID",
          fields: [absent, field("1"), absent, absent, absent, absent, absent, absent, sparse],
        },
      ],
      encodingCharacters: DEFAULT_ENCODING_CHARACTERS,
      version: "2.5",
      warnings: [],
    });
    const findings = findingsOf(msg, {
      name: "p",
      segments: [{ segment: "PID", fields: [{ field: 8, valueSet: ["M", "F"] }] }],
    });
    expect(codes(findings)).toEqual([FINDING_CODES.PROFILE_VALUE_NOT_IN_SET]);
    expect(findings[0]?.locus.repetition).toBe(1);
  });

  it("skips a hole among the occurrences a subclass hands back", () => {
    class WithHole extends Hl7Message {
      public override segments(segmentType: string): readonly Segment[] {
        const found = super.segments(segmentType);
        const out: Segment[] = [];
        out[1] = found[0] as Segment;
        return segmentType === "PID" ? out : found;
      }
    }
    const parsed = message("PID|1|||||||Q");
    const msg = new WithHole({
      segments: parsed.rawSegments,
      encodingCharacters: parsed.encodingCharacters,
      version: "2.5",
      warnings: [],
    });
    const findings = findingsOf(msg, {
      name: "p",
      segments: [{ segment: "PID", fields: [{ field: 8, valueSet: ["M", "F"] }] }],
    });
    expect(codes(findings)).toEqual([FINDING_CODES.PROFILE_VALUE_NOT_IN_SET]);
    expect(findings[0]?.locus.occurrence).toBe(1);
  });
});

describe("a profile that changes after its shape check", () => {
  /**
   * The engine checks a profile's shape before it reads the message, and the
   * evaluator then reads the same profile again. A getter can answer the two
   * reads differently. The flag flips on the engine's first read of the
   * message, so the shape check sees `before` and the evaluator sees `after`.
   */
  const changing = (
    before: unknown,
    after: unknown,
    key: "condition" | "usage",
    rest: Record<string, unknown>,
  ): { readonly msg: Hl7Message; readonly profile: unknown } => {
    const msg = message("PID|1||||Doe^John||19800115|M");
    let reading = false;
    const segments = msg.segments.bind(msg);
    Object.defineProperty(msg, "segments", {
      value: (segmentType: string) => {
        reading = true;
        return segments(segmentType);
      },
    });
    const rule = { segment: "PID", ...rest };
    Object.defineProperty(rule, key, { enumerable: true, get: () => (reading ? after : before) });
    return { msg, profile: { name: "changing", segments: [rule] } };
  };

  const VALUED = { location: { segment: "PID", field: 7 }, presence: "is valued" };

  for (const [label, after] of [
    ["a statement that states nothing", {}],
    ["an operand that is not a statement", { connector: "AND", left: "PID-7", right: VALUED }],
    [
      "a comparison that stops at the segment",
      { location: { segment: "PID" }, verb: "is", values: ["X"] },
    ],
  ] as const) {
    it(`a condition that turns into ${label} is reported undecided, never thrown on`, () => {
      const { msg, profile } = changing(VALUED, after, "condition", { usage: "C" });
      const findings = findingsOf(msg, profile);
      expect(codes(findings)).toEqual([FINDING_CODES.PROFILE_CONDITION_UNEVALUATABLE]);
    });
  }

  it("a condition that turns deeper than the language allows is undecided", () => {
    let deep: unknown = VALUED;
    for (let i = 0; i < 20; i++) deep = { connector: "AND", left: VALUED, right: deep };
    const { msg, profile } = changing(VALUED, deep, "condition", { usage: "C" });
    expect(codes(findingsOf(msg, profile))).toEqual([
      FINDING_CODES.PROFILE_CONDITION_UNEVALUATABLE,
    ]);
  });

  it("an undecided condition with nothing to name says so without a location list", () => {
    const { msg, profile } = changing(VALUED, {}, "condition", { usage: "C" });
    const [finding] = findingsOf(msg, profile);
    expect(finding?.message).not.toContain("no content to compare");
  });

  it("a usage that turns into an unknown token decides nothing", () => {
    const { msg, profile } = changing("R", "bogus", "usage", {});
    expect(findingsOf(msg, profile)).toEqual([]);
  });

  it("a conditional usage that turns simple is read as that simple usage", () => {
    const msg = message("PID|1||||Doe^John||19800115|M");
    let reading = false;
    const segments = msg.segments.bind(msg);
    Object.defineProperty(msg, "segments", {
      value: (segmentType: string) => {
        reading = true;
        return segments(segmentType);
      },
    });
    const rule = { segment: "PV1", condition: VALUED };
    Object.defineProperty(rule, "usage", { enumerable: true, get: () => (reading ? "R" : "C") });
    const findings = findingsOf(msg, { name: "changing", segments: [rule] });
    expect(codes(findings)).toEqual([FINDING_CODES.PROFILE_REQUIRED_ABSENT]);
  });
});
