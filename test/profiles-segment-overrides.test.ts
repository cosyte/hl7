/**
 * `segmentOverrides`: profile-declared field NAMES on STANDARD HL7 v2 segments.
 *
 * The feature is a read-side alias and nothing else, so the test that matters
 * most here is not one of the resolution tests: it is the PARSE-TWICE
 * comparison, which parses one raw message with a profile carrying overrides
 * and again with the same profile stripped of them, and asserts every other
 * observable is equal. HL7 v2 traffic is PHI, and the failure this feature
 * could introduce is a downstream consumer calling the accessor it always
 * called and receiving a different clinical value with no warning and no diff
 * to notice. Equality across positional reads, dot-paths, warnings, the typed
 * clinical accessors and both serializations is what says that cannot happen.
 */

import { describe, expect, it } from "vitest";

import { parseHL7, ProfileDefinitionError, WARNING_CODES } from "../src/index.js";
import type { CustomSegmentDefinition, Profile } from "../src/parser/types.js";
import { defineProfile, type DefineProfileOptions } from "../src/profiles/define.js";

const BASE_MSH = "MSH|^~\\&|SENDAPP|SENDFAC|RCVAPP|RCVFAC|20250101120000||ADT^A01|MSG001|P|2.5\r";

/**
 * Assemble a segment line from an index → value map, so a fixture states the
 * HL7 POSITION it means rather than a run of pipes a reader has to count. The
 * whole point of an override is which position it binds, and a fixture that is
 * one pipe out would make a wrong binding look right.
 */
function segment(name: string, byPosition: Readonly<Record<number, string>>): string {
  const highest = Math.max(...Object.keys(byPosition).map(Number));
  const fields = new Array<string>(highest + 1).fill("");
  fields[0] = name;
  for (const [pos, value] of Object.entries(byPosition)) fields[Number(pos)] = value;
  return fields.join("|") + "\r";
}

/** The second MRN this site stuffs into PID-19, the field this feature exists to name. */
const SITE_MRN = "SITE-MRN-99";

/**
 * A clinically busy ADT: demographics with a second MRN in PID-19, an allergy
 * with a local severity in AL1-4, an immunization with a site dose qualifier
 * in RXA-6, and an observation. Every typed clinical accessor the additive-only
 * comparison checks has something to read here, so an equality assertion over
 * them is a real comparison rather than two empty arrays agreeing.
 */
const CLINICAL_MESSAGE =
  BASE_MSH +
  "EVN|A01|20250101120000\r" +
  segment("PID", {
    1: "1",
    3: "MRN123^^^SITE^MR",
    5: "DOE^JANE^Q",
    7: "19800101",
    8: "F",
    11: "1 MAIN ST^^SPRINGFIELD^IL^62704",
    13: "(555)555-0100",
    19: SITE_MRN,
  }) +
  segment("PV1", { 1: "1", 2: "I", 3: "WARD^101^A", 19: "VISIT9" }) +
  "AL1|1|DA|^PENICILLIN|SV-LOCAL-3|HIVES|20240101\r" +
  "RXA|0|1|20250101120000||88^INFLUENZA^CVX|0.5|mL^^UCUM\r" +
  "OBX|1|NM|1234-5^GLUCOSE^LN||99|mg/dL|70-110|H|||F\r";

/** The overrides under test: three site-specific names on three standard segments. */
const SITE_OVERRIDES: Readonly<Record<string, CustomSegmentDefinition>> = {
  PID: { fields: { siteMrn: 19 } },
  AL1: { fields: { localSeverityCode: 4 } },
  RXA: { fields: { doseQualifier: 6 } },
};

