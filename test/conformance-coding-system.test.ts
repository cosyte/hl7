/**
 * A field rule may bind its value set to the coding system its codes must be
 * drawn from, and the engine then compares the message's own coding-system
 * component against that binding.
 *
 * The case these tests exist for is the one the bare value-set check cannot
 * see: a well-formed, permitted-looking code carried under the WRONG coding
 * system. Before the binding that message validated clean, which is a false
 * negative on the results path. So the assertions below are mostly about
 * telling two answers apart:
 *
 *   - `PROFILE_VALUE_NOT_IN_SET`: "we do not accept this code."
 *   - `PROFILE_CODING_SYSTEM_MISMATCH`: "this code may be fine, but it did not
 *     come from the system we bound the set to."
 *
 * Every fixture here is synthetic: invented codes and identifiers on invented
 * patients, never a real feed's content.
 */

import { describe, expect, it } from "vitest";

import {
  FINDING_CODES,
  ProfileDefinitionError,
  defineConformanceProfile,
  parseHL7,
  validateAgainstProfile,
  type ConformanceProfile,
  type FieldRule,
} from "../src/index.js";

const HEAD = "MSH|^~\\&|LAB|MAIN|EHR|REF|20260101||ORU^R01|MSG1|P|2.5";

/** One synthetic ORU carrying the given OBX-3 (a CWE), plus a result value. */
const oru = (obx3: string, obx5 = "7.5"): string =>
  [HEAD, "PID|1||MRN9^^^H^MR||Doe^John||19800101|M", `OBX|1|NM|${obx3}||${obx5}`].join("\r");

/** A one-rule profile over OBX-3. */
const profileFor = (rule: Omit<FieldRule, "field">, field = 3): ConformanceProfile => ({
  name: "coding-system-probe",
  segments: [{ segment: "OBX", fields: [{ field, ...rule }] }],
});

/** The value set every primary-triplet probe below binds. */
const CBC_CODES = ["WBC", "RBC"] as const;

/** Bind `WBC`/`RBC` to LOINC on OBX-3, primary triplet, all defaults. */
const LOINC_BOUND = profileFor({ valueSet: [...CBC_CODES], codingSystem: "LN" });

const run = (obx3: string, profile: ConformanceProfile = LOINC_BOUND): readonly string[] =>
  validateAgainstProfile(parseHL7(oru(obx3)), profile).findings.map((f) => f.code);

describe("coding-system binding: the mismatch is its own finding", () => {
  it("a permitted code under a DIFFERENT registered system is exactly one typed finding", () => {
    const { findings } = validateAgainstProfile(
      parseHL7(oru("WBC^White Blood Cells^SCT")),
      LOINC_BOUND,
    );
    expect(findings).toHaveLength(1);
    const [f] = findings;
    expect(f?.code).toBe(FINDING_CODES.PROFILE_CODING_SYSTEM_MISMATCH);
    expect(f?.code).not.toBe(FINDING_CODES.PROFILE_VALUE_NOT_IN_SET);
    expect(f?.severity).toBe("error");
  });

  it("the code is published in the finding-code registry", () => {
    expect(FINDING_CODES.PROFILE_CODING_SYSTEM_MISMATCH).toBe("PROFILE_CODING_SYSTEM_MISMATCH");
    expect(Object.values(FINDING_CODES)).toContain("PROFILE_CODING_SYSTEM_MISMATCH");
  });

  it("it takes the rule's declared severity", () => {
    const warn = profileFor({
      valueSet: [...CBC_CODES],
      codingSystem: "LN",
      severity: "warning",
    });
    const { findings } = validateAgainstProfile(parseHL7(oru("WBC^^SCT")), warn);
    expect(findings).toHaveLength(1);
    expect(findings[0]?.severity).toBe("warning");
  });

  it("it fires per repetition, and only for the repetitions that are wrong", () => {
    const { findings } = validateAgainstProfile(
      parseHL7(oru("WBC^White^SCT~RBC^Red^LN")),
      LOINC_BOUND,
    );
    expect(findings).toHaveLength(1);
    expect(findings[0]?.code).toBe(FINDING_CODES.PROFILE_CODING_SYSTEM_MISMATCH);
    expect(findings[0]?.locus.repetition).toBe(0);
  });

  it("it fires per segment occurrence, naming the occurrence", () => {
    const raw = [
      HEAD,
      "OBX|1|NM|WBC^White^LN||7.5",
      "OBX|2|NM|RBC^Red^SCT||4.2",
      "OBX|3|NM|WBC^White^SCT||7.5",
    ].join("\r");
    const { findings } = validateAgainstProfile(parseHL7(raw), LOINC_BOUND);
    expect(findings.map((f) => f.locus.occurrence)).toEqual([1, 2]);
    expect(findings.every((f) => f.code === FINDING_CODES.PROFILE_CODING_SYSTEM_MISMATCH)).toBe(
      true,
    );
  });

  it("an unrecognized claim in the MESSAGE is a mismatch, never a pass", () => {
    // The fail-safe direction: a system this library cannot resolve is not the
    // system the profile bound, so it is reported rather than waved through.
    expect(run("WBC^White^99LOCAL")).toEqual([FINDING_CODES.PROFILE_CODING_SYSTEM_MISMATCH]);
  });
});

