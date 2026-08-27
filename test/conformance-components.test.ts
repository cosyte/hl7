/**
 * Component-level conformance rules: implied cardinality, undeclared content,
 * and the usage/cardinality coherence the HL7 conformance methodology states.
 *
 * Four groups, matching the four things the change is:
 *
 *   - **A component's usage implies its cardinality** (AC1 to AC4). The
 *     methodology associates `[1..1]` with `R`, `[0..1]` with `RE` and `O`, and
 *     `[0..0]` with `X` for components, which a component's lack of a
 *     repetition construct reduces to presence: `R` with nothing there is
 *     required-absent, `X` with something there is not-permitted, `RE` and `O`
 *     constrain nothing.
 *   - **Content in an element the profile never declared is a violation**
 *     (AC5 to AC7), including the methodology's own worked example: data in a
 *     fourth component where the profile defines three.
 *   - **A usage paired with a cardinality the methodology disallows is refused
 *     when the profile is DEFINED** (AC8 to AC12), by both entry points.
 *   - **The unhappy paths and the fail-safe** (AC13, AC14, AC16): garbage
 *     forced through `any` returns findings rather than throwing, and no
 *     finding message ever carries the offending value.
 */

import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import {
  FINDING_CODES,
  ProfileDefinitionError,
  defineConformanceProfile,
  parseHL7,
  validateAgainstProfile,
  type ComponentRule,
  type ConformanceFinding,
  type ConformanceProfile,
  type FindingCode,
} from "../src/index.js";

const FIX = join(import.meta.dirname, "fixtures", "conformance");
const HEAD = "MSH|^~\\&|EPIC|MAIN|LIS|REF|20260419101500||ADT^A01|MSG00001|P|2.5";

/** A message carrying one PID whose PID-3 is exactly `pid3`. */
const withPid3 = (pid3: string): string =>
  [HEAD, `PID|1||${pid3}||Doe^John||19800115|M`].join("\r");

/** Findings for a PID-3 rule carrying `components` (and any other constraint). */
const validate = (
  raw: string,
  components: unknown,
  extra: Record<string, unknown> = {},
): readonly ConformanceFinding[] =>
  validateAgainstProfile(parseHL7(raw), pid3Profile(components, extra)).findings;

/** A one-rule profile on PID-3. Untyped on purpose: the `any`-cast cases reuse it. */
const pid3Profile = (
  components: unknown,
  extra: Record<string, unknown> = {},
): ConformanceProfile =>
  ({
    name: "component-rules",
    segments: [{ segment: "PID", fields: [{ field: 3, components, ...extra }] }],
  }) as unknown as ConformanceProfile;

const codes = (findings: readonly ConformanceFinding[]): readonly FindingCode[] =>
  findings.map((f) => f.code);

/** Declared components 1, 2 and 3: the methodology's worked example, as a rule. */
const FIRST_THREE: readonly ComponentRule[] = [
  { component: 1 },
  { component: 2 },
  { component: 3 },
];

// ---------------------------------------------------------------------------
// A component's usage implies its cardinality (AC1 to AC4).
// ---------------------------------------------------------------------------