describe("AC-1: a declared name resolves to the position the positional accessor reads", () => {
  it("resolves on every parsed segment of the declared type", () => {
    const profile = defineProfile({ name: "site", segmentOverrides: SITE_OVERRIDES });
    const raw = BASE_MSH + "AL1|1|DA|^PENICILLIN|SEV-3\rAL1|2|DA|^SULFA|SEV-1\r";
    const msg = parseHL7(raw, profile);
    const al1s = msg.segments("AL1");
    expect(al1s).toHaveLength(2);
    for (const al1 of al1s) {
      expect(al1.get("localSeverityCode")?.value).toBe(al1.field(4).value);
    }
    expect(al1s[0]?.get("localSeverityCode")?.value).toBe("SEV-3");
    expect(al1s[1]?.get("localSeverityCode")?.value).toBe("SEV-1");
  });

  it("agrees with field(n) on a busy clinical message, name by name", () => {
    const profile = defineProfile({ name: "site", segmentOverrides: SITE_OVERRIDES });
    const msg = parseHL7(CLINICAL_MESSAGE, profile);
    expect(msg.segments("PID")[0]?.get("siteMrn")?.value).toBe(SITE_MRN);
    expect(msg.segments("PID")[0]?.get("siteMrn")?.value).toBe(
      msg.segments("PID")[0]?.field(19).value,
    );
    expect(msg.segments("RXA")[0]?.get("doseQualifier")?.value).toBe("0.5");
    expect(msg.segments("RXA")[0]?.get("doseQualifier")?.value).toBe(
      msg.segments("RXA")[0]?.field(6).value,
    );
  });

  it("resolves through part(), parts(), getAll() and the allSegments() walk alike", () => {
    const profile = defineProfile({ name: "site", segmentOverrides: SITE_OVERRIDES });
    const msg = parseHL7(CLINICAL_MESSAGE, profile);
    expect(msg.part("PID")?.get("siteMrn")?.value).toBe(SITE_MRN);
    expect(msg.parts("PID")[0]?.get("siteMrn")?.value).toBe(SITE_MRN);
    expect(msg.getAll("PID")[0]?.get("siteMrn")?.value).toBe(SITE_MRN);
    const walked = msg.allSegments().find((s) => s.type === "PID");
    expect(walked?.get("siteMrn")?.value).toBe(SITE_MRN);
  });

  it("resolves on a miscased wire segment name, as the positional accessor does", () => {
    // The sender ships `pid`; the declaration is canonical. Folding the name is
    // what makes `msg.segments("PID")` find the segment at all, and the field
    // map has to follow the segment or a claimed segment misses its own names.
    const profile = defineProfile({ name: "site", segmentOverrides: SITE_OVERRIDES });
    const raw = BASE_MSH + segment("pid", { 1: "1", 3: "MRN123", 19: SITE_MRN });
    const msg = parseHL7(raw, profile);
    expect(msg.segments("PID")[0]?.get("siteMrn")?.value).toBe(SITE_MRN);
  });

  it("resolves for a hand-rolled Profile literal keyed in the sender's own case", () => {
    // A `Profile` literal never passes through `defineProfile`, so it is the one
    // route to a lowercase key. The wire-spelling fallback in the lookup is what
    // keeps such a caller working.
    const profile: Profile = {
      name: "hand-rolled",
      segmentOverrides: { pid: { fields: { siteMrn: 19 } } },
    };
    const raw = BASE_MSH + segment("pid", { 1: "1", 3: "MRN123", 19: SITE_MRN });
    const msg = parseHL7(raw, profile);
    expect(msg.segments("PID")[0]?.get("siteMrn")?.value).toBe(SITE_MRN);
  });
});

