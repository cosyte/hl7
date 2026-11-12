/**
 * The one rule for a number a conformance diagnostic shows: a non-negative
 * integer of at most 9999, and a fixed phrase for anything else. Every text
 * that shows a profile number is pinned here word for word, both where the
 * number is shown and where a part of the locus is absent.
 */

import { describe, expect, it } from "vitest";

import {
  parseHL7,
  validateAgainstProfile,
  type ConformanceProfile,
  type UsageResolution,
} from "../src/index.js";
import { cardinality, describeLocus, length } from "../src/conformance/findings.js";
import { describeLocation } from "../src/conformance/predicate.js";
import { collectProfileDefects } from "../src/conformance/profile-shape.js";
import { MAX_SHOWN_NUMBER, isShownNumber, showNumber } from "../src/conformance/shown-number.js";

const UNSHOWN = "(a number above 9999)";

/** The detail of every defect `profile` has. */
const details = (profile: unknown): string[] => collectProfileDefects(profile).map((d) => d.detail);

describe("shown numbers", () => {
  it("shows a non-negative integer of at most 9999", () => {
    expect(MAX_SHOWN_NUMBER).toBe(9999);
    for (const n of [0, 1, 42, 9999]) {
      expect(isShownNumber(n), String(n)).toBe(true);
      expect(showNumber(n)).toBe(String(n));
    }
  });

  it("shows the fixed phrase for anything else", () => {
    for (const n of [10000, 19800101, -1, -1234567, 1.5, Number.NaN, Number.POSITIVE_INFINITY]) {
      expect(isShownNumber(n), String(n)).toBe(false);
      expect(showNumber(n)).toBe(UNSHOWN);
    }
  });
});

describe("every text that shows a profile number, word for word", () => {
  it("a finding locus", () => {
    expect(describeLocus({ segment: "PID" })).toBe("PID");
    expect(describeLocus({ segment: "PID", field: 5, component: 2 })).toBe("PID-5 component 2");
    expect(describeLocus({ segment: "PID", field: 10000, component: 10000 })).toBe(
      `PID-${UNSHOWN} component ${UNSHOWN}`,
    );
  });

  it("a cardinality finding names only the bounds the profile declares", () => {
    const at = { segment: "PID" };
    expect(cardinality(at, 2, { max: 1 }, "occurrence", "error").message).toBe(
      "PID has 2 occurrence(s), outside the declared cardinality (max 1).",
    );
    expect(cardinality(at, 0, { min: 1 }, "occurrence", "error").message).toBe(
      "PID has 0 occurrence(s), outside the declared cardinality (min 1).",
    );
    expect(cardinality(at, 4, { min: 2, max: 3 }, "repetition", "error").message).toBe(
      "PID has 4 repetition(s), outside the declared cardinality (min 2, max 3).",
    );
    expect(cardinality(at, 1, { min: 2, max: "*" }, "occurrence", "error").message).toBe(
      "PID has 1 occurrence(s), outside the declared cardinality (min 2, max *).",
    );
    expect(cardinality(at, 1, { min: 10000, max: 10001 }, "occurrence", "error").message).toBe(
      `PID has 1 occurrence(s), outside the declared cardinality (min ${UNSHOWN}, max ${UNSHOWN}).`,
    );
  });

  it("a length finding", () => {
    const at = { segment: "PID", field: 9 };
    expect(length(at, 12, 10, "error").message).toBe(
      "PID-9 value length 12 exceeds the declared maximum of 10.",
    );
    expect(length(at, 10001, 10000, "error").message).toBe(
      `PID-9 value length 10001 exceeds the declared maximum of ${UNSHOWN}.`,
    );
  });

  it("a predicate location", () => {
    expect(describeLocation({ segment: "PID" })).toBe("PID");
    expect(describeLocation({ segment: "PID", field: 5 })).toBe("PID-5");
    expect(describeLocation({ segment: "PID", field: 5, component: 1 })).toBe("PID-5 component 1");
    expect(describeLocation({ segment: "PID", field: 5, component: 1, subcomponent: 2 })).toBe(
      "PID-5 component 1 subcomponent 2",
    );
    expect(
      describeLocation({ segment: "PID", field: 10000, component: 10000, subcomponent: 10000 }),
    ).toBe(`PID-${UNSHOWN} component ${UNSHOWN} subcomponent ${UNSHOWN}`);
  });

  it("a usage and cardinality conflict", () => {
    expect(
      details({ name: "p", segments: [{ segment: "PID", usage: "O", cardinality: { min: 2 } }] }),
    ).toEqual([
      'segment "PID" declares a usage other than R with cardinality.min 2. ' +
        "A usage other than R takes a minimum cardinality of 0. The one exception is RE, which may carry a minimum greater than 0 to say that the element is not always present but has that many occurrences when it is.",
    ]);
    const notSupported =
      "A not-supported element admits the cardinality [0..0] and no other, so its maximum must be 0 or left undeclared.";
    expect(
      details({ name: "p", segments: [{ segment: "PID", usage: "X", cardinality: { max: 3 } }] }),
    ).toEqual([`segment "PID" declares usage X with cardinality.max 3. ${notSupported}`]);
    expect(
      details({ name: "p", segments: [{ segment: "PID", usage: "X", cardinality: { max: "*" } }] }),
    ).toEqual([`segment "PID" declares usage X with cardinality.max *. ${notSupported}`]);
    expect(
      details({
        name: "p",
        segments: [{ segment: "PID", usage: "X", cardinality: { max: 10000 } }],
      }),
    ).toEqual([`segment "PID" declares usage X with cardinality.max ${UNSHOWN}. ${notSupported}`]);
  });

  it("a resolution target names its field when it has one", () => {
    const raw = "MSH|^~\\&|A|B|C|D|20260101||ADT^A01|M1|P|2.5\rPID|1";
    const profile = { name: "p", segments: [{ segment: "PID", usage: "C(R/X)" }] };
    const run = (resolutions: unknown): string[] =>
      validateAgainstProfile(
        parseHL7(raw),
        profile as ConformanceProfile,
        resolutions as readonly UsageResolution[],
      ).findings.map((f) => f.message);
    expect(run([{ segment: "PID", field: 5, outcome: true }])).toEqual([
      'Malformed conformance profile: resolution for segment "PID" field 5 matches no rule the profile declares.',
    ]);
    expect(run([{ segment: "PID", field: 10000, outcome: true }])).toEqual([
      `Malformed conformance profile: resolution for segment "PID" field ${UNSHOWN} matches no rule the profile declares.`,
    ]);
  });
});