describe("a component's usage implies its cardinality (AC1 to AC4)", () => {
  it("R with nothing at that component is exactly one required-absent, and no cardinality finding", () => {
    const findings = validate(withPid3("MRN12345"), [
      { component: 1, usage: "R" },
      { component: 2, usage: "R" },
    ]);
    expect(findings).toHaveLength(1);
    expect(findings[0]?.code).toBe(FINDING_CODES.PROFILE_REQUIRED_ABSENT);
    expect(findings[0]?.severity).toBe("error");
    // The locus names every level the criterion asks for.
    expect(findings[0]?.locus).toEqual({
      segment: "PID",
      field: 3,
      component: 2,
      repetition: 0,
      occurrence: 0,
    });
    expect(codes(findings)).not.toContain(FINDING_CODES.PROFILE_CARDINALITY);
  });

  it("R is satisfied by content in ANY subcomponent, not only the first", () => {
    // `HOSP&1.2.3` puts the component's content in two subcomponents; a check
    // that read only the first would still pass, so the case that matters is
    // content in the SECOND subcomponent alone.
    expect(
      validate(withPid3("MRN12345^&7"), [{ component: 1 }, { component: 2, usage: "R" }]),
    ).toEqual([]);
  });

  it("X with a value at that component is exactly one not-permitted at its locus", () => {
    const findings = validate(withPid3("MRN12345^7"), [
      { component: 1 },
      { component: 2, usage: "X" },
    ]);
    expect(findings).toHaveLength(1);
    expect(findings[0]?.code).toBe(FINDING_CODES.PROFILE_NOT_PERMITTED);
    expect(findings[0]?.locus).toMatchObject({ segment: "PID", field: 3, component: 2 });
  });

  it("X yields NO finding when that component is empty or absent", () => {
    const rules = [{ component: 1 }, { component: 2, usage: "X" }];
    expect(validate(withPid3("MRN12345"), rules), "absent").toEqual([]);
    expect(validate(withPid3("MRN12345^"), rules), "empty").toEqual([]);
    expect(validate(withPid3("MRN12345^&"), rules), "empty subcomponent").toEqual([]);
  });

  it("RE and O constrain nothing when the component is absent or empty", () => {
    for (const usage of ["RE", "O"] as const) {
      for (const pid3 of ["MRN12345", "MRN12345^", "MRN12345^^"]) {
        expect(
          validate(pid3.length > 0 ? withPid3(pid3) : withPid3("MRN12345"), [
            { component: 1 },
            { component: 2, usage },
            { component: 3, usage },
          ]),
          `${usage} against ${pid3}`,
        ).toEqual([]);
      }
    }
  });

  it("a conditional usage on a component is never decided, so its presence is not evaluated", () => {
    // A component rule declares no condition predicate and a caller resolution
    // names a segment plus a field, never a component: nothing can decide one.
    for (const usage of ["C", "CE", "B", "C(R/X)", "C(RE/X)"] as const) {
      expect(
        validate(withPid3("MRN12345"), [{ component: 1 }, { component: 2, usage }]),
        `${usage} absent`,
      ).toEqual([]);
      expect(
        validate(withPid3("MRN12345^7"), [{ component: 1 }, { component: 2, usage }]),
        `${usage} present`,
      ).toEqual([]);
    }
  });

  it("an ABSENT field is judged by its own usage rule alone, with no component finding", () => {
    const absent = [HEAD, "PID|1||||Doe^John||19800115|M"].join("\r");
    // No field usage: the field is optional, so nothing at all fires.
    expect(validate(absent, [{ component: 1, usage: "R" }, { component: 4 }])).toEqual([]);
    // Field usage R: exactly one field-level finding, and its locus carries no
    // component, so it is the FIELD's rule that fired and not a component's.
    const required = validate(absent, [{ component: 1, usage: "R" }], { usage: "R" });
    expect(required).toHaveLength(1);
    expect(required[0]?.code).toBe(FINDING_CODES.PROFILE_REQUIRED_ABSENT);
    expect(required[0]?.locus.component).toBeUndefined();
  });

  it("an EMPTY repetition inside a present field yields no component finding", () => {
    // `A~~B`: the middle repetition carries nothing, so every component
    // question it could answer is answered by its emptiness.
    const findings = validate(withPid3("MRN12345~~MRN12345"), [{ component: 1, usage: "R" }]);
    expect(findings).toEqual([]);
  });

  it("a component rule inherits its field rule's severity and may override it", () => {
    const inherited = validate(withPid3("MRN12345"), [{ component: 2, usage: "R" }], {
      severity: "warning",
    });
    expect(inherited[0]?.severity).toBe("warning");
    const overridden = validate(
      withPid3("MRN12345"),
      [{ component: 2, usage: "R", severity: "info" }],
      { severity: "warning" },
    );
    expect(overridden[0]?.severity).toBe("info");
  });
});

// ---------------------------------------------------------------------------
// Content in an element the profile never declared (AC5, AC6).
// ---------------------------------------------------------------------------