describe("AC-2: inheritance across extends", () => {
  it("child wins at a position both declare; parent survives elsewhere", () => {
    const parent = defineProfile({
      name: "parent",
      segmentOverrides: { PID: { fields: { parentAlias: 19, countyCode: 12 } } },
    });
    const child = defineProfile({
      name: "child",
      extends: parent,
      segmentOverrides: { PID: { fields: { childAlias: 19 } } },
    });
    expect(child.segmentOverrides).toEqual({
      PID: { fields: { childAlias: 19, countyCode: 12 } },
    });

    const raw = BASE_MSH + segment("PID", { 1: "1", 3: "MRN123", 12: "COUNTY7", 19: SITE_MRN });
    const msg = parseHL7(raw, child);
    const pid = msg.segments("PID")[0];
    expect(pid?.get("childAlias")?.value).toBe(SITE_MRN);
    expect(pid?.get("countyCode")?.value).toBe("COUNTY7");
    // The parent's name at the position the child re-declared is gone: one
    // position, one name, exactly as the custom-segment map merges.
    expect(pid?.get("parentAlias")).toBeUndefined();
  });

  it("merges across several parents, and a parent's other segment types survive", () => {
    const a = defineProfile({
      name: "a",
      segmentOverrides: { PID: { fields: { fromA: 19 } }, AL1: { fields: { severity: 4 } } },
    });
    const b = defineProfile({ name: "b", segmentOverrides: { PID: { fields: { fromB: 12 } } } });
    const merged = defineProfile({ name: "merged", extends: [a, b] });
    expect(merged.segmentOverrides).toEqual({
      PID: { fields: { fromA: 19, fromB: 12 } },
      AL1: { fields: { severity: 4 } },
    });
    expect(merged.lineage).toEqual(["a", "b", "merged"]);
  });

  it("a child declaring no overrides inherits the parent's whole map", () => {
    const parent = defineProfile({
      name: "parent",
      segmentOverrides: { PID: { fields: { siteMrn: 19 } } },
    });
    const child = defineProfile({ name: "child", extends: parent });
    const msg = parseHL7(CLINICAL_MESSAGE, child);
    expect(msg.segments("PID")[0]?.get("siteMrn")?.value).toBe(SITE_MRN);
  });

  it("re-validates after merge: a rogue parent's bad key is refused at the child", () => {
    // A hand-crafted parent bypasses the parent-side validation, so the
    // post-merge pass is the one that has to catch it.
    const roguePparent = {
      name: "rogue",
      segmentOverrides: { ZZZ: { fields: { a: 1 } } },
    } as unknown as Profile;
    expect(() => defineProfile({ name: "child", extends: roguePparent })).toThrow(
      ProfileDefinitionError,
    );
  });

  it("the two maps stay separate through a merge that carries both", () => {
    const parent = defineProfile({
      name: "parent",
      customSegments: { ZPI: { fields: { encounterId: 3 } } },
      segmentOverrides: { PID: { fields: { siteMrn: 19 } } },
    });
    const child = defineProfile({
      name: "child",
      extends: parent,
      customSegments: { ZPI: { fields: { visitType: 5 } } },
      segmentOverrides: { AL1: { fields: { severity: 4 } } },
    });
    expect(Object.keys(child.customSegments)).toEqual(["ZPI"]);
    expect(Object.keys(child.segmentOverrides ?? {})).toEqual(["PID", "AL1"]);
    expect(child.customSegments["ZPI"]?.fields).toEqual({ encounterId: 3, visitType: 5 });
  });
});

describe("AC-3: an undeclared name is reported as not declared", () => {
  it("returns undefined for a name the profile does not bind on that segment type", () => {
    const profile = defineProfile({ name: "site", segmentOverrides: SITE_OVERRIDES });
    const msg = parseHL7(CLINICAL_MESSAGE, profile);
    expect(msg.segments("PID")[0]?.get("noSuchName")).toBeUndefined();
  });

  it("does not leak a name across segment types", () => {
    // `localSeverityCode` is declared for AL1, not for PID. A name resolved
    // against the wrong segment is a wrong position, not a missing one.
    const profile = defineProfile({ name: "site", segmentOverrides: SITE_OVERRIDES });
    const msg = parseHL7(CLINICAL_MESSAGE, profile);
    expect(msg.segments("PID")[0]?.get("localSeverityCode")).toBeUndefined();
    expect(msg.segments("AL1")[0]?.get("siteMrn")).toBeUndefined();
  });

  it("returns undefined on a segment type the override map does not mention", () => {
    const profile = defineProfile({ name: "site", segmentOverrides: SITE_OVERRIDES });
    const msg = parseHL7(CLINICAL_MESSAGE, profile);
    expect(msg.segments("OBX")[0]?.get("siteMrn")).toBeUndefined();
    expect(msg.segments("PV1")[0]?.get("localSeverityCode")).toBeUndefined();
  });

  it("holds identically when no profile was applied at all", () => {
    const msg = parseHL7(CLINICAL_MESSAGE);
    expect(msg.segments("PID")[0]?.get("siteMrn")).toBeUndefined();
    expect(msg.segments("AL1")[0]?.get("localSeverityCode")).toBeUndefined();
    expect(msg.segments("RXA")[0]?.get("doseQualifier")).toBeUndefined();
  });

  it("holds identically when the profile opts out for the call", () => {
    const msg = parseHL7(CLINICAL_MESSAGE, { profile: null });
    expect(msg.segments("PID")[0]?.get("siteMrn")).toBeUndefined();
  });
});

