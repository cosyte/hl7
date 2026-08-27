/**
 * A profile declares its conformance LEVEL, the result echoes the level in
 * force, and an implementable claim is checked rather than believed.
 *
 * The reason the level exists is that an empty findings list means two
 * different things at two different levels: the methodology says a complete
 * assessment can be determined for an interface declaring conformance to an
 * implementable profile, and that for standard-level and constrainable-level
 * profiles not all aspects can be. So a consumer reading zero findings needs to
 * know which of the two they are holding.
 *
 * Five groups, matching the five things the change is:
 *
 *   - **The vocabulary** (AC1, AC2): three levels, ordered least-constrained
 *     first, frozen, and compile-time checked on the profile type.
 *   - **The echo** (AC3 to AC6): every result carries the level in force, a
 *     profile that declares none is assessed and echoed as constrainable, and
 *     standard and constrainable impose nothing on any element.
 *   - **The implementable gate** (AC7 to AC13): the phase's own verification,
 *     that a profile asserting implementable with a leftover `O` is refused and
 *     the same profile with that element constrained passes; plus each refusal
 *     case one at a time, at segment, field and component level.
 *   - **A level that is not one of the three** (AC14 to AC16), including a
 *     value of the wrong type forced through an unchecked cast.
 *   - **Refuse before echoing, and the PHI floor** (AC17 to AC20): a refused
 *     claim is never the level echoed, a result carries a level even when the
 *     profile's own name cannot be read, and no defect this change introduces
 *     carries a value read from the message.
 */

import { describe, expect, it } from "vitest";

import {
  FINDING_CODES,
  PROFILE_LEVELS,
  ProfileDefinitionError,
  defineConformanceProfile,
  parseHL7,
  validateAgainstProfile,
  type ComponentRule,
  type ConformanceFinding,
  type ConformanceProfile,
  type ProfileLevel,
  type SegmentRule,
} from "../src/index.js";

const HEAD = "MSH|^~\\&|EPIC|MAIN|LIS|REF|20260419101500||ADT^A01|MSG00001|P|2.5";
const CONFORMING = [HEAD, "PID|1||MRN001^^^HOSP^MR||Doe^John||19800115|M"].join("\r");
const MESSAGE = parseHL7(CONFORMING);

/** Every value in the message above, for the PHI floor below. */
const MESSAGE_VALUES: readonly string[] = [
  "EPIC",
  "MAIN",
  "LIS",
  "REF",
  "20260419101500",
  "MSG00001",
  "MRN001",
  "HOSP",
  "Doe",
  "John",
  "19800115",
];

/**
 * A profile over the message above, fully declared so that a claim of the
 * implementable level stands: every rule carries a usage drawn from `R`, `RE`
 * and `X`, and the message satisfies every one of them.
 */
const SEGMENTS: readonly SegmentRule[] = [
  { segment: "MSH", usage: "R", fields: [{ field: 10, name: "Control ID", usage: "R" }] },
  {
    segment: "PID",
    usage: "R",
    fields: [
      { field: 3, name: "Patient Identifiers", usage: "R" },
      { field: 8, name: "Administrative Sex", usage: "RE", valueSet: ["M", "F", "U"] },
      { field: 19, name: "SSN", usage: "X" },
    ],
  },
];

/** The same profile at whatever level is asked for (absent when `level` is omitted). */
const profileAt = (level?: ProfileLevel): ConformanceProfile => ({
  name: "level-fixture",
  ...(level === undefined ? {} : { level }),
  segments: SEGMENTS,
});

/**
 * The same profile with ONE field rule's usage replaced. Untyped on purpose:
 * the refusal cases pass usages the profile type would refuse at compile time,
 * which is what the runtime gate is the backstop for.
 */
const withPid8Usage = (usage: unknown, level: unknown = "implementable"): ConformanceProfile =>
  ({
    name: "level-fixture",
    level,
    segments: [
      SEGMENTS[0],
      {
        segment: "PID",
        usage: "R",
        fields: [
          { field: 3, name: "Patient Identifiers", usage: "R" },
          { field: 8, name: "Administrative Sex", usage, valueSet: ["M", "F", "U"] },
          { field: 19, name: "SSN", usage: "X" },
        ],
      },
    ],
  }) as unknown as ConformanceProfile;