describe("content at an undeclared component is a typed finding (AC5, AC6)", () => {
  it("PROFILE_UNDECLARED_CONTENT is a member of the exported finding-code registry", () => {
    expect(FINDING_CODES.PROFILE_UNDECLARED_CONTENT).toBe("PROFILE_UNDECLARED_CONTENT");
    expect(Object.values(FINDING_CODES)).toContain("PROFILE_UNDECLARED_CONTENT");
  });

  it("the registry still narrows exhaustively with the new member in it", () => {
    // No `default` arm and a declared return type, so this function only
    // compiles while every member of the union is handled. A consumer's
    // exhaustive switch is the surface the new code breaks, so it is pinned.
    const describeCode = (code: FindingCode): string => {
      switch (code) {
        case "PROFILE_REQUIRED_ABSENT":
          return "required";
        case "PROFILE_NOT_PERMITTED":
          return "not permitted";
        case "PROFILE_CARDINALITY":
          return "cardinality";
        case "PROFILE_LENGTH":
          return "length";
        case "PROFILE_VALUE_NOT_IN_SET":
          return "value set";
        case "PROFILE_CONDITION_UNEVALUATABLE":
          return "undecided";
        case "PROFILE_CODING_SYSTEM_MISMATCH":
          return "coding system";
        case "PROFILE_UNDECLARED_CONTENT":
          return "undeclared";
        case "PROFILE_MALFORMED":
          return "malformed";
      }
    };
    expect(Object.values(FINDING_CODES).map(describeCode)).toContain("undeclared");
  });

  it("the methodology's worked example: a fourth component where the profile declares three", () => {
    const raw = readFileSync(join(FIX, "adt-undeclared-component.hl7"), "utf8");
    const findings = validateAgainstProfile(parseHL7(raw), pid3Profile(FIRST_THREE)).findings;
    expect(findings).toHaveLength(1);
    expect(findings[0]?.code).toBe(FINDING_CODES.PROFILE_UNDECLARED_CONTENT);
    expect(findings[0]?.locus.component).toBe(4);
    expect(findings[0]?.locus).toEqual({
      segment: "PID",
      field: 3,
      component: 4,
      repetition: 0,
      occurrence: 0,
    });
  });

  it("one finding per undeclared component index, in ascending order", () => {
    // Components 4 and 5 both carry content against a rule declaring 1 to 3.
    const findings = validate(withPid3("MRN12345^^^HOSP^MR"), FIRST_THREE);
    expect(codes(findings)).toEqual([
      FINDING_CODES.PROFILE_UNDECLARED_CONTENT,
      FINDING_CODES.PROFILE_UNDECLARED_CONTENT,
    ]);
    expect(findings.map((f) => f.locus.component)).toEqual([4, 5]);
  });

  it("one finding per undeclared index PER REPETITION", () => {
    const findings = validate(withPid3("MRN12345^^^HOSP~MRN12345^^^HOSP"), FIRST_THREE);
    expect(findings).toHaveLength(2);
    expect(findings.map((f) => f.locus.repetition)).toEqual([0, 1]);
    for (const f of findings) expect(f.locus.component).toBe(4);
  });

  it("one finding per undeclared index PER SEGMENT OCCURRENCE", () => {
    const raw = [HEAD, "OBX|1|NM|WBC^^LN^extra||7.5", "OBX|2|NM|RBC^^LN^extra||4.2"].join("\r");
    const profile = {
      name: "obx-components",
      segments: [{ segment: "OBX", fields: [{ field: 3, components: FIRST_THREE }] }],
    } as unknown as ConformanceProfile;
    const findings = validateAgainstProfile(parseHL7(raw), profile).findings;
    expect(findings).toHaveLength(2);
    expect(findings.map((f) => f.locus.occurrence)).toEqual([0, 1]);
  });

  it("an EMPTY undeclared component is not content, so nothing fires", () => {
    // Trailing separators reach component 5 and none of them carries anything.
    expect(validate(withPid3("MRN12345^^^^"), FIRST_THREE)).toEqual([]);
    expect(validate(withPid3("MRN12345^^^&"), FIRST_THREE)).toEqual([]);
  });

  it("declaring an index without constraining it still closes the set at that index", () => {
    // Component 4 is declared with no usage at all: Optional, never refused,
    // and no longer undeclared. Component 5 is what is left over.
    const findings = validate(withPid3("MRN12345^^^HOSP^MR"), [...FIRST_THREE, { component: 4 }]);
    expect(findings).toHaveLength(1);
    expect(findings[0]?.locus.component).toBe(5);
  });

  it("a declared component may sit BEYOND the content, and nothing fires for it", () => {
    expect(validate(withPid3("MRN12345"), [...FIRST_THREE, { component: 9, usage: "O" }])).toEqual(
      [],
    );
  });

  it("undeclared content and a declared component's own usage both fire, independently", () => {
    const findings = validate(withPid3("MRN12345^^^HOSP"), [
      { component: 1 },
      { component: 2, usage: "R" },
      { component: 3 },
    ]);
    expect(codes(findings)).toEqual([
      FINDING_CODES.PROFILE_REQUIRED_ABSENT,
      FINDING_CODES.PROFILE_UNDECLARED_CONTENT,
    ]);
  });

  it("a field the profile marks not-permitted is not ALSO walked for components", () => {
    const findings = validate(withPid3("MRN12345^^^HOSP"), FIRST_THREE, { usage: "X" });
    expect(codes(findings)).toEqual([FINDING_CODES.PROFILE_NOT_PERMITTED]);
  });
});