describe("AC-4: a declared position the message does not carry reports absence", () => {
  it("returns undefined, not an empty string, when the segment is short", () => {
    const profile = defineProfile({ name: "site", segmentOverrides: SITE_OVERRIDES });
    const raw = BASE_MSH + "PID|1||MRN123\r";
    const msg = parseHL7(raw, profile);
    const got = msg.segments("PID")[0]?.get("siteMrn");
    expect(got).toBeUndefined();
    // The distinction that matters: `undefined` is not a Field whose value is "".
    expect(got?.value).not.toBe("");
  });

  it("returns undefined when the declared position is empty between delimiters", () => {
    const profile = defineProfile({ name: "site", segmentOverrides: SITE_OVERRIDES });
    const raw = BASE_MSH + segment("PID", { 1: "1", 3: "MRN123", 19: "", 20: "AFTER" });
    const msg = parseHL7(raw, profile);
    expect(msg.segments("PID")[0]?.field(19).value).toBe("");
    expect(msg.segments("PID")[0]?.get("siteMrn")).toBeUndefined();
  });

  it("returns the explicit HL7 null field rather than absence", () => {
    // `""` is a value the sender chose to send: "this field is deliberately
    // empty". It is a different fact from a position the message never carried,
    // and the named accessor keeps them apart exactly as `field(n)` does.
    const profile = defineProfile({ name: "site", segmentOverrides: SITE_OVERRIDES });
    const raw = BASE_MSH + segment("PID", { 1: "1", 3: "MRN123", 19: '""' });
    const msg = parseHL7(raw, profile);
    const got = msg.segments("PID")[0]?.get("siteMrn");
    expect(got).toBeDefined();
    expect(got?.isNull).toBe(true);
  });

  it("returns undefined for a position far past the end of the segment", () => {
    const profile = defineProfile({
      name: "site",
      segmentOverrides: { PID: { fields: { q: 99 } } },
    });
    const msg = parseHL7(CLINICAL_MESSAGE, profile);
    expect(msg.segments("PID")[0]?.get("q")).toBeUndefined();
  });
});