describe("coding-system binding: comparison is by resolved identity", () => {
  it.each([
    ["the registered acronym itself", "LN"],
    ["a recognized alias", "LOINC"],
    ["a lowercase alias", "loinc"],
    ["mixed case", "LoInC"],
    ["a lowercase acronym", "ln"],
    ["surrounding whitespace", " LN "],
    ["an alias with whitespace", "  loinc  "],
  ])("%s matches a binding of LN, with no finding", (_label, claimed) => {
    expect(run(`WBC^White^${claimed}`)).toEqual([]);
  });

  it("the BINDING may itself be written as an alias", () => {
    const boundByAlias = profileFor({ valueSet: [...CBC_CODES], codingSystem: "loinc" });
    expect(run("WBC^White^LN", boundByAlias)).toEqual([]);
    expect(run("WBC^White^SCT", boundByAlias)).toEqual([
      FINDING_CODES.PROFILE_CODING_SYSTEM_MISMATCH,
    ]);
  });

  it("two aliases of DIFFERENT systems still mismatch", () => {
    const snomedBound = profileFor({ valueSet: ["12345"], codingSystem: "SNOMED" });
    expect(run("12345^Finding^SCT", snomedBound)).toEqual([]);
    expect(run("12345^Finding^LOINC", snomedBound)).toEqual([
      FINDING_CODES.PROFILE_CODING_SYSTEM_MISMATCH,
    ]);
  });
});

describe("coding-system binding: independent of the membership check", () => {
  it("a permitted code under the wrong system emits the coding-system finding and NO value-set finding", () => {
    const codes = run("WBC^White^SCT");
    expect(codes).toEqual([FINDING_CODES.PROFILE_CODING_SYSTEM_MISMATCH]);
    expect(codes).not.toContain(FINDING_CODES.PROFILE_VALUE_NOT_IN_SET);
  });

  it("an unknown code under the RIGHT system emits only the value-set finding", () => {
    expect(run("XYZ^Mystery^LN")).toEqual([FINDING_CODES.PROFILE_VALUE_NOT_IN_SET]);
  });

  it("wrong on both counts emits exactly one of each", () => {
    const codes = run("XYZ^Mystery^SCT");
    expect(codes).toHaveLength(2);
    expect(codes.filter((c) => c === FINDING_CODES.PROFILE_VALUE_NOT_IN_SET)).toHaveLength(1);
    expect(codes.filter((c) => c === FINDING_CODES.PROFILE_CODING_SYSTEM_MISMATCH)).toHaveLength(1);
  });

  it("a length rule on the same locus still fires on its own merits", () => {
    const withLength = profileFor({ valueSet: ["WBC"], codingSystem: "LN", length: 2 });
    expect(run("WBC^White^SCT", withLength)).toEqual([
      FINDING_CODES.PROFILE_LENGTH,
      FINDING_CODES.PROFILE_CODING_SYSTEM_MISMATCH,
    ]);
  });
});