/** A profile whose PID-8 rule declares NO usage at all. */
const PID8_UNDECLARED: ConformanceProfile = {
  name: "level-fixture",
  level: "implementable",
  segments: [
    SEGMENTS[0] as SegmentRule,
    {
      segment: "PID",
      usage: "R",
      fields: [
        { field: 3, name: "Patient Identifiers", usage: "R" },
        { field: 8, name: "Administrative Sex", valueSet: ["M", "F", "U"] },
        { field: 19, name: "SSN", usage: "X" },
      ],
    },
  ],
};

/** The same profile with PID-3's component rules replaced. */
const withPid3Components = (components: unknown): ConformanceProfile =>
  ({
    name: "level-fixture",
    level: "implementable",
    segments: [
      SEGMENTS[0],
      {
        segment: "PID",
        usage: "R",
        fields: [
          { field: 3, name: "Patient Identifiers", usage: "R", components },
          { field: 8, name: "Administrative Sex", usage: "RE", valueSet: ["M", "F", "U"] },
          { field: 19, name: "SSN", usage: "X" },
        ],
      },
    ],
  }) as unknown as ConformanceProfile;

/** Components 1 to 5 of PID-3, every one of them declared and admissible. */
const FIVE_COMPONENTS: readonly ComponentRule[] = [
  { component: 1, usage: "R" },
  { component: 2, usage: "RE" },
  { component: 3, usage: "RE" },
  { component: 4, usage: "RE" },
  { component: 5, usage: "RE" },
];

const run = (profile: unknown): ReturnType<typeof validateAgainstProfile> =>
  validateAgainstProfile(MESSAGE, profile as ConformanceProfile);

const malformed = (findings: readonly ConformanceFinding[]): readonly ConformanceFinding[] =>
  findings.filter((f) => f.code === FINDING_CODES.PROFILE_MALFORMED);

// ---------------------------------------------------------------------------
// The vocabulary (AC1, AC2).
// ---------------------------------------------------------------------------