describe("AC-5: additive only, proved by parsing one message twice", () => {
  /** The same profile, once with the overrides and once with them stripped. */
  const withOverrides = defineProfile({
    name: "site",
    description: "site-specific field names",
    dateFormats: ["MM/DD/YYYY"],
    customSegments: { ZPI: { fields: { encounterId: 3 } } },
    segmentOverrides: SITE_OVERRIDES,
  });
  const withoutOverrides = defineProfile({
    name: "site",
    description: "site-specific field names",
    dateFormats: ["MM/DD/YYYY"],
    customSegments: { ZPI: { fields: { encounterId: 3 } } },
  });

  const raw = CLINICAL_MESSAGE + "ZPI|||ENC123\rZZZ|unknown\r";
  const a = parseHL7(raw, withOverrides);
  const b = parseHL7(raw, withoutOverrides);

  it("every segment's positional field values are equal", () => {
    const positional = (msg: typeof a): unknown =>
      msg.allSegments().map((seg) => ({
        type: seg.type,
        rawName: seg.raw.name,
        values: seg.fields.map((_, i) => seg.field(seg.type === "MSH" ? i + 1 : i).value),
      }));
    expect(positional(a)).toEqual(positional(b));
  });

  it("dot-path lookups are equal, including the overridden positions themselves", () => {
    const paths = [
      "MSH.3",
      "MSH.7",
      "MSH.9",
      "MSH.12",
      "PID.3.1",
      "PID.5.1",
      "PID.5.2",
      "PID.11.3",
      "PID.19",
      "PV1.3.1",
      "PV1.19",
      "AL1.3.2",
      "AL1.4",
      "AL1.5",
      "RXA.5.2",
      "RXA.6",
      "OBX.3.2",
      "OBX.5",
      "OBX.8",
      "ZPI.3",
      // A path that resolves to nothing must keep resolving to nothing.
      "PID.99",
      "NOT.9.9",
    ];
    for (const path of paths) {
      expect([path, a.get(path)]).toEqual([path, b.get(path)]);
    }
    // Not vacuous: at least the overridden position itself carries a value.
    expect(a.get("PID.19")).toBe(SITE_MRN);
  });

  it("a declared NAME is still not a dot-path, and refuses identically either way", () => {
    // Dot-paths stay positional. The override map is reachable through the
    // named accessor and through nothing else, so `msg.get("PID.siteMrn")`
    // is the same syntax error it always was.
    expect(() => a.get("PID.siteMrn")).toThrow(TypeError);
    expect(() => b.get("PID.siteMrn")).toThrow(TypeError);
  });

  it("the warning list is equal, code and position alike", () => {
    expect(a.warnings.map((w) => ({ code: w.code, position: w.position }))).toEqual(
      b.warnings.map((w) => ({ code: w.code, position: w.position })),
    );
    // Not vacuous: this message carries an undeclared ZZZ.
    expect(a.warnings.length).toBeGreaterThan(0);
  });

  it("the typed clinical accessors return equal output", () => {
    expect(a.patient).toEqual(b.patient);
    expect(a.visit).toEqual(b.visit);
    expect(a.allergies()).toEqual(b.allergies());
    expect(a.medications()).toEqual(b.medications());
    expect(a.observations()).toEqual(b.observations());
    expect(a.meta).toEqual(b.meta);
    // Not vacuous: the fixture carries demographics, an allergy and a result.
    expect(a.patient?.mrn).toBe("MRN123");
    expect(a.allergies()).toHaveLength(1);
    expect(a.observations()).toHaveLength(1);
  });

  it("the typed clinical accessors keep reading the HL7-standard positions", () => {
    // The override binds PID-19 (the site's second MRN). `patient.mrn` must
    // still read PID-3, because re-pointing a clinical helper is precisely the
    // wrong-value-no-warning failure this design refuses.
    expect(a.patient?.mrn).toBe("MRN123");
    expect(a.patient?.mrn).not.toBe(SITE_MRN);
    expect(a.allergies()[0]?.severity).toBe(b.allergies()[0]?.severity);
  });

  it("the JSON serialization is equal", () => {
    expect(a.toJSON()).toEqual(b.toJSON());
    expect(JSON.stringify(a.toJSON())).toBe(JSON.stringify(b.toJSON()));
  });

  it("the string serialization is byte-exact equal, and still round-trips", () => {
    expect(a.toString()).toBe(b.toString());
    expect(a.toString()).toBe(raw);
  });

  it("the pretty-printed form is equal", () => {
    expect(a.prettyPrint()).toBe(b.prettyPrint());
  });

  it("a message parsed with NO profile reads the same positions too", () => {
    const bare = parseHL7(raw);
    expect(a.patient).toEqual(bare.patient);
    expect(a.toString()).toBe(bare.toString());
    expect(a.allSegments().map((s) => s.field(19).value)).toEqual(
      bare.allSegments().map((s) => s.field(19).value),
    );
  });

  it("the Z-segment's own named reads are untouched by the presence of overrides", () => {
    expect(a.segments("ZPI")[0]?.get("encounterId")?.value).toBe("ENC123");
    expect(b.segments("ZPI")[0]?.get("encounterId")?.value).toBe("ENC123");
  });

  it("the overrides are what the two parses actually differ by", () => {
    // Guards the comparison itself: if the feature silently did nothing, every
    // assertion above would pass for the wrong reason.
    expect(a.segments("PID")[0]?.get("siteMrn")?.value).toBe(SITE_MRN);
    expect(b.segments("PID")[0]?.get("siteMrn")).toBeUndefined();
  });
});