describe("coding-system binding: which component carries the system", () => {
  it("with nothing declared it reads two positions after the checked component", () => {
    // Code at component 1 implies system at component 3.
    const { findings } = validateAgainstProfile(parseHL7(oru("WBC^White^SCT")), LOINC_BOUND);
    expect(findings[0]?.locus.component).toBe(3);
  });

  it("the alternate triplet is reached by moving the checked component alone", () => {
    // Alternate code at component 4 implies alternate system at component 6.
    const alt = profileFor({ component: 4, valueSet: ["ALT1"], codingSystem: "SCT" });
    const both = "WBC^White^LN^ALT1^Alternate^SCT";
    expect(run(both, alt)).toEqual([]);

    const altWrong = profileFor({ component: 4, valueSet: ["ALT1"], codingSystem: "LN" });
    const { findings } = validateAgainstProfile(parseHL7(oru(both)), altWrong);
    expect(findings).toHaveLength(1);
    expect(findings[0]?.code).toBe(FINDING_CODES.PROFILE_CODING_SYSTEM_MISMATCH);
    expect(findings[0]?.locus.component).toBe(6);
  });

  it("an explicitly declared component is read instead of the default", () => {
    // The default would read component 3 (LN) and mismatch; the declaration
    // sends it to component 6 (SCT), which matches.
    const declared = profileFor({
      valueSet: ["WBC"],
      codingSystem: "SCT",
      codingSystemComponent: 6,
    });
    const both = "WBC^White^LN^ALT1^Alternate^SCT";
    expect(run(both, declared)).toEqual([]);

    const defaulted = profileFor({ valueSet: ["WBC"], codingSystem: "SCT" });
    const { findings } = validateAgainstProfile(parseHL7(oru(both)), defaulted);
    expect(findings).toHaveLength(1);
    expect(findings[0]?.locus.component).toBe(3);
  });

  it("both triplets are checked by declaring two rules on the same field", () => {
    const twoRules: ConformanceProfile = {
      name: "both-triplets",
      segments: [
        {
          segment: "OBX",
          fields: [
            { field: 3, valueSet: ["WBC"], codingSystem: "LN" },
            { field: 3, component: 4, valueSet: ["ALT1"], codingSystem: "SCT" },
          ],
        },
      ],
    };
    expect(run("WBC^White^LN^ALT1^Alternate^SCT", twoRules)).toEqual([]);
    const { findings } = validateAgainstProfile(
      parseHL7(oru("WBC^White^SCT^ALT1^Alternate^LN")),
      twoRules,
    );
    expect(findings).toHaveLength(2);
    expect(findings.map((f) => f.locus.component)).toEqual([3, 6]);
  });
});

describe("coding-system binding: an absent or blank claim is a finding, never a pass", () => {
  it("a repetition carrying NO coding-system component at all is reported", () => {
    expect(run("WBC^White Blood Cells")).toEqual([FINDING_CODES.PROFILE_CODING_SYSTEM_MISMATCH]);
  });

  it("a bare code with no components after it is reported", () => {
    expect(run("WBC")).toEqual([FINDING_CODES.PROFILE_CODING_SYSTEM_MISMATCH]);
  });

  it.each([
    ["present but empty", "WBC^White^"],
    ["whitespace only", "WBC^White^   "],
    ["a tab", "WBC^White^\t"],
  ])("a %s coding-system component is the same code, exactly once", (_label, obx3) => {
    const { findings } = validateAgainstProfile(parseHL7(oru(obx3)), LOINC_BOUND);
    expect(findings).toHaveLength(1);
    expect(findings[0]?.code).toBe(FINDING_CODES.PROFILE_CODING_SYSTEM_MISMATCH);
  });

  it("an EMPTY repetition beside a valued one is not reported", () => {
    // An empty repetition claims no code, so it has no provenance to be wrong
    // about. Only the valued one is judged.
    const { findings } = validateAgainstProfile(parseHL7(oru("~WBC^White^SCT")), LOINC_BOUND);
    expect(findings).toHaveLength(1);
    expect(findings[0]?.locus.repetition).toBe(1);
  });
});