// ---------------------------------------------------------------------------
// Usage/cardinality coherence, refused when the profile is DEFINED
// (AC8 to AC12).
// ---------------------------------------------------------------------------

/** A profile carrying one rule, at segment level or field level, for the coherence cases. */
const coherenceProfiles = (rule: Record<string, unknown>): readonly ConformanceProfile[] => {
  const shapes: readonly unknown[] = [
    { name: "segment-rule", segments: [{ segment: "PID", ...rule }] },
    { name: "field-rule", segments: [{ segment: "PID", fields: [{ field: 3, ...rule }] }] },
  ];
  return shapes as readonly ConformanceProfile[];
};

/** Both routes agree that `rule` is malformed: findings from one, a throw from the other. */
const expectRefused = (rule: Record<string, unknown>, label: string): void => {
  for (const profile of coherenceProfiles(rule)) {
    const { findings } = validateAgainstProfile(parseHL7(withPid3("MRN12345")), profile);
    expect(findings.length, `${label} via ${profile.name}`).toBeGreaterThan(0);
    expect(
      findings.every((f) => f.code === FINDING_CODES.PROFILE_MALFORMED),
      `${label} via ${profile.name}`,
    ).toBe(true);
    expect(() => defineConformanceProfile(profile), label).toThrow(ProfileDefinitionError);
  }
};

/** Both routes accept `rule`: no malformed finding, and no throw. */
const expectAccepted = (rule: Record<string, unknown>, label: string): void => {
  for (const profile of coherenceProfiles(rule)) {
    const { findings } = validateAgainstProfile(parseHL7(withPid3("MRN12345")), profile);
    expect(codes(findings), `${label} via ${profile.name}`).not.toContain(
      FINDING_CODES.PROFILE_MALFORMED,
    );
    expect(() => defineConformanceProfile(profile), label).not.toThrow();
  }
};

