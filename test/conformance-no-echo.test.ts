/**
 * A malformed conformance profile, or a malformed resolution argument, is
 * reported by position, by the kind of fault and by what was expected, and
 * never by the offending value itself.
 *
 * A profile is caller-supplied text, and a caller may build one from anything,
 * so a diagnostic that echoes it is how a value ends up in a log. The one kind
 * of value a diagnostic may still show is a token checked first against a fixed
 * set: a usage code the grammar admits, a segment name of the form
 * `[A-Z][A-Z0-9]{2}`, and a number that passed its own check and is at most
 * 9999. Those are the profile's own structure, never free text.
 */

import { describe, expect, it } from "vitest";

import {
  FINDING_CODES,
  ProfileDefinitionError,
  defineConformanceProfile,
  parseHL7,
  validateAgainstProfile,
  type ConformanceFinding,
  type ConformanceProfile,
  type UsageResolution,
} from "../src/index.js";

/** A synthetic message whose patient name is the text the shrunk case collided with. */
const RAW =
  "MSH|^~\\&|A|B|C|D|20260101||ADT^A01|M1|P|2.5\rEVN|A01|20260101\rPID|1||MRN1^^^H^MR||Doe^John||19800101|M";

/** A value no fixed diagnostic text contains, so a hit is an echo. */
const SECRET = "ZQVsecret";

const run = (profile: unknown, resolutions?: unknown): readonly ConformanceFinding[] =>
  validateAgainstProfile(
    parseHL7(RAW),
    profile as ConformanceProfile,
    resolutions as readonly UsageResolution[],
  ).findings;

/** The message `defineConformanceProfile` throws with for `profile`. */
const thrownBy = (profile: unknown): string => {
  try {
    defineConformanceProfile(profile);
  } catch (err) {
    expect(err).toBeInstanceOf(ProfileDefinitionError);
    return (err as ProfileDefinitionError).message;
  }
  return expect.unreachable("should have thrown");
};

/** Every malformed-profile finding, and the one authoring error, leave `value` out. */
const expectNoEcho = (profile: unknown, value: string): void => {
  const findings = run(profile);
  expect(findings.length).toBeGreaterThan(0);
  for (const f of findings) {
    expect(f.code).toBe(FINDING_CODES.PROFILE_MALFORMED);
    expect(f.message).not.toContain(value);
    expect(f.locus.segment).not.toContain(value);
  }
  expect(thrownBy(profile)).not.toContain(value);
};

describe("the counterexample a property run found", () => {
  it("a usage that equals the message's patient name is not echoed", () => {
    // The shrunk case, verbatim: a profile name that is not a string, and a
    // usage that happens to read the same as the message's family name.
    const profile = { name: 0, segments: [{ segment: "MSH", usage: "Doe" }] };
    const findings = run(profile);
    expect(findings.length).toBeGreaterThan(0);
    for (const f of findings) expect(f.message).not.toContain("Doe");
  });
});

describe("a malformed profile names the position, the fault and what was expected", () => {
  it("a usage the grammar does not admit", () => {
    const profile = {
      name: "p",
      segments: [{ segment: "PID", usage: SECRET, fields: [{ field: 5, usage: SECRET }] }],
    };
    expectNoEcho(profile, SECRET);
    const messages = run(profile).map((f) => f.message);
    expect(messages).toEqual([
      expect.stringContaining('segment "PID" usage is not a usage code this profile may declare.'),
      expect.stringContaining(
        'segment "PID" field 5 usage is not a usage code this profile may declare.',
      ),
    ]);
    for (const m of messages) expect(m).toContain("Expected one of R/RE/C/CE/O/X/B");
  });

  it("a usage on a component rule", () => {
    const profile = {
      name: "p",
      segments: [
        { segment: "PID", fields: [{ field: 5, components: [{ component: 1, usage: SECRET }] }] },
      ],
    };
    expectNoEcho(profile, SECRET);
    expect(run(profile)[0]?.message).toContain(
      'segment "PID" field 5 component 1 usage is not a usage code',
    );
  });

  it("a usage longer than any diagnostic bound", () => {
    const long = `C(R/${SECRET}${"x".repeat(40)})`;
    expectNoEcho({ name: "p", segments: [{ segment: "PID", usage: long }] }, SECRET);
  });

  it("a level that is not one of the three", () => {
    const profile = { name: "p", level: SECRET, segments: [] };
    expectNoEcho(profile, SECRET);
    expect(run(profile)[0]?.message).toContain(
      "profile.level is not a conformance profile level. Expected one of",
    );
  });

  it("a coding system this library does not recognize", () => {
    const profile = {
      name: "p",
      segments: [{ segment: "PID", fields: [{ field: 8, valueSet: ["M"], codingSystem: SECRET }] }],
    };
    expectNoEcho(profile, SECRET);
    expect(run(profile)[0]?.message).toContain(
      'segment "PID" field 8 codingSystem is not a coding-system identifier this library recognizes.',
    );
  });

  it("a segment name, a field index and a predicate value are not echoed either", () => {
    expectNoEcho({ name: "p", segments: [{ segment: SECRET }] }, SECRET);
    expectNoEcho(
      { name: "p", segments: [{ segment: "PID", fields: [{ field: SECRET }] }] },
      SECRET,
    );
    expectNoEcho(
      {
        name: "p",
        segments: [
          {
            segment: "PID",
            usage: "C",
            condition: { location: { segment: SECRET, field: 1 }, verb: SECRET, values: [SECRET] },
          },
        ],
      },
      SECRET,
    );
  });

  it("a usage the grammar admits is shown, because it was checked against the fixed set", () => {
    const profile = {
      name: "p",
      level: "implementable",
      segments: [{ segment: "PID", usage: "C(O/B)" }],
    };
    const message = run(profile)[0]?.message ?? "";
    expect(message).toContain('segment "PID" declares usage "C(O/B)"');
  });
});

