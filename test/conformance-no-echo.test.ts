/**
 * A malformed conformance profile, or a malformed resolution argument, is
 * reported by position, by the kind of fault and by what was expected, and
 * never by the offending value itself.
 *
 * A profile is caller-supplied text, and a caller may build one from anything,
 * so a diagnostic that echoes it is how a value ends up in a log. The one kind
 * of value a diagnostic may still show is a token checked first against a fixed
 * set: a usage code the grammar admits, and a segment name of the form
 * `[A-Z][A-Z0-9]{2}`. Those are the profile's own structure, never free text.
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