describe("usage paired with a cardinality the methodology disallows (AC8 to AC11)", () => {
  it("R with cardinality.min 0 is refused by both routes", () => {
    expectRefused({ usage: "R", cardinality: { min: 0 } }, "R min 0");
    expectRefused({ usage: "R", cardinality: { min: 0, max: 1 } }, "R [0..1]");
  });

  it("R with min 1 or more, or with no min at all, is accepted", () => {
    expectAccepted({ usage: "R", cardinality: { min: 1, max: 1 } }, "R [1..1]");
    expectAccepted({ usage: "R", cardinality: { min: 3, max: 5 } }, "R [3..5]");
    expectAccepted({ usage: "R", cardinality: { max: 2 } }, "R max only");
    expectAccepted({ usage: "R" }, "R with no cardinality");
  });

  it("a usage other than R or RE with cardinality.min above 0 is refused by both routes", () => {
    for (const usage of ["C", "CE", "O", "X", "B", "C(R/X)", "C(RE/X)"]) {
      expectRefused({ usage, cardinality: { min: 1, max: 5 } }, `${usage} min 1`);
    }
  });

  it("RE with a minimum above 0 is ACCEPTED: the methodology's one documented exception", () => {
    expectAccepted({ usage: "RE", cardinality: { min: 3, max: 5 } }, "RE [3..5]");
    expectAccepted({ usage: "RE", cardinality: { min: 1, max: 1 } }, "RE [1..1]");
    expectAccepted({ usage: "RE", cardinality: { min: 0, max: 1 } }, "RE [0..1]");
  });

  it("X with any maximum other than 0 is refused by both routes", () => {
    expectRefused({ usage: "X", cardinality: { max: 1 } }, "X max 1");
    expectRefused({ usage: "X", cardinality: { max: 5 } }, "X max 5");
    expectRefused({ usage: "X", cardinality: { max: "*" } }, "X unbounded");
  });

  it("X with no cardinality at all, or a maximum of 0, is accepted", () => {
    expectAccepted({ usage: "X" }, "X bare");
    expectAccepted({ usage: "X", cardinality: { max: 0 } }, "X [..0]");
    expectAccepted({ usage: "X", cardinality: { min: 0, max: 0 } }, "X [0..0]");
  });

  it("a rule that declares NO usage is never refused for its cardinality", () => {
    expectAccepted({ cardinality: { min: 1, max: 2 } }, "no usage, min 1");
    expectAccepted({ cardinality: { min: 0, max: 0 } }, "no usage, [0..0]");
  });

  it("X paired with BOTH a positive minimum and a non-zero maximum reports each constraint", () => {
    const profile = coherenceProfiles({ usage: "X", cardinality: { min: 1, max: 1 } })[1];
    const { findings } = validateAgainstProfile(
      parseHL7(withPid3("MRN12345")),
      profile as ConformanceProfile,
    );
    expect(findings).toHaveLength(2);
    expect(findings[0]?.message).toContain("minimum cardinality of 0");
    expect(findings[1]?.message).toContain("[0..0]");
  });

  it("a malformed pairing stops the message being evaluated at all", () => {
    // The second rule WOULD fire on this message, so a result carrying only
    // malformed findings is the observable difference between "reported the
    // defect" and "validated against a profile it could not trust".
    const profile = {
      name: "stops",
      segments: [
        { segment: "PID", fields: [{ field: 3, usage: "R", cardinality: { min: 0 } }] },
        { segment: "PID", fields: [{ field: 99, usage: "R" }] },
      ],
    } as unknown as ConformanceProfile;
    const { findings } = validateAgainstProfile(parseHL7(withPid3("MRN12345")), profile);
    expect(codes(findings)).toEqual([FINDING_CODES.PROFILE_MALFORMED]);
  });

  it("a defect detail names the rule's position and carries nothing from the message", () => {
    const { findings } = validateAgainstProfile(
      parseHL7(withPid3("MRN12345")),
      coherenceProfiles({ usage: "R", cardinality: { min: 0 } })[1] as ConformanceProfile,
    );
    expect(findings[0]?.message).toContain('segment "PID" field 3');
    expect(findings[0]?.locus).toMatchObject({ segment: "PID", field: 3 });
    expect(findings[0]?.message).not.toContain("MRN12345");
  });
});

describe("a component's cardinality may not be declared (AC12)", () => {
  it("an explicit cardinality on a component rule is refused, and says why", () => {
    const profile = pid3Profile([{ component: 1, usage: "R", cardinality: { min: 1, max: 1 } }]);
    const { findings } = validateAgainstProfile(parseHL7(withPid3("MRN12345")), profile);
    expect(findings).toHaveLength(1);
    expect(findings[0]?.code).toBe(FINDING_CODES.PROFILE_MALFORMED);
    expect(findings[0]?.message).toContain("cardinality is implied by its usage");
    expect(findings[0]?.locus).toMatchObject({ segment: "PID", field: 3, component: 1 });
    expect(() => defineConformanceProfile(profile)).toThrow(ProfileDefinitionError);
  });

  it("a cardinality of `[0..0]`, which a component's X usage implies anyway, is still refused", () => {
    const findings = validate(withPid3("MRN12345"), [
      { component: 1, usage: "X", cardinality: { min: 0, max: 0 } },
    ]);
    expect(codes(findings)).toEqual([FINDING_CODES.PROFILE_MALFORMED]);
  });
});