describe("coding-system binding: the finding names the expectation and the locus, and nothing else", () => {
  it("it carries the expected identifier and the full structural locus", () => {
    const raw = [HEAD, "OBX|1|NM|WBC^White^LN||7.5", "OBX|2|NM|WBC^White^SCT||7.5"].join("\r");
    const { findings } = validateAgainstProfile(parseHL7(raw), LOINC_BOUND);
    expect(findings).toHaveLength(1);
    const [f] = findings;
    expect(f?.locus).toEqual({
      segment: "OBX",
      field: 3,
      component: 3,
      repetition: 0,
      occurrence: 1,
    });
    expect(f?.message).toContain("LN");
    expect(f?.message).toContain("OBX");
  });

  it("the expected identifier is the RESOLVED acronym, whatever spelling the author bound", () => {
    const boundByAlias = profileFor({ valueSet: [...CBC_CODES], codingSystem: "  loinc  " });
    const { findings } = validateAgainstProfile(parseHL7(oru("WBC^White^SCT")), boundByAlias);
    expect(findings[0]?.message).toContain("LN");
    expect(findings[0]?.message).not.toContain("loinc");
  });

  it("it never carries the offending claim, nor any other value from the message", () => {
    const secret = "ZQVSYSTEM";
    const { findings } = validateAgainstProfile(
      parseHL7(oru(`ZQVCODE^ZQVTEXT^${secret}`, "ZQVRESULT")),
      LOINC_BOUND,
    );
    expect(findings.length).toBeGreaterThan(0);
    for (const f of findings) {
      expect(f.message).not.toContain(secret);
      expect(f.message).not.toContain("ZQVCODE");
      expect(f.message).not.toContain("ZQVTEXT");
      expect(f.message).not.toContain("ZQVRESULT");
      expect(JSON.stringify(f)).not.toContain("ZQV");
    }
  });
});

describe("coding-system binding: the field's own usage still decides presence", () => {
  const bindOn = (rule: Omit<FieldRule, "field">): ConformanceProfile => profileFor(rule, 5);

  it("an ABSENT Required field is only PROFILE_REQUIRED_ABSENT", () => {
    const raw = [HEAD, "OBX|1|NM|WBC^White^LN"].join("\r");
    const { findings } = validateAgainstProfile(
      parseHL7(raw),
      bindOn({ usage: "R", valueSet: ["7.5"], codingSystem: "LN" }),
    );
    expect(findings).toHaveLength(1);
    expect(findings[0]?.code).toBe(FINDING_CODES.PROFILE_REQUIRED_ABSENT);
  });

  it("a PRESENT BUT EMPTY Required field is only PROFILE_REQUIRED_ABSENT", () => {
    const { findings } = validateAgainstProfile(
      parseHL7(oru("WBC^White^LN", "")),
      bindOn({ usage: "R", valueSet: ["7.5"], codingSystem: "LN" }),
    );
    expect(findings).toHaveLength(1);
    expect(findings[0]?.code).toBe(FINDING_CODES.PROFILE_REQUIRED_ABSENT);
  });

  it.each(["RE", "O", "C", "CE", "B"] as const)(
    "an absent %s field yields nothing at all",
    (usage) => {
      const raw = [HEAD, "OBX|1|NM|WBC^White^LN"].join("\r");
      const { findings } = validateAgainstProfile(
        parseHL7(raw),
        bindOn({ usage, valueSet: ["7.5"], codingSystem: "LN" }),
      );
      expect(findings).toEqual([]);
    },
  );

  it("a NOT-PERMITTED field present is only PROFILE_NOT_PERMITTED", () => {
    const { findings } = validateAgainstProfile(
      parseHL7(oru("WBC^White^SCT")),
      profileFor({ usage: "X", valueSet: [...CBC_CODES], codingSystem: "LN" }),
    );
    expect(findings).toHaveLength(1);
    expect(findings[0]?.code).toBe(FINDING_CODES.PROFILE_NOT_PERMITTED);
  });
});

