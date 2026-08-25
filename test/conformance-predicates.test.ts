/**
 * Condition predicates: the engine deciding a conditionally-used element's
 * usage by reading the message, rather than being handed the answer.
 *
 * The corpus below is deliberately shaped so that every verb, every presence
 * statement and every connector decides TRUE for one message and FALSE for
 * another, because a predicate language that can only ever say yes is
 * indistinguishable from one that is not consulted at all. The unhappy paths
 * carry the same weight as the happy ones: a predicate the message cannot
 * decide, a predicate the language does not admit, a predicate forced through
 * `any`, and a caller resolution colliding with a declared predicate all have
 * to be visible rather than guessed, because the failure mode here is a
 * conditional that silently reads as satisfied.
 */

import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it, vi } from "vitest";

import {
  DEFAULT_ENCODING_CHARACTERS,
  FINDING_CODES,
  Hl7Message,
  PREDICATE_CONNECTORS,
  PREDICATE_VERBS,
  defineConformanceProfile,
  parseHL7,
  validateAgainstProfile,
  type ComparisonPredicate,
  type ConditionPredicate,
  type ConformanceFinding,
  type ConformanceProfile,
  type FieldRule,
  type PredicateConnector,
  type PredicateLocation,
  type PredicateVerb,
  type SegmentRule,
  type UsageCode,
  type UsageResolution,
} from "../src/index.js";

// ---------------------------------------------------------------------------
// The message corpus. One PID shape, varied at the three places the predicates
// below read: PID-3 (identifiers, repeating), PID-5.1 (family name) and PID-7
// (date of birth). PID-8 carries a value throughout unless a case says
// otherwise, so a rule ON PID-8 has an observable presence either way.
// ---------------------------------------------------------------------------

const MSH = "MSH|^~\\&|A|B|C|D|20260101||ADT^A01|MSG1|P|2.5";

const message = (...segments: readonly string[]): Hl7Message =>
  parseHL7([MSH, ...segments].join("\r"));

/**
 * A PID whose identifiers (PID-3), family name (PID-5.1), date of birth (PID-7)
 * and administrative sex (PID-8) each vary independently. Assembled by joining
 * the field values rather than interpolating into one segment-shaped literal,
 * so the line carries no realistic-looking name in a name position for a reader
 * or a scanner to mistake for real content: every value here is synthetic.
 */
const pid = (parts: { ids?: string; family?: string; dob?: string; sex?: string } = {}): string =>
  [
    "PID",
    "1",
    "",
    parts.ids ?? "MRN1^^^H^MR",
    "",
    `${parts.family ?? "Doe"}^John`,
    "",
    parts.dob ?? "19800115",
    parts.sex ?? "M",
  ].join("|");

const DOE = message(pid({ family: "Doe" }));
const ROE = message(pid({ family: "Roe" }));
const WITH_DOB = message(pid({ dob: "19800115" }));
const NO_DOB = message(pid({ dob: "" }));
const TWO_IDS = message(pid({ ids: "MRN1^^^H^MR~MRN2^^^H^MR" }));
const NO_SEX = message(pid({ sex: "" }));

/** Two occurrences of one segment type, so "one or more occurrences" is testable. */
const TWO_OBX = message(pid(), "OBX|1|NM|WBC^^LN||7.5", "OBX|2|NM|RBC^^LN||4.2");

/** A message with no PID at all, so a rule's own segment can be absent too. */
const MSH_ONLY = message();

/**
 * A message that parsed to NO segments at all. Not reachable through
 * `parseHL7` (empty input is a fatal parse error), and precisely why it is
 * built directly: the engine's contract is over any message it is handed.
 */
const NO_SEGMENTS = new Hl7Message({
  segments: [],
  encodingCharacters: DEFAULT_ENCODING_CHARACTERS,
  version: "2.5",
  warnings: [],
});

// ---------------------------------------------------------------------------
// Profile and assertion helpers.
// ---------------------------------------------------------------------------

const FAMILY: PredicateLocation = { segment: "PID", field: 5, component: 1 };
const DOB: PredicateLocation = { segment: "PID", field: 7 };
const SEX: PredicateLocation = { segment: "PID", field: 8 };

/** A rule on PID-8, so a `C(X/O)` outcome is visible as one finding or none. */
const pid8Profile = (
  usage: UsageCode,
  condition: ConditionPredicate,
  extra: Partial<FieldRule> = {},
): ConformanceProfile => ({
  name: "predicate-pid8",
  segments: [{ segment: "PID", fields: [{ field: 8, usage, condition, ...extra }] }],
});

/** A rule on a segment the corpus never carries, so `R` fires and `X` does not. */
const pv1Profile = (usage: UsageCode, condition: ConditionPredicate): ConformanceProfile => ({
  name: "predicate-pv1",
  segments: [{ segment: "PV1", usage, condition }],
});

const findingsOf = (
  msg: Hl7Message,
  profile: ConformanceProfile,
  resolutions?: readonly UsageResolution[],
): readonly ConformanceFinding[] => validateAgainstProfile(msg, profile, resolutions).findings;