// ---------------------------------------------------------------------------
// The unhappy paths and the fail-safe (AC13, AC14).
// ---------------------------------------------------------------------------

describe("a malformed component rule is reported, never thrown (AC13, AC14)", () => {
  /** Every finding is a malformed diagnostic, and nothing threw getting here. */
  const expectOnlyMalformed = (
    components: unknown,
    label: string,
  ): readonly ConformanceFinding[] => {
    const msg = parseHL7(withPid3("MRN12345^^^HOSP"));
    const profile = pid3Profile(components);
    expect(() => validateAgainstProfile(msg, profile), label).not.toThrow();
    const { findings } = validateAgainstProfile(msg, profile);
    expect(findings.length, label).toBeGreaterThan(0);
    expect(
      findings.every((f) => f.code === FINDING_CODES.PROFILE_MALFORMED),
      label,
    ).toBe(true);
    return findings;
  };

  it("a component index that is not a positive integer is refused", () => {
    for (const index of [0, -1, 1.5, "1", null, undefined, Number.NaN]) {
      const findings = expectOnlyMalformed([{ component: index }], `index ${String(index)}`);
      expect(findings[0]?.message).toContain("components[0].component");
    }
  });

  it("a duplicate component index is refused rather than merged last-wins", () => {
    const findings = expectOnlyMalformed(
      [
        { component: 2, usage: "R" },
        { component: 2, usage: "X" },
      ],
      "duplicate index",
    );
    expect(findings[0]?.message).toContain("components[1]");
    expect(findings[0]?.message).toContain("already declares");
  });

  it("a usage token the engine does not recognize is refused", () => {
    for (const usage of ["RQ", "r", "C(a/b)", "C(R/Q)", " R", 7, null]) {
      expectOnlyMalformed([{ component: 1, usage }], `usage ${String(usage)}`);
    }
  });

  it("a component rule that is not an object at all is refused", () => {
    for (const entry of [null, "component 1", 3, true, [], undefined]) {
      const findings = expectOnlyMalformed([entry], `entry ${String(entry)}`);
      expect(findings[0]?.message).toContain("components[0] must be an object");
    }
  });

  it("`components` that is not an array is refused, whatever it is", () => {
    const notArrays: readonly [unknown, string][] = [
      ["1,2,3", "string"],
      [null, "null"],
      [4, "number"],
      [true, "boolean"],
      [{ component: 1 }, "a lone rule object"],
    ];
    for (const [components, label] of notArrays) {
      const findings = expectOnlyMalformed(components, `components as ${label}`);
      expect(findings[0]?.message).toContain("components must be an array");
    }
  });

  it("an array of nulls is one defect per entry, and still never throws", () => {
    const findings = expectOnlyMalformed([null, null, null], "array of nulls");
    expect(findings).toHaveLength(3);
  });

  it("an omitted `components` is not a declaration, so nothing is refused", () => {
    const profile = {
      name: "no-components",
      segments: [{ segment: "PID", fields: [{ field: 3, components: undefined }] }],
    } as unknown as ConformanceProfile;
    expect(validateAgainstProfile(parseHL7(withPid3("MRN12345^^^HOSP")), profile).findings).toEqual(
      [],
    );
    expect(() => defineConformanceProfile(profile)).not.toThrow();
  });

  it("`defineConformanceProfile` throws while the engine returns, for the same profile", () => {
    const profile = pid3Profile([{ component: 0 }]);
    expect(() => defineConformanceProfile(profile)).toThrow(ProfileDefinitionError);
    expect(() =>
      validateAgainstProfile(parseHL7(withPid3("MRN12345^^^HOSP")), profile),
    ).not.toThrow();
  });
});

// ---------------------------------------------------------------------------
// The PHI invariant (AC16).
// ---------------------------------------------------------------------------