describe("coding-system binding: an unrecognized identifier is refused when the profile is DEFINED", () => {
  /** A profile whose OTHER rule would certainly fire, so "no message-level finding" means something. */
  const withUnrecognized = (codingSystem: unknown): unknown => ({
    name: "unrecognized-binding",
    segments: [
      {
        segment: "OBX",
        fields: [
          { field: 3, valueSet: ["WBC"], codingSystem },
          { field: 99, usage: "R" },
        ],
      },
    ],
  });

  it("defineConformanceProfile throws the typed profile-definition error", () => {
    expect(() => defineConformanceProfile(withUnrecognized("ZZZ"))).toThrow(ProfileDefinitionError);
  });

  it("the error names the identifier and says the LIBRARY does not recognize it", () => {
    let message = "";
    try {
      defineConformanceProfile(withUnrecognized("ZZZ"));
    } catch (err) {
      message = err instanceof Error ? err.message : "";
    }
    expect(message).toContain("ZZZ");
    expect(message).toContain("this library recognizes");
    // The recognition oracle is a deliberate subset, so the refusal must not
    // claim the identifier is absent from the published registry.
    expect(message).not.toContain("0396");
  });

  it("validating against that same profile returns ONLY PROFILE_MALFORMED", () => {
    const { findings } = validateAgainstProfile(
      parseHL7(oru("WBC^White^SCT")),
      withUnrecognized("ZZZ") as ConformanceProfile,
    );
    expect(findings.length).toBeGreaterThan(0);
    expect(findings.every((f) => f.code === FINDING_CODES.PROFILE_MALFORMED)).toBe(true);
    // The field-99 rule would have fired PROFILE_REQUIRED_ABSENT on a profile
    // the engine trusted; a profile it does not trust reports no message rule.
    expect(findings.map((f) => f.code)).not.toContain(FINDING_CODES.PROFILE_REQUIRED_ABSENT);
    expect(findings.map((f) => f.code)).not.toContain(FINDING_CODES.PROFILE_CODING_SYSTEM_MISMATCH);
  });

  it("a registered-but-unrecognized-here identifier is refused too, by construction", () => {
    // `HPC` is a real Table 0396 acronym and is deliberately outside this
    // library's frozen subset. It is refused rather than compared against a
    // system that cannot be resolved: stated, not accidental.
    expect(() => defineConformanceProfile(withUnrecognized("HPC"))).toThrow(ProfileDefinitionError);
  });
});