describe("a malformed resolution argument is not echoed", () => {
  const conditional = { name: "p", segments: [{ segment: "PID", usage: "C(R/X)" }] };

  it("a resolution segment that is not a segment name is refused by position", () => {
    const findings = run(conditional, [{ segment: SECRET, outcome: true }]);
    expect(findings).toHaveLength(1);
    const [f] = findings;
    expect(f?.code).toBe(FINDING_CODES.PROFILE_MALFORMED);
    expect(f?.message).toContain(
      "resolutions[0].segment must be a valid segment name ([A-Z][A-Z0-9]{2}).",
    );
    expect(f?.message).not.toContain(SECRET);
    expect(f?.locus.segment).not.toContain(SECRET);
  });

  it("the segment-name form is held at every edge: a capital, then exactly two capitals or digits", () => {
    for (const segment of ["PID1", "1PID", "pid", "PI", "P", "Pid", "P-D", "ZPID"]) {
      const findings = run(conditional, [{ segment, outcome: true }]);
      expect(findings, segment).toHaveLength(1);
      expect(findings[0]?.locus.segment, segment).toBe("(profile)");
      expect(findings[0]?.message, segment).toContain(
        "resolutions[0].segment must be a valid segment name",
      );
    }
    for (const segment of ["PID", "Z12", "ZZZ"]) {
      const findings = run(conditional, [{ segment, outcome: true }]);
      expect(findings[0]?.message ?? "", segment).not.toContain("must be a valid segment name");
    }
  });

  it("a resolution for a segment name the profile does not declare names that segment", () => {
    const findings = run(conditional, [{ segment: "ZZZ", outcome: true }]);
    expect(findings).toHaveLength(1);
    expect(findings[0]?.message).toContain('resolution for segment "ZZZ" matches no rule');
    expect(findings[0]?.locus.segment).toBe("ZZZ");
  });
});

/**
 * A number from the profile or the resolution argument is shown only when it
 * passed its own check and is at most 9999: small enough to be a count or an
 * index and nothing else. A larger one could as well be a date of birth or a
 * record number, so the text names the position and the fault without it.
 */