describe("AC-6: MSH numbering follows the positional accessor", () => {
  it("a binding at 1 is the field separator and a binding at 3 is MSH-3", () => {
    const profile = defineProfile({
      name: "msh-site",
      segmentOverrides: { MSH: { fields: { separator: 1, sendingApp: 3, controlId: 10 } } },
    });
    const msg = parseHL7(CLINICAL_MESSAGE, profile);
    const msh = msg.segments("MSH")[0];
    expect(msh?.get("separator")?.value).toBe("|");
    expect(msh?.get("separator")?.value).toBe(msh?.field(1).value);
    expect(msh?.get("sendingApp")?.value).toBe("SENDAPP");
    expect(msh?.get("sendingApp")?.value).toBe(msh?.field(3).value);
    expect(msh?.get("controlId")?.value).toBe("MSG001");
    expect(msh?.get("controlId")?.value).toBe(msh?.field(10).value);
    // And it agrees with the dot-path resolver, which is the third reader of
    // the same convention.
    expect(msh?.get("sendingApp")?.value).toBe(msg.get("MSH.3"));
  });
});

describe("AC-7: a Z-segment key is refused and pointed at customSegments", () => {
  it("throws ProfileDefinitionError naming the profile, the key and the right option", () => {
    expect.assertions(6);
    try {
      defineProfile({ name: "wrong-map", segmentOverrides: { ZPI: { fields: { a: 3 } } } });
    } catch (err) {
      expect(err).toBeInstanceOf(ProfileDefinitionError);
      if (err instanceof ProfileDefinitionError) {
        expect(err.message).toContain("wrong-map");
        expect(err.message).toContain("ZPI");
        expect(err.message).toContain("segmentOverrides");
        expect(err.message).toContain("customSegments");
        expect(err.profileName).toBe("wrong-map");
      }
    }
  });

  it("returns no profile object", () => {
    let built: unknown = "untouched";
    expect(() => {
      built = defineProfile({ name: "wrong-map", segmentOverrides: { ZX9: { fields: { a: 1 } } } });
    }).toThrow(ProfileDefinitionError);
    expect(built).toBe("untouched");
  });

  it("refuses a Z-segment inherited from a parent, at merge time", () => {
    const rogue = {
      name: "rogue",
      segmentOverrides: { ZPI: { fields: { a: 3 } } },
    } as unknown as Profile;
    expect(() => defineProfile({ name: "child", extends: rogue })).toThrow(/that is a Z-segment/u);
  });
});

describe("AC-8: an unrecognized segment name is refused", () => {
  it("throws naming the profile and the offending key", () => {
    expect.assertions(4);
    try {
      defineProfile({ name: "bad-key", segmentOverrides: { QQQ: { fields: { a: 1 } } } });
    } catch (err) {
      expect(err).toBeInstanceOf(ProfileDefinitionError);
      if (err instanceof ProfileDefinitionError) {
        expect(err.message).toContain("bad-key");
        expect(err.message).toContain("QQQ");
        expect(err.message).toContain("not a standard HL7 v2");
      }
    }
  });

  it("suggests the canonical spelling when only the case is wrong", () => {
    expect(() =>
      defineProfile({ name: "lower", segmentOverrides: { pid: { fields: { a: 1 } } } }),
    ).toThrow(/Did you mean 'PID'\?/u);
  });

  it("offers no suggestion when the name resolves to nothing at all", () => {
    try {
      defineProfile({ name: "bad-key", segmentOverrides: { QQQ: { fields: { a: 1 } } } });
      expect.unreachable("should have thrown");
    } catch (err) {
      expect((err as ProfileDefinitionError).message).not.toContain("Did you mean");
    }
  });

  it("refuses an empty key and a key of the wrong length", () => {
    expect(() =>
      defineProfile({ name: "bad-key", segmentOverrides: { "": { fields: { a: 1 } } } }),
    ).toThrow(ProfileDefinitionError);
    expect(() =>
      defineProfile({ name: "bad-key", segmentOverrides: { PIDX: { fields: { a: 1 } } } }),
    ).toThrow(ProfileDefinitionError);
  });

  it("returns no profile object", () => {
    let built: unknown = "untouched";
    expect(() => {
      built = defineProfile({ name: "bad-key", segmentOverrides: { QQQ: { fields: { a: 1 } } } });
    }).toThrow(ProfileDefinitionError);
    expect(built).toBe("untouched");
  });
});