describe("the exported level vocabulary (AC1, AC2)", () => {
  it("lists exactly the three levels, ordered from least to most constrained", () => {
    expect([...PROFILE_LEVELS]).toEqual(["standard", "constrainable", "implementable"]);
    expect(PROFILE_LEVELS).toHaveLength(3);
  });

  it("an add / remove / overwrite attempt leaves a subsequent read identical", () => {
    const before = [...PROFILE_LEVELS];
    const mutable = PROFILE_LEVELS as unknown as string[];
    const attempts = [
      (): void => {
        mutable.push("certified");
      },
      (): void => {
        mutable.pop();
      },
      (): void => {
        mutable[0] = "certified";
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
    expect([...PROFILE_LEVELS]).toEqual(before);
    expect([...PROFILE_LEVELS]).toEqual(["standard", "constrainable", "implementable"]);
  });

  it("the declaration is a checked member of the profile type, not a bare string", () => {
    const typed: ConformanceProfile = { name: "p", level: "implementable", segments: [] };
    expect(typed.level).toBe("implementable");
    // @ts-expect-error "certified" is not a ProfileLevel
    const wrong: ConformanceProfile = { name: "p", level: "certified", segments: [] };
    // @ts-expect-error the level is a closed union, never a bare string
    const bare: ConformanceProfile = { name: "p", level: String("standard"), segments: [] };
    expect(wrong.level).toBe("certified");
    expect(bare.level).toBe("standard");
  });
});

// ---------------------------------------------------------------------------
// The echo (AC3 to AC6).
// ---------------------------------------------------------------------------

describe("every result echoes the level in force (AC3 to AC6)", () => {
  it("a declared level is echoed on the result beside the profile name", () => {
    for (const level of PROFILE_LEVELS) {
      const result = run(profileAt(level));
      expect(result.profileName).toBe("level-fixture");
      expect(result.level).toBe(level);
      expect(result.findings).toEqual([]);
    }
  });

  it("a profile that declares NO level is assessed and echoed as constrainable", () => {
    const result = run(profileAt());
    expect(result.level).toBe("constrainable");
    expect(result.findings).toEqual([]);
  });

  it("an undeclared level never reads as implementable, whatever the rules look like", () => {
    // Every rule here is one the implementable claim would refuse. Saying
    // nothing is the weaker claim, so none of them is refused and the echo is
    // the weaker level.
    const loose = {
      name: "level-fixture",
      segments: [{ segment: "PID", fields: [{ field: 8, usage: "O" }, { field: 19 }] }],
    } as unknown as ConformanceProfile;
    const result = run(loose);
    expect(result.level).toBe("constrainable");
    expect(result.level).not.toBe("implementable");
    expect(result.findings).toEqual([]);
  });

  it("standard and constrainable impose NO level-derived constraint on any element", () => {
    // The same rules the implementable claim refuses below, at each of the two
    // weaker levels: zero findings, and the declared level echoed as declared.
    for (const level of ["standard", "constrainable"] as const) {
      const loose = {
        name: "level-fixture",
        level,
        segments: [
          {
            segment: "PID",
            fields: [
              { field: 8, usage: "O" },
              { field: 10, usage: "C" },
              { field: 11, usage: "CE" },
              { field: 12, usage: "B" },
              { field: 13, usage: "C(R/O)" },
              { field: 19 },
            ],
          },
        ],
      } as unknown as ConformanceProfile;
      const result = run(loose);
      expect(result.findings).toEqual([]);
      expect(result.level).toBe(level);
    }
  });
});

// ---------------------------------------------------------------------------
// The implementable gate (AC7 to AC13).
// ---------------------------------------------------------------------------

describe("an implementable claim is checked, not believed (AC7 to AC13)", () => {
  it("the phase's own verification: a leftover O is refused, and constraining it passes", () => {
    const refused = run(withPid8Usage("O"));
    expect(malformed(refused.findings)).toHaveLength(1);
    expect(refused.findings[0]?.locus).toMatchObject({ segment: "PID", field: 8 });
    expect(refused.level).not.toBe("implementable");

    const accepted = run(withPid8Usage("RE"));
    expect(accepted.findings).toEqual([]);
    expect(accepted.level).toBe("implementable");
  });

  it("each of C, CE, O and B is refused one at a time, naming its locus and token", () => {
    for (const usage of ["C", "CE", "O", "B"]) {
      const { findings, level } = run(withPid8Usage(usage));
      const defects = malformed(findings);
      expect(defects).toHaveLength(1);
      expect(defects[0]?.severity).toBe("error");
      expect(defects[0]?.locus).toMatchObject({ segment: "PID", field: 8 });
      expect(defects[0]?.message).toContain(`"${usage}"`);
      expect(defects[0]?.message).toContain("implementable");
      expect(level).toBe("constrainable");
    }
  });

  it("R, RE and X are admitted, and so is a conditional whose outcomes are drawn from them", () => {
    for (const usage of ["R", "RE", "X", "C(R/X)", "C(RE/X)", "C(X/RE)"]) {
      const { findings, level } = run(withPid8Usage(usage));
      expect(malformed(findings)).toEqual([]);
      expect(level).toBe("implementable");
    }
  });

  it("a conditional whose true or false outcome is not R, RE or X is refused", () => {
    for (const usage of ["C(R/O)", "C(O/X)", "C(C/X)", "C(R/CE)", "C(B/B)"]) {
      const { findings, level } = run(withPid8Usage(usage));
      const defects = malformed(findings);
      expect(defects).toHaveLength(1);
      expect(defects[0]?.locus).toMatchObject({ segment: "PID", field: 8 });
      expect(defects[0]?.message).toContain(`"${usage}"`);
      expect(level).toBe("constrainable");
    }
  });

  it("a field rule that declares no usage at all is refused, naming its locus", () => {
    const { findings, level } = run(PID8_UNDECLARED);
    const defects = malformed(findings);
    expect(defects).toHaveLength(1);
    expect(defects[0]?.locus).toMatchObject({ segment: "PID", field: 8 });
    expect(defects[0]?.message).toContain("declares no usage");
    expect(level).toBe("constrainable");
  });

  it("a SEGMENT rule is held to the same terminus, usage and silence alike", () => {
    const cases: readonly [unknown, string][] = [
      ["O", '"O"'],
      ["C", '"C"'],
      [undefined, "declares no usage"],
    ];
    for (const [usage, expected] of cases) {
      const profile = {
        name: "level-fixture",
        level: "implementable",
        segments: [
          SEGMENTS[0],
          {
            segment: "ZZZ",
            ...(usage === undefined ? {} : { usage }),
          },
        ],
      } as unknown as ConformanceProfile;
      const defects = malformed(run(profile).findings);
      expect(defects).toHaveLength(1);
      expect(defects[0]?.locus).toMatchObject({ segment: "ZZZ" });
      expect(defects[0]?.locus.field).toBeUndefined();
      expect(defects[0]?.message).toContain(expected);
    }
  });

  it("a COMPONENT rule is held to it too, and a fully declared field passes", () => {
    expect(malformed(run(withPid3Components(FIVE_COMPONENTS)).findings)).toEqual([]);
    expect(run(withPid3Components(FIVE_COMPONENTS)).level).toBe("implementable");

    const loosened = [{ component: 1, usage: "R" }, { component: 2, usage: "O" }, { component: 3 }];
    const defects = malformed(run(withPid3Components(loosened)).findings);
    expect(defects).toHaveLength(2);
    expect(defects[0]?.locus).toMatchObject({ segment: "PID", field: 3, component: 2 });
    expect(defects[0]?.message).toContain('"O"');
    expect(defects[1]?.locus).toMatchObject({ segment: "PID", field: 3, component: 3 });
    expect(defects[1]?.message).toContain("declares no usage");
  });

  it("every element is checked, so several leftovers are several defects", () => {
    const profile = {
      name: "level-fixture",
      level: "implementable",
      segments: [
        { segment: "MSH", usage: "R", fields: [{ field: 10, usage: "O" }] },
        { segment: "PID", fields: [{ field: 3, usage: "C" }] },
      ],
    } as unknown as ConformanceProfile;
    const defects = malformed(run(profile).findings);
    expect(defects).toHaveLength(3);
    expect(defects.map((d) => d.locus)).toEqual([
      { segment: "MSH", field: 10 },
      { segment: "PID" },
      { segment: "PID", field: 3 },
    ]);
  });

  it("the fail-fast authoring helper throws for every refusal the engine reports", () => {
    for (const profile of [withPid8Usage("O"), withPid8Usage("C(R/O)"), PID8_UNDECLARED]) {
      expect(() => defineConformanceProfile(profile)).toThrow(ProfileDefinitionError);
    }
    expect(() => defineConformanceProfile(withPid8Usage("RE"))).not.toThrow();
  });
});

// ---------------------------------------------------------------------------
// A level that is not one of the three (AC14 to AC16).
// ---------------------------------------------------------------------------

describe("a level outside the three defined ones (AC14 to AC16)", () => {
  it("a token outside the set is PROFILE_MALFORMED naming the offending declaration", () => {
    for (const level of ["Implementable", "IMPLEMENTABLE", "certified", "", "conformant"]) {
      const { findings, level: inForce } = run(withPid8Usage("RE", level));
      const defects = malformed(findings);
      expect(defects).toHaveLength(1);
      expect(defects[0]?.locus).toMatchObject({ segment: "(profile)" });
      expect(defects[0]?.message).toContain(`"${level}"`);
      expect(inForce).toBe("constrainable");
    }
  });

  it("a value of the wrong type through an unchecked cast names the TYPE and never throws", () => {
    const cases: readonly [unknown, string][] = [
      [42, "number"],
      [null, "null"],
      [["implementable"], "array"],
      [{ level: "implementable" }, "object"],
      [true, "boolean"],
    ];
    for (const [level, described] of cases) {
      const result = run(withPid8Usage("RE", level));
      const defects = malformed(result.findings);
      expect(defects).toHaveLength(1);
      expect(defects[0]?.message).toContain(`must be a string, not ${described}`);
      expect(result.level).toBe("constrainable");
    }
  });

  it("the authoring helper rejects a bad level by throwing, as for any other defect", () => {
    expect(() => defineConformanceProfile(withPid8Usage("RE", "certified"))).toThrow(
      ProfileDefinitionError,
    );
    expect(() => defineConformanceProfile(withPid8Usage("RE", 42))).toThrow(ProfileDefinitionError);
    expect(() => defineConformanceProfile(withPid8Usage("RE", undefined))).not.toThrow();
  });
});

// ---------------------------------------------------------------------------
// Refuse before echoing, and the PHI floor (AC17 to AC20).
// ---------------------------------------------------------------------------

describe("a refused claim is never the level echoed (AC17 to AC20)", () => {
  it("a defect anywhere in an implementable profile falls the echo back to constrainable", () => {
    // The defect here has nothing to do with the level: a severity token the
    // shape check refuses. The claim was still never verified, because the
    // engine returned diagnostics instead of assessing the message.
    const profile = {
      name: "level-fixture",
      level: "implementable",
      segments: [{ segment: "PID", usage: "R", severity: "fatal" }],
    } as unknown as ConformanceProfile;
    const result = run(profile);
    expect(malformed(result.findings).length).toBeGreaterThan(0);
    expect(result.level).toBe("constrainable");
  });

  it("a result carries a level even when the profile's own NAME cannot be read", () => {
    for (const profile of [null, undefined, 42, "a profile", [], { segments: [] }]) {
      const result = run(profile);
      expect(result.profileName).toBe("(unnamed profile)");
      expect(PROFILE_LEVELS).toContain(result.level);
      expect(result.level).toBe("constrainable");
      expect(result.findings.length).toBeGreaterThan(0);
    }
  });

  it("the engine never throws for any level-shaped value forced through a cast", () => {
    const levels: readonly unknown[] = [
      "implementable",
      "certified",
      42,
      null,
      Symbol("implementable"),
      { toString: (): string => "implementable" },
      [],
    ];
    for (const level of levels) {
      expect(() => run(withPid8Usage("O", level))).not.toThrow();
      expect(() => run(withPid8Usage("RE", level))).not.toThrow();
    }
  });

  it("no defect this gate produces carries a value read from the message", () => {
    const profiles: readonly unknown[] = [
      withPid8Usage("O"),
      withPid8Usage("C(R/O)"),
      withPid8Usage("RE", "certified"),
      withPid8Usage("RE", 42),
      PID8_UNDECLARED,
      withPid3Components([{ component: 1 }]),
    ];
    for (const profile of profiles) {
      const { findings } = run(profile);
      expect(findings.length).toBeGreaterThan(0);
      for (const finding of findings) {
        for (const value of MESSAGE_VALUES) {
          expect(finding.message).not.toContain(value);
        }
      }
    }
  });

  it("the level changes no message check: the same message yields the same findings", () => {
    // One profile the message VIOLATES, run at every level it can be run at.
    // The level decides whether the PROFILE is refused, never what the MESSAGE
    // is found to be, so the message findings are identical at all four.
    const violating = (level?: ProfileLevel): ConformanceProfile => ({
      name: "level-fixture",
      ...(level === undefined ? {} : { level }),
      segments: [
        { segment: "MSH", usage: "R", fields: [{ field: 10, usage: "R" }] },
        {
          segment: "PID",
          usage: "R",
          fields: [
            { field: 3, usage: "R" },
            { field: 8, usage: "RE", valueSet: ["F", "U"] },
            { field: 19, usage: "R" },
          ],
        },
      ],
    });

    const baseline = run(violating()).findings;
    expect(baseline).toHaveLength(2);
    expect(baseline.map((f) => f.code)).toEqual([
      FINDING_CODES.PROFILE_VALUE_NOT_IN_SET,
      FINDING_CODES.PROFILE_REQUIRED_ABSENT,
    ]);
    for (const level of PROFILE_LEVELS) {
      expect(run(violating(level)).findings).toEqual(baseline);
    }
  });
});