/** Feed the engine a shape a type check could not have stopped. */
const looseFindings = (
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

// ---------------------------------------------------------------------------

describe("a declared predicate selects the rule's usage outcome (criterion 1)", () => {
  const dobIsValued: ConditionPredicate = { location: DOB, presence: "is valued" };

  it("true applies the true outcome", () => {
    // C(R/X): the condition holds, so PID-8 is Required, and it is absent.
    const findings = findingsOf(
      message(pid({ dob: "19800115", sex: "" })),
      pid8Profile("C(R/X)", dobIsValued),
    );
    expect(codes(findings)).toEqual([FINDING_CODES.PROFILE_REQUIRED_ABSENT]);
    expect(findings[0]?.locus).toMatchObject({ segment: "PID", field: 8 });
  });

  it("false applies the false outcome", () => {
    // The same rule, a message with no date of birth: PID-8 is Not-permitted,
    // and it is present.
    const findings = findingsOf(
      message(pid({ dob: "", sex: "M" })),
      pid8Profile("C(R/X)", dobIsValued),
    );
    expect(codes(findings)).toEqual([FINDING_CODES.PROFILE_NOT_PERMITTED]);
  });

  it("the outcome flips with the message and nothing else", () => {
    const profile = pid8Profile("C(R/X)", dobIsValued);
    expect(findingsOf(message(pid({ dob: "19800115", sex: "M" })), profile)).toEqual([]);
    expect(findingsOf(message(pid({ dob: "", sex: "" })), profile)).toEqual([]);
  });

  it("a bare C takes the outcomes IHE states for it: satisfied is R, unsatisfied is X", () => {
    const profile = pid8Profile("C", dobIsValued);
    expect(codes(findingsOf(message(pid({ dob: "19800115", sex: "" })), profile))).toEqual([
      FINDING_CODES.PROFILE_REQUIRED_ABSENT,
    ]);
    expect(codes(findingsOf(message(pid({ dob: "", sex: "M" })), profile))).toEqual([
      FINDING_CODES.PROFILE_NOT_PERMITTED,
    ]);
  });

  it("a bare CE takes IHE's other pair: satisfied is RE, unsatisfied is X", () => {
    const profile = pid8Profile("CE", dobIsValued);
    // RE: an absent element is never a violation, so a satisfied CE fires nothing.
    expect(findingsOf(message(pid({ dob: "19800115", sex: "" })), profile)).toEqual([]);
    expect(codes(findingsOf(message(pid({ dob: "", sex: "M" })), profile))).toEqual([
      FINDING_CODES.PROFILE_NOT_PERMITTED,
    ]);
  });

  it("a segment rule's predicate decides that segment's own presence", () => {
    const profile = pv1Profile("C(R/X)", { location: DOB, presence: "is valued" });
    expect(codes(findingsOf(WITH_DOB, profile))).toEqual([FINDING_CODES.PROFILE_REQUIRED_ABSENT]);
    expect(findingsOf(NO_DOB, profile)).toEqual([]);
  });
});

describe("an undecidable predicate is reported, never guessed (criteria 2, 4)", () => {
  // PV1 is absent from the whole corpus, so a comparison against it has no
  // content to compare.
  const comparePv1: ConditionPredicate = {
    location: { segment: "PV1", field: 2 },
    verb: "is",
    values: ["I"],
  };

  it("emits the typed finding and does NOT report the element as satisfied", () => {
    const findings = findingsOf(NO_SEX, pid8Profile("C(R/X)", comparePv1));
    expect(codes(findings)).toEqual([FINDING_CODES.PROFILE_CONDITION_UNEVALUATABLE]);
    // The true outcome would have been Required, and PID-8 IS absent. The
    // engine neither fires that nor reports the element clean: the result is
    // non-empty, which is the whole point of the finding.
    expect(findings).not.toHaveLength(0);
    expect(codes(findings)).not.toContain(FINDING_CODES.PROFILE_REQUIRED_ABSENT);
  });

  it("does not fire the false outcome either", () => {
    // The false outcome would have been Not-permitted, and PID-8 is present.
    const findings = findingsOf(DOE, pid8Profile("C(R/X)", comparePv1));
    expect(codes(findings)).toEqual([FINDING_CODES.PROFILE_CONDITION_UNEVALUATABLE]);
  });

  it("the finding's code is distinct from every code published before it", () => {
    const published = [
      "PROFILE_REQUIRED_ABSENT",
      "PROFILE_NOT_PERMITTED",
      "PROFILE_CARDINALITY",
      "PROFILE_LENGTH",
      "PROFILE_VALUE_NOT_IN_SET",
      "PROFILE_MALFORMED",
    ];
    expect(published).not.toContain(FINDING_CODES.PROFILE_CONDITION_UNEVALUATABLE);
    expect(FINDING_CODES.PROFILE_CONDITION_UNEVALUATABLE).toBe("PROFILE_CONDITION_UNEVALUATABLE");
  });

  it("a consumer can filter unassessed conditionals BY CODE, not by message text", () => {
    const profile: ConformanceProfile = {
      name: "mixed",
      segments: [
        { segment: "PID", fields: [{ field: 3, usage: "R" }] },
        { segment: "PID", fields: [{ field: 8, usage: "C(R/X)", condition: comparePv1 }] },
      ],
    };
    const findings = findingsOf(message("PID|1||||Doe^John||19800115|M"), profile);
    const unassessed = findings.filter(
      (f) => f.code === FINDING_CODES.PROFILE_CONDITION_UNEVALUATABLE,
    );
    expect(unassessed).toHaveLength(1);
    expect(findings.length).toBeGreaterThan(unassessed.length);
  });

  it("names the location it could not decide at, structurally", () => {
    const [finding] = findingsOf(DOE, pid8Profile("C(R/X)", comparePv1));
    expect(finding?.message).toContain("PV1-2");
    expect(finding?.locus).toEqual({ segment: "PID", field: 8 });
  });

  it("carries the rule's own severity", () => {
    const findings = findingsOf(DOE, pid8Profile("C(R/X)", comparePv1, { severity: "warning" }));
    expect(findings[0]?.severity).toBe("warning");
  });

  it("is reported ONCE per rule, however many occurrences the segment has", () => {
    const profile: ConformanceProfile = {
      name: "one-per-rule",
      segments: [
        {
          segment: "OBX",
          fields: [
            {
              field: 6,
              usage: "C(R/X)",
              condition: { location: { segment: "PV1", field: 2 }, verb: "is", values: ["I"] },
            },
          ],
        },
      ],
    };
    expect(TWO_OBX.segments("OBX")).toHaveLength(2);
    expect(codes(findingsOf(TWO_OBX, profile))).toEqual([
      FINDING_CODES.PROFILE_CONDITION_UNEVALUATABLE,
    ]);
  });

  it("still applies the rule's other constraints, exactly as an undecided C does", () => {
    const condition = comparePv1;
    const extra = { length: 0, valueSet: ["Z"] } as const;
    const undecided = findingsOf(DOE, pid8Profile("C(R/X)", condition, extra));
    const asPlainC = findingsOf(DOE, {
      name: "predicate-pid8",
      segments: [{ segment: "PID", fields: [{ field: 8, usage: "C", ...extra }] }],
    });
    expect(codes(undecided.slice(1))).toEqual(codes(asPlainC));
    expect(undecided[0]?.code).toBe(FINDING_CODES.PROFILE_CONDITION_UNEVALUATABLE);
  });
});

describe("a predicate reads the message and nothing else (criterion 3)", () => {
  it("makes no network call while deciding every verb and connector", () => {
    const fetchSpy = vi.fn();
    const original = globalThis.fetch;
    // A stub rather than a mock of a real client: any attempt to reach the
    // network at all has to be visible, and there is nothing to reach.
    Object.defineProperty(globalThis, "fetch", { value: fetchSpy, configurable: true });
    try {
      for (const verb of PREDICATE_VERBS) {
        for (const msg of [DOE, ROE, TWO_IDS, MSH_ONLY, NO_SEGMENTS]) {
          findingsOf(msg, pid8Profile("C(R/X)", { location: FAMILY, verb, values: ["Doe"] }));
        }
      }
      for (const connector of PREDICATE_CONNECTORS) {
        findingsOf(
          DOE,
          pid8Profile("C(R/X)", {
            connector,
            left: { location: DOB, presence: "is valued" },
            right: { location: FAMILY, verb: "is", values: ["Doe"] },
          }),
        );
      }
    } finally {
      Object.defineProperty(globalThis, "fetch", { value: original, configurable: true });
    }
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("consults no bundled code set: the answer moves with the profile's own list", () => {
    const withCode = (values: readonly string[]): readonly ConformanceFinding[] =>
      findingsOf(DOE, pid8Profile("C(X/O)", { location: SEX, verb: "is", values }));
    // "M" is an HL7 administrative-sex code and "QQ" is not one anywhere. The
    // engine cannot tell, and must not: membership is the author's list.
    expect(codes(withCode(["M"]))).toEqual([FINDING_CODES.PROFILE_NOT_PERMITTED]);
    expect(withCode(["QQ"])).toEqual([]);
    expect(codes(withCode(["QQ", "M"]))).toEqual([FINDING_CODES.PROFILE_NOT_PERMITTED]);
  });

  it("the conformance sources reach for no network API at all", () => {
    const dir = join(import.meta.dirname, "..", "src", "conformance");
    const forbidden = [
      "node:http",
      "node:https",
      "node:net",
      "node:dns",
      "node:tls",
      "fetch(",
      "XMLHttpRequest",
      "WebSocket",
    ];
    const files = readdirSync(dir).filter((f) => f.endsWith(".ts"));
    expect(files.length).toBeGreaterThan(0);
    for (const file of files) {
      const source = readFileSync(join(dir, file), "utf8");
      for (const needle of forbidden) {
        expect(source, `${file} must not reach for ${needle}`).not.toContain(needle);
      }
    }
  });
});

describe("every verb and presence statement decides both ways (criterion 5)", () => {
  interface VerbCase {
    readonly verb: PredicateVerb;
    readonly values: readonly string[];
    readonly holds: Hl7Message;
    readonly fails: Hl7Message;
  }

  // One location (PID-5.1, "Doe" or "Roe") for all six, so the only thing
  // varying between rows is the verb itself.
  const VERB_CASES: readonly VerbCase[] = [
    { verb: "is", values: ["Doe"], holds: DOE, fails: ROE },
    { verb: "is not", values: ["Doe"], holds: ROE, fails: DOE },
    { verb: "contains", values: ["Do"], holds: DOE, fails: ROE },
    { verb: "does not contain", values: ["Do"], holds: ROE, fails: DOE },
    { verb: "matches", values: ["D.e"], holds: DOE, fails: ROE },
    { verb: "does not match", values: ["D.e"], holds: ROE, fails: DOE },
  ];

  it("covers the whole published verb set, with nothing left over", () => {
    expect(VERB_CASES.map((c) => c.verb)).toEqual([...PREDICATE_VERBS]);
  });

  for (const { verb, values, holds, fails } of VERB_CASES) {
    it(`"${verb}" decides true for one message and false for another`, () => {
      // C(X/O): true makes PID-8 Not-permitted and it is present; false makes
      // it Optional and nothing fires.
      const profile = pid8Profile("C(X/O)", { location: FAMILY, verb, values });
      expect(codes(findingsOf(holds, profile)), `${verb} true`).toEqual([
        FINDING_CODES.PROFILE_NOT_PERMITTED,
      ]);
      expect(findingsOf(fails, profile), `${verb} false`).toEqual([]);
    });
  }

  for (const [positive, negative] of [
    ["is", "is not"],
    ["contains", "does not contain"],
    ["matches", "does not match"],
  ] as const) {
    it(`"${negative}" is the exact complement of "${positive}"`, () => {
      for (const msg of [DOE, ROE, TWO_IDS]) {
        for (const values of [["Doe"], ["Do"], ["D.e"], ["Zzz"]]) {
          const pos = findingsOf(
            msg,
            pid8Profile("C(X/O)", { location: FAMILY, verb: positive, values }),
          );
          const neg = findingsOf(
            msg,
            pid8Profile("C(X/O)", { location: FAMILY, verb: negative, values }),
          );
          expect(pos.length + neg.length, `${positive}/${negative} ${values.join()}`).toBe(1);
        }
      }
    });
  }

  it('"is valued" decides true for one message and false for another', () => {
    const profile = pid8Profile("C(X/O)", { location: DOB, presence: "is valued" });
    expect(codes(findingsOf(WITH_DOB, profile))).toEqual([FINDING_CODES.PROFILE_NOT_PERMITTED]);
    expect(findingsOf(NO_DOB, profile)).toEqual([]);
  });

  it('"is not valued" decides true for one message and false for another', () => {
    const profile = pid8Profile("C(X/O)", { location: DOB, presence: "is not valued" });
    expect(codes(findingsOf(NO_DOB, profile))).toEqual([FINDING_CODES.PROFILE_NOT_PERMITTED]);
    expect(findingsOf(WITH_DOB, profile)).toEqual([]);
  });

  it("a matches value is anchored over the whole value, not merely found in it", () => {
    const profile = pid8Profile("C(X/O)", { location: FAMILY, verb: "matches", values: ["Do"] });
    // "Do" matches a whole value of "Do" and not the value "Doe".
    expect(findingsOf(DOE, profile)).toEqual([]);
    expect(codes(findingsOf(message(pid({ family: "Do" })), profile))).toEqual([
      FINDING_CODES.PROFILE_NOT_PERMITTED,
    ]);
  });

  it("membership and comparison are case-sensitive", () => {
    const profile = pid8Profile("C(X/O)", { location: FAMILY, verb: "is", values: ["doe"] });
    expect(findingsOf(DOE, profile)).toEqual([]);
  });
});

describe("connectors carry the published semantics (criterion 6)", () => {
  // Two independently controllable presence operands: PID-7 and PID-8.
  const operands = (left: boolean, right: boolean): Hl7Message =>
    message(pid({ dob: left ? "19800115" : "", sex: right ? "M" : "" }));

  const holds = (connector: PredicateConnector, left: boolean, right: boolean): boolean => {
    // The rule sits on PV1, which the corpus never carries: true is Required
    // (one finding), false is Not-permitted (none).
    const profile = pv1Profile("C(R/X)", {
      connector,
      left: { location: DOB, presence: "is valued" },
      right: { location: SEX, presence: "is valued" },
    });
    const findings = findingsOf(operands(left, right), profile);
    expect(codes(findings).every((c) => c === FINDING_CODES.PROFILE_REQUIRED_ABSENT)).toBe(true);
    return findings.length === 1;
  };

  it("AND is true only when both operands are true", () => {
    expect(holds("AND", true, true)).toBe(true);
    expect(holds("AND", true, false)).toBe(false);
    expect(holds("AND", false, true)).toBe(false);
    expect(holds("AND", false, false)).toBe(false);
  });

  it("OR is true when at least one operand is true", () => {
    expect(holds("OR", true, true)).toBe(true);
    expect(holds("OR", true, false)).toBe(true);
    expect(holds("OR", false, true)).toBe(true);
    expect(holds("OR", false, false)).toBe(false);
  });

  it("XOR is true when exactly one operand is true", () => {
    expect(holds("XOR", true, true)).toBe(false);
    expect(holds("XOR", true, false)).toBe(true);
    expect(holds("XOR", false, true)).toBe(true);
    expect(holds("XOR", false, false)).toBe(false);
  });

  it("covers the whole published connector set", () => {
    expect([...PREDICATE_CONNECTORS]).toEqual(["AND", "OR", "XOR"]);
  });

  it("connectors nest", () => {
    const profile = pv1Profile("C(R/X)", {
      connector: "AND",
      left: {
        connector: "OR",
        left: { location: DOB, presence: "is valued" },
        right: { location: SEX, presence: "is not valued" },
      },
      right: { location: FAMILY, verb: "is", values: ["Doe"] },
    });
    expect(codes(findingsOf(DOE, profile))).toEqual([FINDING_CODES.PROFILE_REQUIRED_ABSENT]);
    expect(findingsOf(ROE, profile)).toEqual([]);
  });

  it("an operand that is undecidable makes the result undecidable only when it matters", () => {
    const undecidable: ComparisonPredicate = {
      location: { segment: "PV1", field: 2 },
      verb: "is",
      values: ["I"],
    };
    const decidableFalse: ConditionPredicate = { location: DOB, presence: "is not valued" };
    const decidableTrue: ConditionPredicate = { location: DOB, presence: "is valued" };

    // AND with a false operand is false whatever the other side is.
    expect(
      findingsOf(
        WITH_DOB,
        pv1Profile("C(R/X)", { connector: "AND", left: decidableFalse, right: undecidable }),
      ),
    ).toEqual([]);
    // OR with a true operand is true whatever the other side is.
    expect(
      codes(
        findingsOf(
          WITH_DOB,
          pv1Profile("C(R/X)", { connector: "OR", left: decidableTrue, right: undecidable }),
        ),
      ),
    ).toEqual([FINDING_CODES.PROFILE_REQUIRED_ABSENT]);
    // AND with a true operand DOES depend on the other side.
    expect(
      codes(
        findingsOf(
          WITH_DOB,
          pv1Profile("C(R/X)", { connector: "AND", left: decidableTrue, right: undecidable }),
        ),
      ),
    ).toEqual([FINDING_CODES.PROFILE_CONDITION_UNEVALUATABLE]);
    // XOR always depends on both.
    for (const decidable of [decidableTrue, decidableFalse]) {
      expect(
        codes(
          findingsOf(
            WITH_DOB,
            pv1Profile("C(R/X)", { connector: "XOR", left: decidable, right: undecidable }),
          ),
        ),
      ).toEqual([FINDING_CODES.PROFILE_CONDITION_UNEVALUATABLE]);
    }
  });
});

describe("repetitions and occurrences: one or more satisfies it (criterion 7)", () => {
  it("a repeating field is true when ANY repetition satisfies the statement", () => {
    const profile = (values: readonly string[]): ConformanceProfile =>
      pid8Profile("C(X/O)", {
        location: { segment: "PID", field: 3, component: 1 },
        verb: "is",
        values,
      });
    expect(TWO_IDS.segments("PID")[0]?.field(3).repetitions).toHaveLength(2);
    // The SECOND repetition is the one that satisfies it.
    expect(codes(findingsOf(TWO_IDS, profile(["MRN2"])))).toEqual([
      FINDING_CODES.PROFILE_NOT_PERMITTED,
    ]);
    expect(codes(findingsOf(TWO_IDS, profile(["MRN1"])))).toEqual([
      FINDING_CODES.PROFILE_NOT_PERMITTED,
    ]);
    expect(findingsOf(TWO_IDS, profile(["MRN9"]))).toEqual([]);
  });

  it("a segment occurring more than once is true when ANY occurrence satisfies it", () => {
    const profile = (values: readonly string[]): ConformanceProfile =>
      pid8Profile("C(X/O)", {
        location: { segment: "OBX", field: 3, component: 1 },
        verb: "is",
        values,
      });
    // The SECOND occurrence is the one that satisfies it.
    expect(codes(findingsOf(TWO_OBX, profile(["RBC"])))).toEqual([
      FINDING_CODES.PROFILE_NOT_PERMITTED,
    ]);
    expect(codes(findingsOf(TWO_OBX, profile(["WBC"])))).toEqual([
      FINDING_CODES.PROFILE_NOT_PERMITTED,
    ]);
    expect(findingsOf(TWO_OBX, profile(["PLT"]))).toEqual([]);
  });

  it("the existential covers a negative verb too", () => {
    // One repetition is MRN1 and the other is not, so "is not MRN1" holds.
    const profile = pid8Profile("C(X/O)", {
      location: { segment: "PID", field: 3, component: 1 },
      verb: "is not",
      values: ["MRN1"],
    });
    expect(codes(findingsOf(TWO_IDS, profile))).toEqual([FINDING_CODES.PROFILE_NOT_PERMITTED]);
    // With one repetition, and it is MRN1, nothing satisfies it.
    expect(findingsOf(DOE, profile)).toEqual([]);
  });

  it("a presence statement over a repeating field is valued when any repetition is", () => {
    const profile = pid8Profile("C(X/O)", {
      location: { segment: "PID", field: 3 },
      presence: "is valued",
    });
    expect(codes(findingsOf(TWO_IDS, profile))).toEqual([FINDING_CODES.PROFILE_NOT_PERMITTED]);
    expect(findingsOf(message("PID|1||||Doe^John||19800115|M"), profile)).toEqual([]);
  });

  it("a field-only presence statement sees content in ANY component", () => {
    // PID-5.1 is empty and PID-5.2 is not: the FIELD carries content.
    const partial = message("PID|1||MRN1^^^H^MR||^John||19800115|M");
    expect(
      codes(
        findingsOf(
          partial,
          pid8Profile("C(X/O)", { location: { segment: "PID", field: 5 }, presence: "is valued" }),
        ),
      ),
    ).toEqual([FINDING_CODES.PROFILE_NOT_PERMITTED]);
    // A COMPARISON at the same field reads component 1, which is empty, so it
    // has no content to compare rather than a false answer.
    expect(
      codes(
        findingsOf(
          partial,
          pid8Profile("C(X/O)", {
            location: { segment: "PID", field: 5 },
            verb: "is",
            values: ["Doe"],
          }),
        ),
      ),
    ).toEqual([FINDING_CODES.PROFILE_CONDITION_UNEVALUATABLE]);
  });

  it("a subcomponent location reads that subcomponent", () => {
    const withSub = message("PID|1||MRN1&ALT^^^H^MR||Doe^John||19800115|M");
    const at = (subcomponent: number, values: readonly string[]): readonly ConformanceFinding[] =>
      findingsOf(
        withSub,
        pid8Profile("C(X/O)", {
          location: { segment: "PID", field: 3, component: 1, subcomponent },
          verb: "is",
          values,
        }),
      );
    expect(codes(at(1, ["MRN1"]))).toEqual([FINDING_CODES.PROFILE_NOT_PERMITTED]);
    expect(codes(at(2, ["ALT"]))).toEqual([FINDING_CODES.PROFILE_NOT_PERMITTED]);
    expect(at(2, ["MRN1"])).toEqual([]);
  });
});

describe("a selected outcome gets exactly the terms it would get directly (criterion 8)", () => {
  // Two predicates that are exact complements of each other, so across the
  // corpus each of them decides true for some messages and false for others.
  const dobValued: ConditionPredicate = { location: DOB, presence: "is valued" };
  const dobNotValued: ConditionPredicate = { location: DOB, presence: "is not valued" };

  // Both branches have to be reachable, so the corpus carries messages with a
  // date of birth AND messages without one; a corpus where every message takes
  // the same branch would leave the other one untested while still passing.
  const corpus = [DOE, ROE, NO_SEX, TWO_IDS, TWO_OBX, NO_DOB, message(pid({ dob: "", sex: "" }))];
  const extras: readonly Partial<FieldRule>[] = [
    {},
    { cardinality: { min: 1, max: 1 } },
    { length: 0 },
    { valueSet: ["F", "U"] },
    { length: 0, valueSet: ["F", "U"], cardinality: { min: 2, max: 2 } },
  ];

  for (const [token, whenTrue, whenFalse] of [
    ["C(R/X)", "R", "X"],
    ["C(RE/O)", "RE", "O"],
    ["C", "R", "X"],
    ["CE", "RE", "X"],
  ] as const) {
    it(`${token} resolved by its predicate is findings-identical to the outcome declared directly`, () => {
      let comparedTrue = 0;
      let comparedFalse = 0;
      for (const predicate of [dobValued, dobNotValued]) {
        for (const extra of extras) {
          for (const msg of corpus) {
            // Both predicates read PID-7, so which branch a message takes is
            // readable from the message rather than assumed.
            const valued = (msg.segments("PID")[0]?.field(7).value ?? "") !== "";
            const holds = predicate === dobValued ? valued : !valued;
            const plain = holds ? whenTrue : whenFalse;
            if (holds) comparedTrue++;
            else comparedFalse++;
            const viaPredicate = findingsOf(msg, pid8Profile(token, predicate, extra));
            const direct = findingsOf(msg, {
              name: "predicate-pid8",
              segments: [{ segment: "PID", fields: [{ field: 8, usage: plain, ...extra }] }],
            });
            expect(viaPredicate, `${token} selected ${plain}`).toEqual(direct);
          }
        }
      }
      // A branch nothing reached would leave this test green while proving
      // only half of what it claims.
      expect(comparedTrue).toBeGreaterThan(0);
      expect(comparedFalse).toBeGreaterThan(0);
    });
  }

  it("a segment rule's other constraints ride the selected outcome too", () => {
    const condition: ConditionPredicate = { location: DOB, presence: "is valued" };
    const withPredicate = findingsOf(TWO_OBX, {
      name: "seg",
      segments: [{ segment: "OBX", usage: "C(RE/X)", condition, cardinality: { min: 1, max: 1 } }],
    });
    const direct = findingsOf(TWO_OBX, {
      name: "seg",
      segments: [{ segment: "OBX", usage: "RE", cardinality: { min: 1, max: 1 } }],
    });
    expect(withPredicate).toEqual(direct);
    expect(codes(withPredicate)).toEqual([FINDING_CODES.PROFILE_CARDINALITY]);
  });
});

describe("a predicate the language does not admit is refused (criterion 9)", () => {
  /** A rule that WOULD fire on this message, so "evaluate no message rule" is observable. */
  const withDefect = (condition: unknown): ConformanceProfile =>
    ({
      name: "defective",
      segments: [
        { segment: "PID", fields: [{ field: 3, usage: "R" }] },
        { segment: "PID", fields: [{ field: 8, usage: "C(R/X)", condition }] },
      ],
    }) as unknown as ConformanceProfile;

  const NO_IDS = message("PID|1||||Doe^John||19800115|M");

  const DEFECTS: readonly (readonly [string, unknown])[] = [
    ["an unrecognised verb", { location: FAMILY, verb: "equals", values: ["Doe"] }],
    ["a comparison with no value list", { location: FAMILY, verb: "is" }],
    ["a comparison with an empty value list", { location: FAMILY, verb: "is", values: [] }],
    ["a value list that is not an array", { location: FAMILY, verb: "is", values: "Doe" }],
    ["a value list of non-strings", { location: FAMILY, verb: "is", values: [1, 2] }],
    ["an unrecognised presence statement", { location: DOB, presence: "is populated" }],
    ["a location that is not an object", { location: "PID-8", presence: "is valued" }],
    ["a location naming no segment", { location: { field: 8 }, presence: "is valued" }],
    ["a location with a bad segment name", { location: { segment: "pid" }, presence: "is valued" }],
    [
      "a location with a non-integer field",
      { location: { segment: "PID", field: 1.5 }, presence: "is valued" },
    ],
    [
      "a component with no field",
      { location: { segment: "PID", component: 2 }, presence: "is valued" },
    ],
    [
      "a subcomponent with no component",
      { location: { segment: "PID", field: 5, subcomponent: 2 }, presence: "is valued" },
    ],
    [
      "a comparison whose location stops at the segment",
      { location: { segment: "PID" }, verb: "is", values: ["Doe"] },
    ],
    [
      "a regular expression the platform cannot compile",
      { location: FAMILY, verb: "matches", values: ["("] },
    ],
    ["a statement that states nothing", { location: FAMILY }],
    [
      "a statement declaring two discriminants at once",
      { location: FAMILY, presence: "is valued", verb: "is", values: ["Doe"] },
    ],
    [
      "an unrecognised connector",
      {
        connector: "NAND",
        left: { location: DOB, presence: "is valued" },
        right: { location: DOB, presence: "is valued" },
      },
    ],
    [
      "a connector missing an operand",
      { connector: "AND", left: { location: DOB, presence: "is valued" } },
    ],
    [
      "a defect on the right-hand side of a connector",
      {
        connector: "AND",
        left: { location: DOB, presence: "is valued" },
        right: { location: FAMILY, verb: "equals", values: ["Doe"] },
      },
    ],
  ];

  for (const [label, condition] of DEFECTS) {
    it(`${label} is PROFILE_MALFORMED, evaluates no message rule, and does not throw`, () => {
      const findings = looseFindings(NO_IDS, withDefect(condition));
      expect(findings.length, label).toBeGreaterThan(0);
      expect(
        findings.every((f) => f.code === FINDING_CODES.PROFILE_MALFORMED),
        label,
      ).toBe(true);
      // PID-3 is Required and absent from this message; a defective profile is
      // not validated against, so that rule never fires.
      expect(codes(findings), label).not.toContain(FINDING_CODES.PROFILE_REQUIRED_ABSENT);
    });

    it(`${label} is raised by the fail-fast authoring gate too`, () => {
      expect(() => defineConformanceProfile(withDefect(condition))).toThrow();
    });
  }

  it("nesting deeper than the language defines is refused rather than overflowing", () => {
    let deep: unknown = { location: DOB, presence: "is valued" };
    for (let i = 0; i < 40; i++) {
      deep = { connector: "AND", left: { location: DOB, presence: "is valued" }, right: deep };
    }
    const findings = looseFindings(NO_IDS, withDefect(deep));
    expect(findings.every((f) => f.code === FINDING_CODES.PROFILE_MALFORMED)).toBe(true);
  });

  it("a predicate on a rule whose usage is not conditional is refused, never ignored", () => {
    for (const usage of ["R", "RE", "O", "X", "B"]) {
      const profile = {
        name: "not-conditional",
        segments: [
          {
            segment: "PID",
            fields: [{ field: 8, usage, condition: { location: DOB, presence: "is valued" } }],
          },
        ],
      };
      const findings = looseFindings(DOE, profile);
      expect(codes(findings), usage).toEqual([FINDING_CODES.PROFILE_MALFORMED]);
      expect(findings[0]?.message, usage).toContain("not conditional");
    }
  });

  it("a predicate on a rule with an OMITTED usage is refused on the same terms", () => {
    const profile = {
      name: "no-usage",
      segments: [
        {
          segment: "PID",
          fields: [{ field: 8, condition: { location: DOB, presence: "is valued" } }],
        },
      ],
    };
    expect(codes(looseFindings(DOE, profile))).toEqual([FINDING_CODES.PROFILE_MALFORMED]);
  });

  it("a rule whose usage token is itself a typo reports the usage once, not twice", () => {
    const profile = {
      name: "typo",
      segments: [
        {
          segment: "PID",
          fields: [{ field: 8, usage: "RQ", condition: { location: DOB, presence: "is valued" } }],
        },
      ],
    };
    const findings = looseFindings(DOE, profile);
    expect(codes(findings)).toEqual([FINDING_CODES.PROFILE_MALFORMED]);
    expect(findings[0]?.message).toContain("RQ");
  });

  it("no defect message echoes a value drawn from the predicate's value list", () => {
    const secret = "ZQVSECRET";
    const findings = looseFindings(
      DOE,
      withDefect({ location: FAMILY, verb: "matches", values: [`(${secret}`] }),
    );
    expect(findings.length).toBeGreaterThan(0);
    for (const f of findings) expect(f.message).not.toContain(secret);
    // The INDEX is what an author needs, and it is there.
    expect(findings.some((f) => f.message.includes("values[0]"))).toBe(true);
  });

  it("an omitted condition is not a condition and is never refused", () => {
    const profile: ConformanceProfile = {
      name: "no-condition",
      segments: [{ segment: "PID", fields: [{ field: 8, usage: "C(R/X)" }] }],
    };
    expect(findingsOf(DOE, profile)).toEqual([]);
    expect(() => defineConformanceProfile(profile)).not.toThrow();
  });
});

describe("a resolution colliding with a declared predicate is refused (criterion 10)", () => {
  const condition: ConditionPredicate = { location: DOB, presence: "is valued" };
  const profile = pid8Profile("C(R/X)", condition);

  it("is a PROFILE_MALFORMED finding at that locus", () => {
    const findings = findingsOf(NO_SEX, profile, [{ segment: "PID", field: 8, outcome: true }]);
    expect(codes(findings)).toEqual([FINDING_CODES.PROFILE_MALFORMED]);
    expect(findings[0]?.locus).toMatchObject({ segment: "PID", field: 8 });
    expect(findings[0]?.message).toContain("condition predicate");
  });

  it("prefers NEITHER source: the same refusal whichever outcome the caller supplied", () => {
    const asTrue = findingsOf(NO_SEX, profile, [{ segment: "PID", field: 8, outcome: true }]);
    const asFalse = findingsOf(NO_SEX, profile, [{ segment: "PID", field: 8, outcome: false }]);
    expect(asTrue).toEqual(asFalse);
    // Neither outcome was applied: the true branch would have been Required
    // (PID-8 is absent here) and the false branch Not-permitted.
    expect(codes(asTrue)).not.toContain(FINDING_CODES.PROFILE_REQUIRED_ABSENT);
    expect(codes(asTrue)).not.toContain(FINDING_CODES.PROFILE_NOT_PERMITTED);
  });

  it("a segment rule collides on the same terms", () => {
    const findings = findingsOf(DOE, pv1Profile("C(R/X)", condition), [
      { segment: "PV1", outcome: true },
    ]);
    expect(codes(findings)).toEqual([FINDING_CODES.PROFILE_MALFORMED]);
  });

  it("a locus both duplicated and colliding is exactly one finding, the collision", () => {
    const findings = findingsOf(NO_SEX, profile, [
      { segment: "PID", field: 8, outcome: true },
      { segment: "PID", field: 8, outcome: false },
    ]);
    expect(findings).toHaveLength(1);
    expect(findings[0]?.message).toContain("condition predicate");
  });

  it("a resolution aimed at a DIFFERENT locus is unaffected by a predicate elsewhere", () => {
    const mixed: ConformanceProfile = {
      name: "mixed-sources",
      segments: [
        { segment: "PID", fields: [{ field: 8, usage: "C(R/X)", condition }] },
        { segment: "PV1", usage: "C(R/X)" },
      ],
    };
    // PID-8's predicate decides itself; PV1's resolution decides PV1.
    const findings = findingsOf(WITH_DOB, mixed, [{ segment: "PV1", outcome: true }]);
    expect(codes(findings)).toEqual([FINDING_CODES.PROFILE_REQUIRED_ABSENT]);
    expect(findings[0]?.locus).toEqual({ segment: "PV1" });
  });
});

describe("a predicate no type check could have stopped never throws (criterion 11)", () => {
  const SHAPES: readonly (readonly [string, unknown])[] = [
    ["null", null],
    ["an array", []],
    ["a populated array", [{ location: DOB, presence: "is valued" }]],
    ["a string", "IF PID-7 is valued"],
    ["a number", 42],
    ["a boolean", true],
    ["an empty object", {}],
    ["a wrong-typed value list", { location: FAMILY, verb: "is", values: { 0: "Doe" } }],
    ["a null location", { location: null, presence: "is valued" }],
    ["a non-string presence", { location: DOB, presence: 1 }],
    ["a non-string verb", { location: FAMILY, verb: 7, values: ["Doe"] }],
    ["a non-string connector", { connector: 3, left: {}, right: {} }],
  ];

  for (const [label, condition] of SHAPES) {
    it(`${label} returns a result carrying PROFILE_MALFORMED`, () => {
      const profile = {
        name: "forced",
        segments: [{ segment: "PID", fields: [{ field: 8, usage: "C(R/X)", condition }] }],
      };
      let findings: readonly ConformanceFinding[] = [];
      expect(() => {
        findings = looseFindings(DOE, profile);
      }, label).not.toThrow();
      expect(codes(findings), label).toContain(FINDING_CODES.PROFILE_MALFORMED);
    });
  }

  it("a self-referential predicate is refused rather than looping forever", () => {
    const cyclic: Record<string, unknown> = {
      connector: "AND",
      left: { location: DOB, presence: "is valued" },
    };
    cyclic["right"] = cyclic;
    const profile = {
      name: "cyclic",
      segments: [{ segment: "PID", fields: [{ field: 8, usage: "C(R/X)", condition: cyclic }] }],
    };
    let findings: readonly ConformanceFinding[] = [];
    expect(() => {
      findings = looseFindings(DOE, profile);
    }).not.toThrow();
    expect(codes(findings)).toContain(FINDING_CODES.PROFILE_MALFORMED);
  });

  it("a garbage profile AND a garbage resolution argument together still return a result", () => {
    expect(() =>
      looseFindings(
        DOE,
        { name: 1, segments: [{ segment: "PID", condition: null }] },
        "not a list",
      ),
    ).not.toThrow();
  });
});

describe("an absent segment: determinate presence, undecidable comparison (criterion 12)", () => {
  const cases: readonly (readonly [string, Hl7Message])[] = [
    ["a message carrying no occurrence of that segment", DOE],
    ["a message carrying only MSH", MSH_ONLY],
    ["a message that parsed to no segments at all", NO_SEGMENTS],
  ];

  for (const [label, msg] of cases) {
    it(`${label}: "is valued" is determinate and decides false`, () => {
      const profile = pv1Profile("C(R/X)", {
        location: { segment: "PV1", field: 2 },
        presence: "is valued",
      });
      // False selects X, and PV1 is absent, so nothing fires and nothing is
      // reported undecidable.
      expect(findingsOf(msg, profile), label).toEqual([]);
    });

    it(`${label}: "is not valued" is determinate and decides true`, () => {
      const profile = pv1Profile("C(R/X)", {
        location: { segment: "PV1", field: 2 },
        presence: "is not valued",
      });
      expect(codes(findingsOf(msg, profile)), label).toEqual([
        FINDING_CODES.PROFILE_REQUIRED_ABSENT,
      ]);
    });

    it(`${label}: a comparison is undecidable`, () => {
      const profile = pv1Profile("C(R/X)", {
        location: { segment: "PV1", field: 2 },
        verb: "is",
        values: ["I"],
      });
      expect(codes(findingsOf(msg, profile)), label).toEqual([
        FINDING_CODES.PROFILE_CONDITION_UNEVALUATABLE,
      ]);
    });

    it(`${label}: a segment-only presence statement asks whether it occurs`, () => {
      const profile = pv1Profile("C(R/X)", {
        location: { segment: "PV1" },
        presence: "is not valued",
      });
      expect(codes(findingsOf(msg, profile)), label).toEqual([
        FINDING_CODES.PROFILE_REQUIRED_ABSENT,
      ]);
    });
  }

  it("a present segment whose located FIELD is empty is undecidable for a comparison", () => {
    const profile = pid8Profile("C(R/X)", { location: DOB, verb: "is", values: ["19800115"] });
    expect(codes(findingsOf(NO_DOB, profile))).toEqual([
      FINDING_CODES.PROFILE_CONDITION_UNEVALUATABLE,
    ]);
    expect(findingsOf(WITH_DOB, profile)).toEqual([]);
  });

  it("a segment that DOES occur makes a segment-only presence statement true", () => {
    const profile = pv1Profile("C(R/X)", {
      location: { segment: "PID" },
      presence: "is valued",
    });
    expect(codes(findingsOf(DOE, profile))).toEqual([FINDING_CODES.PROFILE_REQUIRED_ABSENT]);
    expect(findingsOf(MSH_ONLY, profile)).toEqual([]);
  });
});

describe("predicate findings carry no message value and no profile value list (criterion 15)", () => {
  it("neither the compared value nor the value list reaches a finding message", () => {
    const secret = "ZQVLEAK";
    const msg = message(pid({ family: secret }));
    const profile = pid8Profile("C(R/X)", {
      connector: "AND",
      left: { location: FAMILY, verb: "is", values: [secret, "ZQVOTHER"] },
      right: { location: { segment: "PV1", field: 2 }, verb: "is", values: ["ZQVSET"] },
    });
    const findings = findingsOf(msg, profile);
    expect(findings.length).toBeGreaterThan(0);
    for (const f of findings) {
      expect(f.message).not.toContain(secret);
      expect(f.message).not.toContain("ZQVOTHER");
      expect(f.message).not.toContain("ZQVSET");
    }
  });

  it("the structural locus IS carried, because it is what an author needs", () => {
    const [finding] = findingsOf(
      DOE,
      pid8Profile("C(R/X)", {
        location: { segment: "PV1", field: 3, component: 2 },
        verb: "is",
        values: ["ZQVSET"],
      }),
    );
    expect(finding?.message).toContain("PV1-3 component 2");
    expect(finding?.message).toContain("PID-8");
  });
});

describe("the predicate surface is typed where the author writes TypeScript", () => {
  it("accepts the published shapes", () => {
    const presence: ConditionPredicate = { location: DOB, presence: "is valued" };
    const comparison: ConditionPredicate = { location: FAMILY, verb: "contains", values: ["Do"] };
    const connected: ConditionPredicate = { connector: "XOR", left: presence, right: comparison };
    const rule: FieldRule = { field: 8, usage: "C(R/X)", condition: connected };
    const segmentRule: SegmentRule = { segment: "PV1", usage: "CE", condition: presence };
    expect(rule.condition).toBe(connected);
    expect(segmentRule.condition).toBe(presence);
  });

  it("rejects a wrong verb and a missing value list at compile time", () => {
    // @ts-expect-error "equals" is not one of the published verbs.
    const wrongVerb: ConditionPredicate = { location: FAMILY, verb: "equals", values: ["Doe"] };
    // @ts-expect-error a comparison must carry a value list.
    const noValues: ConditionPredicate = { location: FAMILY, verb: "contains" };
    const wrongConnector: ConditionPredicate = {
      // @ts-expect-error "NAND" is not one of the published connectors.
      connector: "NAND",
      left: { location: DOB, presence: "is valued" },
      right: { location: DOB, presence: "is valued" },
    };
    expect([wrongVerb, noValues, wrongConnector]).toHaveLength(3);
  });

  it("publishes the verb and connector listings as frozen vocabularies", () => {
    expect([...PREDICATE_VERBS]).toEqual([
      "is",
      "is not",
      "contains",
      "does not contain",
      "matches",
      "does not match",
    ]);
    expect(Object.isFrozen(PREDICATE_VERBS)).toBe(true);
    expect(Object.isFrozen(PREDICATE_CONNECTORS)).toBe(true);
  });
});

describe("the standing invariants hold under predicates", () => {
  const everyShape: readonly ConditionPredicate[] = [
    { location: DOB, presence: "is valued" },
    { location: FAMILY, verb: "matches", values: ["D.e"] },
    {
      connector: "OR",
      left: { location: SEX, presence: "is not valued" },
      right: { location: { segment: "PV1", field: 2 }, verb: "is", values: ["I"] },
    },
  ];

  it("validation never mutates the message", () => {
    for (const msg of [DOE, TWO_IDS, TWO_OBX, MSH_ONLY]) {
      const before = msg.toString();
      for (const condition of everyShape) {
        findingsOf(msg, pid8Profile("C(R/X)", condition));
        findingsOf(msg, pv1Profile("C(RE/X)", condition));
      }
      expect(msg.toString()).toBe(before);
    }
  });

  it("a conforming message against a predicate-carrying profile yields zero findings", () => {
    const profile: ConformanceProfile = {
      name: "conforming",
      segments: [
        {
          segment: "PID",
          usage: "R",
          fields: [
            { field: 3, usage: "R" },
            {
              field: 8,
              usage: "C(R/X)",
              condition: { location: DOB, presence: "is valued" },
              valueSet: ["M", "F", "U"],
            },
          ],
        },
      ],
    };
    expect(findingsOf(WITH_DOB, profile)).toEqual([]);
  });

  it("the result and its findings list are frozen", () => {
    const result = validateAgainstProfile(
      DOE,
      pid8Profile("C(R/X)", { location: DOB, presence: "is valued" }),
    );
    expect(Object.isFrozen(result)).toBe(true);
    expect(Object.isFrozen(result.findings)).toBe(true);
  });
});