describe("AC-9: a position that is not a positive integer is refused", () => {
  const badPositions: readonly [string, unknown][] = [
    ["zero", 0],
    ["negative", -1],
    ["fraction", 2.5],
    ["string", "3"],
    ["null", null],
    ["undefined", undefined],
    ["NaN", Number.NaN],
    ["Infinity", Number.POSITIVE_INFINITY],
  ];

  for (const [label, pos] of badPositions) {
    it(`refuses a ${label} position, naming profile, segment and field`, () => {
      expect.assertions(4);
      try {
        defineProfile({
          name: "bad-pos",
          segmentOverrides: {
            PID: { fields: { siteMrn: pos } } as unknown as CustomSegmentDefinition,
          },
        });
      } catch (err) {
        expect(err).toBeInstanceOf(ProfileDefinitionError);
        if (err instanceof ProfileDefinitionError) {
          expect(err.message).toContain("bad-pos");
          expect(err.message).toContain("PID");
          expect(err.message).toContain("siteMrn");
        }
      }
    });
  }

  it("refuses an entry that is not an object with a fields map", () => {
    expect(() =>
      defineProfile({
        name: "bad-entry",
        segmentOverrides: { PID: {} as unknown as CustomSegmentDefinition },
      }),
    ).toThrow(/must be an object with a 'fields' map/u);
    expect(() =>
      defineProfile({
        name: "bad-entry",
        segmentOverrides: { PID: null as unknown as CustomSegmentDefinition },
      }),
    ).toThrow(/must be an object with a 'fields' map/u);
  });

  it("returns no profile object", () => {
    let built: unknown = "untouched";
    expect(() => {
      built = defineProfile({
        name: "bad-pos",
        segmentOverrides: { PID: { fields: { siteMrn: 0 } } },
      });
    }).toThrow(ProfileDefinitionError);
    expect(built).toBe("untouched");
  });
});

describe("AC-10: an empty declaration is accepted and does nothing", () => {
  it("an empty override map behaves as no override map at all", () => {
    const empty = defineProfile({ name: "same", segmentOverrides: {} });
    const none = defineProfile({ name: "same" });
    expect(empty.segmentOverrides).toEqual({});
    expect(empty.segmentOverrides).toEqual(none.segmentOverrides);

    const withEmpty = parseHL7(CLINICAL_MESSAGE, empty);
    const withNone = parseHL7(CLINICAL_MESSAGE, none);
    expect(withEmpty.warnings).toEqual(withNone.warnings);
    expect(withEmpty.toString()).toBe(withNone.toString());
    expect(withEmpty.toJSON()).toEqual(withNone.toJSON());
    expect(withEmpty.segments("PID")[0]?.get("siteMrn")).toBeUndefined();
  });

  it("a declared segment with an empty field map resolves no name and warns not at all", () => {
    const profile = defineProfile({
      name: "empty-fields",
      segmentOverrides: { PID: { fields: {} } },
    });
    const msg = parseHL7(CLINICAL_MESSAGE, profile);
    expect(msg.segments("PID")[0]?.get("siteMrn")).toBeUndefined();
    expect(msg.segments("PID")[0]?.get("anything")).toBeUndefined();
    expect(msg.warnings.map((w) => w.code)).not.toContain(WARNING_CODES.UNKNOWN_SEGMENT);
    expect(msg.toString()).toBe(CLINICAL_MESSAGE);
  });
});

describe("AC-11: a misspelled option key is refused with the right suggestion", () => {
  const typos = ["segmentOverride", "segmentOverides", "segmentOverrid", "segmentOverridess"];

  for (const typo of typos) {
    it(`names 'segmentOverrides' as the suggestion for '${typo}'`, () => {
      expect.assertions(4);
      try {
        // A computed key is the only way to write a MISSPELLED option key that
        // still satisfies the options interface: spelled literally it would be
        // an excess-property error, and the runtime refusal is the thing under
        // test here rather than the compiler's.
        defineProfile({ name: "typo", [typo]: { PID: { fields: { a: 1 } } } });
      } catch (err) {
        expect(err).toBeInstanceOf(ProfileDefinitionError);
        if (err instanceof ProfileDefinitionError) {
          expect(err.message).toContain(typo);
          expect(err.message).toContain("Did you mean 'segmentOverrides'?");
          expect(err.message).toContain("segmentOverrides");
        }
      }
    });
  }

  it("lists the new key among the known keys it reports", () => {
    expect(() =>
      defineProfile({ name: "typo", totallyMadeUp: 1 } as unknown as DefineProfileOptions),
    ).toThrow(/Known keys:.*segmentOverrides/u);
  });
});