describe("a number from the profile is shown only when it passed its check and is at most 9999", () => {
  /** A number that reads as the message's own date of birth. */
  const BIG = 19800101;
  /** A negative number that fails every bound's own check. */
  const NEGATIVE = -1234567;

  /** Every string a finding carries: its code, severity, message and every string in its locus. */
  const stringsOf = (f: ConformanceFinding): string[] => [
    f.code,
    f.severity,
    f.message,
    ...Object.values(f.locus).filter((v): v is string => typeof v === "string"),
  ];

  const expectNoNumber = (
    findings: readonly ConformanceFinding[],
    ...numbers: readonly number[]
  ): void => {
    expect(findings.length).toBeGreaterThan(0);
    for (const f of findings) {
      for (const s of stringsOf(f)) {
        for (const n of numbers) expect(s).not.toContain(String(Math.abs(n)));
      }
    }
  };

  it("a maximum that failed its own check is not shown in the bounds conflict", () => {
    const profile = {
      name: "p",
      segments: [{ segment: "PID", cardinality: { min: BIG, max: NEGATIVE } }],
    };
    expectNoNumber(run(profile), BIG, NEGATIVE);
    expect(thrownBy(profile)).not.toContain(String(BIG));
    expect(thrownBy(profile)).not.toContain(String(-NEGATIVE));
    // The bound that failed its check is reported once, and no conflict is
    // derived from a number that means nothing.
    expect(run(profile).map((f) => f.message)).toEqual([
      'Malformed conformance profile: segment "PID" cardinality.max must be a non-negative integer or "*".',
    ]);
  });

  it("a bounds conflict between numbers above 9999 names the conflict without them", () => {
    const profile = {
      name: "p",
      segments: [{ segment: "PID", cardinality: { min: BIG, max: 10000 } }],
    };
    expectNoNumber(run(profile), BIG, 10000);
    expect(run(profile)[0]?.message).toContain('segment "PID" cardinality.max is less than min.');
    expect(thrownBy(profile)).not.toContain(String(BIG));
  });

  it("a usage and cardinality conflict does not show a number above 9999", () => {
    for (const card of [{ min: BIG }, { max: BIG }]) {
      const usage = card.min === undefined ? "X" : "O";
      const profile = { name: "p", segments: [{ segment: "PID", usage, cardinality: card }] };
      expectNoNumber(run(profile), BIG);
      expect(thrownBy(profile)).not.toContain(String(BIG));
    }
  });

  it("a field index or component index above 9999 is not shown in a defect", () => {
    const profile = {
      name: "p",
      segments: [
        {
          segment: "PID",
          fields: [
            { field: BIG, usage: "nonsense" },
            {
              field: 3,
              components: [
                { component: BIG, usage: "nonsense" },
                { component: BIG, usage: "R" },
              ],
            },
          ],
        },
      ],
    };
    expectNoNumber(run(profile), BIG);
    expect(thrownBy(profile)).not.toContain(String(BIG));
    expect(run(profile)[0]?.message).toContain('segment "PID" field (a number above 9999) usage');
  });

  it("a well-formed profile's numbers above 9999 are not shown in a message-level finding", () => {
    const tooFew = { name: "p", segments: [{ segment: "PID", cardinality: { min: 10000 } }] };
    expectNoNumber(run(tooFew), 10000);
    const absent = {
      name: "p",
      segments: [{ segment: "PID", fields: [{ field: BIG, usage: "R" }] }],
    };
    expectNoNumber(run(absent), BIG);
    expect(run(absent)[0]?.message).toContain("PID-(a number above 9999)");
    const raw = `${RAW}|${"x".repeat(10001)}`;
    const long = validateAgainstProfile(parseHL7(raw), {
      name: "p",
      segments: [{ segment: "PID", fields: [{ field: 9, length: 10000 }] }],
    }).findings;
    expect(long.map((f) => f.code)).toEqual([FINDING_CODES.PROFILE_LENGTH]);
    expectNoNumber(long, 10000);
  });

  it("a predicate location or a resolution field above 9999 is not shown", () => {
    const predicate = {
      name: "p",
      segments: [
        {
          segment: "PID",
          usage: "C",
          condition: { location: { segment: "PID", field: BIG }, verb: "is", values: ["A"] },
        },
      ],
    };
    expectNoNumber(run(predicate), BIG);
    const conditional = { name: "p", segments: [{ segment: "PID", usage: "C(R/X)" }] };
    expectNoNumber(run(conditional, [{ segment: "PID", field: BIG, outcome: true }]), BIG);
  });

  it("a number at most 9999 that passed its check is still shown", () => {
    const profile = {
      name: "p",
      segments: [{ segment: "PID", cardinality: { min: 9999, max: 9998 } }],
    };
    expect(run(profile)[0]?.message).toContain(
      'segment "PID" cardinality.max (9998) is less than min (9999).',
    );
    const many = { name: "p", segments: [{ segment: "PID", cardinality: { min: 2, max: "*" } }] };
    expect(run(many)[0]?.message).toContain("outside the declared cardinality (min 2, max *).");
    const x = { name: "p", segments: [{ segment: "PID", usage: "X", cardinality: { max: "*" } }] };
    expect(run(x)[0]?.message).toContain('segment "PID" declares usage X with cardinality.max *.');
    const dup = {
      name: "p",
      segments: [
        {
          segment: "PID",
          fields: [{ field: 9999, components: [{ component: 9999 }, { component: 9999 }] }],
        },
      ],
    };
    expect(run(dup)[0]?.message).toContain(
      'segment "PID" field 9999 components[1] declares component 9999, which',
    );
  });
});