describe("coding-system binding: every malformed shape is refused the same way", () => {
  const cases: readonly (readonly [string, Record<string, unknown>])[] = [
    ["a non-string identifier", { valueSet: ["WBC"], codingSystem: 42 }],
    ["a null identifier", { valueSet: ["WBC"], codingSystem: null }],
    ["an array identifier", { valueSet: ["WBC"], codingSystem: ["LN"] }],
    ["an empty identifier", { valueSet: ["WBC"], codingSystem: "" }],
    ["a whitespace-only identifier", { valueSet: ["WBC"], codingSystem: "   " }],
    ["an unrecognized identifier", { valueSet: ["WBC"], codingSystem: "NOPE" }],
    [
      "a zero coding-system component",
      { valueSet: ["WBC"], codingSystem: "LN", codingSystemComponent: 0 },
    ],
    [
      "a negative coding-system component",
      { valueSet: ["WBC"], codingSystem: "LN", codingSystemComponent: -2 },
    ],
    [
      "a fractional coding-system component",
      { valueSet: ["WBC"], codingSystem: "LN", codingSystemComponent: 1.5 },
    ],
    [
      "a string coding-system component",
      { valueSet: ["WBC"], codingSystem: "LN", codingSystemComponent: "3" },
    ],
    ["a binding with no value set", { codingSystem: "LN" }],
    ["a component with no binding", { valueSet: ["WBC"], codingSystemComponent: 3 }],
  ];

  const asProfile = (rule: Record<string, unknown>): unknown => ({
    name: "malformed-binding",
    segments: [{ segment: "OBX", fields: [{ field: 3, ...rule }] }],
  });

  it.each(cases)("%s throws at definition time", (_label, rule) => {
    expect(() => defineConformanceProfile(asProfile(rule))).toThrow(ProfileDefinitionError);
  });

  it.each(cases)("%s validates to PROFILE_MALFORMED only, without throwing", (_label, rule) => {
    const msg = parseHL7(oru("WBC^White^SCT"));
    const profile = asProfile(rule) as ConformanceProfile;
    expect(() => validateAgainstProfile(msg, profile)).not.toThrow();
    const { findings } = validateAgainstProfile(msg, profile);
    expect(findings.length).toBeGreaterThan(0);
    expect(findings.every((f) => f.code === FINDING_CODES.PROFILE_MALFORMED)).toBe(true);
    expect(findings.every((f) => f.severity === "error")).toBe(true);
    expect(findings.every((f) => f.locus.segment === "OBX")).toBe(true);
  });

  it("a binding whose value set is present but garbage reports the value set, not a missing one", () => {
    const { findings } = validateAgainstProfile(
      parseHL7(oru("WBC^White^LN")),
      asProfile({ valueSet: "WBC", codingSystem: "LN" }) as ConformanceProfile,
    );
    expect(findings).toHaveLength(1);
    expect(findings[0]?.message).toContain("valueSet must be an array");
  });

  it("a non-string identifier names its TYPE and never echoes it", () => {
    const { findings } = validateAgainstProfile(
      parseHL7(oru("WBC^White^LN")),
      asProfile({
        valueSet: ["WBC"],
        codingSystem: { secret: "ZQVPROFILE" },
      }) as ConformanceProfile,
    );
    expect(findings).toHaveLength(1);
    expect(findings[0]?.message).toContain("must be a string, not object");
    expect(findings[0]?.message).not.toContain("ZQVPROFILE");
  });
});

describe("coding-system binding: the bare value-set form is untouched", () => {
  const bare = profileFor({ valueSet: [...CBC_CODES] });

  it("a rule with no binding never emits a coding-system finding", () => {
    for (const obx3 of [
      "WBC^White^LN",
      "WBC^White^SCT",
      "WBC^White^99LOCAL",
      "WBC^White",
      "WBC^White^",
      "WBC",
    ]) {
      expect(run(obx3, bare)).not.toContain(FINDING_CODES.PROFILE_CODING_SYSTEM_MISMATCH);
    }
  });

  it("it still reports membership on exactly the terms it always did", () => {
    expect(run("WBC^White^SCT", bare)).toEqual([]);
    expect(run("XYZ^Mystery^LN", bare)).toEqual([FINDING_CODES.PROFILE_VALUE_NOT_IN_SET]);
    expect(run("^Mystery^LN", bare)).toEqual([]); // an empty checked value is not judged
  });

  it("defining a bare-array profile still succeeds", () => {
    expect(() => defineConformanceProfile(bare)).not.toThrow();
  });
});