describe("AC-12: unknown-segment warnings are unmoved by an override map", () => {
  it("an undeclared Z-segment still warns", () => {
    const profile = defineProfile({ name: "site", segmentOverrides: SITE_OVERRIDES });
    const raw = BASE_MSH + "PID|1||MRN123\rZZZ|foo\r";
    const msg = parseHL7(raw, profile);
    const zzz = msg.warnings.filter((w) => w.code === WARNING_CODES.UNKNOWN_SEGMENT);
    expect(zzz).toHaveLength(1);
    expect(zzz[0]?.position.segmentIndex).toBe(2);
  });

  it("no standard segment named only in the override map warns", () => {
    const profile = defineProfile({ name: "site", segmentOverrides: SITE_OVERRIDES });
    const msg = parseHL7(CLINICAL_MESSAGE, profile);
    expect(msg.warnings.map((w) => w.code)).not.toContain(WARNING_CODES.UNKNOWN_SEGMENT);
  });

  it("an override on a standard segment does not claim it the way customSegments claims a Z", () => {
    // The two maps answer different questions and this pins that they stay
    // apart: the override map feeds name resolution only, never the
    // profile-claim check that suppresses UNKNOWN_SEGMENT.
    const profile = defineProfile({
      name: "site",
      customSegments: { ZPI: { fields: { encounterId: 3 } } },
      segmentOverrides: SITE_OVERRIDES,
    });
    const raw = BASE_MSH + "PID|1||MRN123\rZPI|||ENC\rZZZ|foo\r";
    const withOverrides = parseHL7(raw, profile);
    const withoutOverrides = parseHL7(
      raw,
      defineProfile({ name: "site", customSegments: { ZPI: { fields: { encounterId: 3 } } } }),
    );
    expect(withOverrides.warnings.map((w) => ({ code: w.code, position: w.position }))).toEqual(
      withoutOverrides.warnings.map((w) => ({ code: w.code, position: w.position })),
    );
  });

  it("strict mode throws on exactly the same input it threw on before", () => {
    const profile = defineProfile({ name: "site", segmentOverrides: SITE_OVERRIDES });
    const raw = BASE_MSH + "PID|1||MRN123\rZZZ|foo\r";
    expect(() => parseHL7(raw, { strict: true, profile })).toThrow();
    // And it does NOT throw on a message whose only unusual segments are the
    // standard ones the override map names.
    expect(() => parseHL7(CLINICAL_MESSAGE, { strict: true, profile })).not.toThrow();
  });
});

describe("AC-13: describe() reports the overrides, distinguishably", () => {
  it("names the overridden standard segments under their own label", () => {
    const profile = defineProfile({
      name: "site",
      customSegments: { ZPI: { fields: { encounterId: 3 } } },
      segmentOverrides: SITE_OVERRIDES,
    });
    const text = profile.describe?.() ?? "";
    expect(text).toContain("segmentOverrides: 3 (PID, AL1, RXA)");
    expect(text).toContain("customSegments: 1 (ZPI)");
    // Distinguishable: the Z-segment name appears on the custom line and not
    // on the override line, and vice versa.
    const overrideLine = text.split("\n").find((l) => l.includes("segmentOverrides:")) ?? "";
    const customLine = text.split("\n").find((l) => l.trim().startsWith("customSegments:")) ?? "";
    expect(overrideLine).not.toContain("ZPI");
    expect(customLine).not.toContain("PID");
  });

  it("reports a count of zero when no override is declared", () => {
    const profile = defineProfile({ name: "plain" });
    expect(profile.describe?.()).toContain("segmentOverrides: 0");
  });

  it("reports the merged map, not just the profile's own declarations", () => {
    const parent = defineProfile({
      name: "parent",
      segmentOverrides: { PID: { fields: { fromParent: 19 } } },
    });
    const child = defineProfile({
      name: "child",
      extends: parent,
      segmentOverrides: { AL1: { fields: { severity: 4 } } },
    });
    expect(child.describe?.()).toContain("segmentOverrides: 2 (PID, AL1)");
  });
});