describe("no finding this change introduces ever carries the offending value (AC16)", () => {
  // "ZQV" cannot occur inside the finding vocabulary, so a hit is a genuine
  // leak rather than a coincidental substring of English prose. The same
  // sentinel discipline the generative PHI check uses.
  const SECRET = "ZQVSECRET";

  it("an undeclared component's content is never in the finding message", () => {
    const findings = validate(withPid3(`MRN12345^^^${SECRET}`), FIRST_THREE);
    expect(findings).toHaveLength(1);
    for (const f of findings) {
      expect(f.message).not.toContain(SECRET);
      // Not a substring of it either: a truncated echo is still an echo.
      for (let n = 3; n <= SECRET.length; n++) expect(f.message).not.toContain(SECRET.slice(0, n));
    }
    // What it DOES carry: the structural locus and a count of declared components.
    expect(findings[0]?.message).toContain("PID-3 rep 0 component 4");
    expect(findings[0]?.message).toContain("3 component(s)");
  });

  it("a not-permitted component's content is never in the finding message", () => {
    const findings = validate(withPid3(`MRN12345^${SECRET}`), [
      { component: 1 },
      { component: 2, usage: "X" },
    ]);
    expect(findings).toHaveLength(1);
    expect(findings[0]?.message).not.toContain(SECRET);
    expect(findings[0]?.message).toContain("component 2");
  });

  it("a PROFILE_MALFORMED detail carries no message content either", () => {
    const findings = validate(withPid3(`MRN12345^${SECRET}`), [{ component: -1 }]);
    expect(findings).toHaveLength(1);
    for (const f of findings) expect(f.message).not.toContain(SECRET);
  });

  it("every finding message across the whole surface is free of the sentinel", () => {
    const findings = validate(withPid3(`${SECRET}^${SECRET}^${SECRET}^${SECRET}`), [
      { component: 1, usage: "X" },
      { component: 2, usage: "R" },
      { component: 3, usage: "RE" },
    ]);
    expect(findings.length).toBeGreaterThan(0);
    for (const f of findings) expect(f.message).not.toContain(SECRET);
  });

  it("validation never mutates the message it walked", () => {
    const msg = parseHL7(withPid3("MRN12345^^^HOSP"));
    const before = msg.toString();
    validateAgainstProfile(msg, pid3Profile(FIRST_THREE));
    expect(msg.toString()).toBe(before);
  });
});

describe("undeclared component content is a CONFORMANCE finding, never a parse one (AC15)", () => {
  it("the parser is untouched: same round trip, no warning, whatever the profile says later", () => {
    const raw = readFileSync(join(FIX, "adt-undeclared-component.hl7"), "utf8");
    const msg = parseHL7(raw);
    // Parsing is decided before any profile exists, so the fourth component is
    // ordinary content to the parser: a byte-faithful round trip, and exactly
    // the warnings the same message carries WITHOUT that component. Compared
    // against the counterfactual rather than against an empty list, because
    // this fixture carries an unrelated structural warning either way and an
    // empty-list assertion would be measuring that instead.
    // `warning-codes.snapshot.test.ts` pins the code sets themselves.
    const withoutFourth = parseHL7(raw.replace("MRN12345^^^HOSP", "MRN12345"));
    expect(msg.warnings.map((w) => w.code)).toEqual(withoutFourth.warnings.map((w) => w.code));
    // The fourth component is in the tree, decoded, exactly as it always was.
    const pid3 = msg.segments("PID")[0]?.field(3);
    expect(pid3?.repetitions[0]?.components).toHaveLength(4);
    expect(pid3?.repetitions[0]?.components[3]?.subcomponents[0]).toBe("HOSP");
    // The SAME message against the SAME parse is a conformance finding only
    // once a profile closes the component set.
    expect(validateAgainstProfile(msg, pid3Profile(undefined)).findings).toEqual([]);
    expect(codes(validateAgainstProfile(msg, pid3Profile(FIRST_THREE)).findings)).toEqual([
      FINDING_CODES.PROFILE_UNDECLARED_CONTENT,
    ]);
  });
});
