/**
 * Typed custom-segment field names: both halves of the same contract.
 *
 * The RUNTIME half asserts that nothing moved. Every read below is the read the
 * library already performed: a declared name resolves to its declared position,
 * an undeclared name is `undefined`, and a declared name whose position is
 * absent from the wire message is `undefined` too. The four routes to a profile
 * (statically known, typed as the general interface, resolved from the default
 * registry, and none at all) are compared against each other value for value,
 * so a change in what a name resolves to fails here rather than on a report.
 *
 * The COMPILE-TIME half is written as `@ts-expect-error` directives, the way
 * this repo already grades closed unions. An UNUSED directive is itself an
 * error under this tsconfig, so `pnpm typecheck` fails if a rejection stops
 * happening: these lines cannot rot into decoration. They are graded by
 * `pnpm typecheck` (which includes `test/**` ), not by the runtime run.
 */

import { describe, expect, it } from "vitest";

import {
  defineProfile,
  getDefaultProfile,
  parseHL7,
  parseStream,
  profiles,
  setDefaultProfile,
  splitBatch,
  type Field,
  type Profile,
  type ProfileFieldName,
} from "../src/index.js";

const MSH = "MSH|^~\\&|SENDAPP|SENDFAC|RCVAPP|RCVFAC|20250101120000||ADT^A01|MSG001|P|2.5\r";

/** ZDP-3 and ZDP-4 carry values; ZDP-9 is declared below but absent here. */
const RAW = `${MSH}PID|||MRN001\rZDP|||CARDIOLOGY|Cardiology Department\rZRS|FINAL\r`;

/**
 * The profile under test. `absentName` is declared at a position the fixture
 * does not carry, which is what keeps the reader's return type honest.
 */
const vendor = defineProfile({
  name: "vendor",
  customSegments: {
    ZDP: { fields: { departmentCode: 3, departmentName: 4, absentName: 9 } },
    ZRS: { fields: { resultStatus: 1 } },
  },
});

describe("a declared name is accepted and resolves, on every keyed accessor", () => {
  it("resolves through part(), segments(), parts() and getAll()", () => {
    const msg = parseHL7(RAW, vendor);
    // No cast and no type assertion on any of these four lines.
    expect(msg.part("ZDP")?.get("departmentCode")?.value).toBe("CARDIOLOGY");
    expect(msg.segments("ZDP")[0]?.get("departmentName")?.value).toBe("Cardiology Department");
    expect(msg.parts("ZDP")[0]?.get("departmentCode")?.value).toBe("CARDIOLOGY");
    expect(msg.getAll("ZDP")[0]?.get("departmentName")?.value).toBe("Cardiology Department");
  });

  it("narrows per segment type, not across the profile", () => {
    const msg = parseHL7(RAW, vendor);
    expect(msg.part("ZRS")?.get("resultStatus")?.value).toBe("FINAL");
  });

  it("narrows a lowercase query, which the reader folds to the declared key", () => {
    const msg = parseHL7(`${MSH}zdp|||CARDIOLOGY\r`, vendor);
    expect(msg.part("zdp")?.get("departmentCode")?.value).toBe("CARDIOLOGY");
  });

  it("carries the declared names through the batch and stream entry points", async () => {
    const [entry] = splitBatch(RAW, vendor).messages;
    expect(entry?.ok === true && entry.message.part("ZDP")?.get("departmentCode")?.value).toBe(
      "CARDIOLOGY",
    );

    const seen: (string | undefined)[] = [];
    for await (const streamed of parseStream([RAW], vendor)) {
      if (streamed.ok) seen.push(streamed.message.part("ZDP")?.get("departmentCode")?.value);
    }
    expect(seen).toEqual(["CARDIOLOGY"]);
  });
});

describe("a name the profile does not declare for that type is rejected at compile time", () => {
  it("rejects a typo of a declared name", () => {
    const zdp = parseHL7(RAW, vendor).part("ZDP");
    // @ts-expect-error "departmentCod" is a typo, not a name this profile declares for ZDP.
    expect(zdp?.get("departmentCod")).toBeUndefined();
  });

  it("rejects a name declared for a DIFFERENT custom segment type", () => {
    const zdp = parseHL7(RAW, vendor).part("ZDP");
    // @ts-expect-error "resultStatus" is declared for ZRS, so it is not a ZDP name.
    expect(zdp?.get("resultStatus")).toBeUndefined();
    const zrs = parseHL7(RAW, vendor).part("ZRS");
    // @ts-expect-error "departmentCode" is declared for ZDP, so it is not a ZRS name.
    expect(zrs?.get("departmentCode")).toBeUndefined();
  });

  it("closes the name union at the type level, per segment type", () => {
    const declared: ProfileFieldName<typeof vendor, "ZDP"> = "departmentCode";
    expect(declared).toBe("departmentCode");
    // @ts-expect-error a ZRS name is not in the ZDP union: narrowing is per type.
    const sibling: ProfileFieldName<typeof vendor, "ZDP"> = "resultStatus";
    expect(sibling).toBe("resultStatus");
    // @ts-expect-error an undeclared name is in no union the profile produces.
    const unknown: ProfileFieldName<typeof vendor, "ZDP"> = "departmentCod";
    expect(unknown).toBe("departmentCod");
  });
});

describe("a declared name is not a promise that the message carried it", () => {
  it("types the result as the field wrapper unioned with undefined", () => {
    const zdp = parseHL7(RAW, vendor).part("ZDP");
    if (zdp === undefined) throw new Error("fixture must carry a ZDP segment");

    const optional: Field | undefined = zdp.get("departmentCode");
    expect(optional?.value).toBe("CARDIOLOGY");

    // @ts-expect-error a declared name stays optional: the position may be absent.
    const required: Field = zdp.get("departmentCode");
    expect(required.value).toBe("CARDIOLOGY");
  });

  it("returns undefined for a declared name whose position the message omits", () => {
    const zdp = parseHL7(RAW, vendor).part("ZDP");
    expect(zdp?.get("absentName")).toBeUndefined();
  });

  it("returns undefined for a name no applied profile declares", () => {
    // Reached through the undifferentiated walk, whose reader takes any string:
    // the same Segment instance, so this is the runtime answer for the narrowed
    // one too (the compile-time half of this fact is the directive above).
    const walked = parseHL7(RAW, vendor)
      .allSegments()
      .find((s) => s.type === "ZDP");
    expect(walked?.get("departmentCod")).toBeUndefined();
    expect(walked?.get("departmentCode")?.value).toBe("CARDIOLOGY");
  });
});

describe("the fallback is permissive wherever the declaration is not statically known", () => {
  it("accepts any string with no profile argument at all", () => {
    const msg = parseHL7(RAW);
    expect(msg.part("ZDP")?.get("departmentCode")).toBeUndefined();
    expect(msg.part("ZDP")?.get("anythingAtAll")).toBeUndefined();
  });

  it("accepts any string for a profile typed as the general interface", () => {
    const general: Profile = vendor;
    const msg = parseHL7(RAW, general);
    expect(msg.part("ZDP")?.get("departmentCode")?.value).toBe("CARDIOLOGY");
    expect(msg.part("ZDP")?.get("anythingAtAll")).toBeUndefined();
  });

  it("accepts any string when the profile came from the default registry", () => {
    setDefaultProfile(vendor);
    try {
      const msg = parseHL7(RAW);
      expect(msg.part("ZDP")?.get("departmentCode")?.value).toBe("CARDIOLOGY");
      expect(msg.part("ZDP")?.get("anythingAtAll")).toBeUndefined();
    } finally {
      setDefaultProfile(null);
    }
  });

  it("accepts any string for a segment type the profile does not declare", () => {
    const msg = parseHL7(RAW, vendor);
    expect(msg.part("PID")?.get("anythingAtAll")).toBeUndefined();
    expect(msg.part("ZZZ")?.get("anythingAtAll")).toBeUndefined();
  });

  it("accepts any string for a segment declared with an empty field map", () => {
    const empty = defineProfile({ name: "empty", customSegments: { ZDP: { fields: {} } } });
    const msg = parseHL7(RAW, empty);
    expect(msg.part("ZDP")?.get("anythingAtAll")).toBeUndefined();
  });

  it("accepts any string for a profile that declares no custom segments at all", () => {
    const bare = defineProfile({ name: "bare" });
    const msg = parseHL7(RAW, bare);
    expect(msg.part("ZDP")?.get("anythingAtAll")).toBeUndefined();
  });

  it("leaves the undifferentiated walk taking any string", () => {
    const walked = parseHL7(RAW, vendor)
      .allSegments()
      .find((s) => s.type === "ZDP");
    expect(walked?.get("anythingAtAll")).toBeUndefined();
  });

  it("keeps the general interface open at the type level", () => {
    const anyName: ProfileFieldName<Profile, "ZDP"> = "anythingAtAll";
    const undeclaredType: ProfileFieldName<typeof vendor, "ZZZ"> = "anythingAtAll";
    expect([anyName, undeclaredType]).toEqual(["anythingAtAll", "anythingAtAll"]);
  });
});

describe("the runtime answer is the same one, whichever route the profile took", () => {
  it("resolves every name identically with, without and around the narrowing", () => {
    const general: Profile = vendor;
    setDefaultProfile(vendor);
    let viaDefault;
    try {
      viaDefault = parseHL7(RAW);
    } finally {
      setDefaultProfile(null);
    }
    const routes = [
      parseHL7(RAW, vendor)
        .allSegments()
        .find((s) => s.type === "ZDP"),
      parseHL7(RAW, general)
        .allSegments()
        .find((s) => s.type === "ZDP"),
      viaDefault.allSegments().find((s) => s.type === "ZDP"),
    ];
    for (const zdp of routes) {
      expect(zdp?.get("departmentCode")?.value).toBe("CARDIOLOGY");
      expect(zdp?.get("departmentName")?.value).toBe("Cardiology Department");
      expect(zdp?.get("absentName")).toBeUndefined();
      expect(zdp?.get("departmentCod")).toBeUndefined();
      expect(zdp?.get("resultStatus")).toBeUndefined();
    }
  });

  it("still returns undefined for every name when no profile is applied", () => {
    const zdp = parseHL7(RAW)
      .allSegments()
      .find((s) => s.type === "ZDP");
    expect(zdp?.customFields).toBeUndefined();
    for (const name of ["departmentCode", "departmentName", "absentName", "departmentCod"]) {
      expect(zdp?.get(name)).toBeUndefined();
    }
  });

  it("leaves the parsed tree, warnings and serialization untouched", () => {
    const narrowed = parseHL7(RAW, vendor);
    const general = parseHL7(RAW, vendor as Profile);
    expect(narrowed.rawSegments).toEqual(general.rawSegments);
    expect(narrowed.warnings.map((w) => w.code)).toEqual(general.warnings.map((w) => w.code));
    expect(narrowed.toString()).toBe(general.toString());
    expect(narrowed.toString()).toBe(parseHL7(RAW).toString());
  });
});

describe("a built-in profile narrows with nothing re-declared at the call site", () => {
  const EPIC_RAW = `${MSH}PID|||MRN001\rZDP|||CARDIOLOGY|Cardiology Department\rZRS|F|20250101\r`;

  it("narrows profiles.epic straight from the namespace object", () => {
    const msg = parseHL7(EPIC_RAW, profiles.epic);
    expect(msg.part("ZDP")?.get("departmentCode")?.value).toBe("CARDIOLOGY");
    expect(msg.part("ZDP")?.get("departmentName")?.value).toBe("Cardiology Department");
    expect(msg.part("ZRS")?.get("resultStatus")?.value).toBe("F");
    expect(msg.part("ZRS")?.get("statusDateTime")?.value).toBe("20250101");
  });

  it("rejects a name the built-in does not declare for that type", () => {
    const msg = parseHL7(EPIC_RAW, profiles.epic);
    // @ts-expect-error "resultStatus" belongs to epic's ZRS, not its ZDP.
    expect(msg.part("ZDP")?.get("resultStatus")).toBeUndefined();
    // @ts-expect-error epic declares no such name for ZDP.
    expect(msg.part("ZDP")?.get("departmentCod")).toBeUndefined();
  });
});

describe("a profile built by extension keeps every name the merge declares", () => {
  const base = defineProfile({
    name: "base",
    customSegments: { ZDP: { fields: { departmentCode: 3 } } },
  });
  const sibling = defineProfile({
    name: "sibling",
    customSegments: { ZRS: { fields: { resultStatus: 1 } } },
  });

  it("accepts a parent's name and the child's own, from a single parent", () => {
    const child = defineProfile({
      name: "child",
      extends: base,
      customSegments: { ZDP: { fields: { departmentName: 4 } } },
    });
    const zdp = parseHL7(RAW, child).part("ZDP");
    expect(zdp?.get("departmentCode")?.value).toBe("CARDIOLOGY");
    expect(zdp?.get("departmentName")?.value).toBe("Cardiology Department");
  });

  it("accepts every parent's names from an array of parents", () => {
    const child = defineProfile({
      name: "child",
      extends: [base, sibling],
      customSegments: { ZDP: { fields: { departmentName: 4 } } },
    });
    const msg = parseHL7(RAW, child);
    expect(msg.part("ZDP")?.get("departmentCode")?.value).toBe("CARDIOLOGY");
    expect(msg.part("ZDP")?.get("departmentName")?.value).toBe("Cardiology Department");
    expect(msg.part("ZRS")?.get("resultStatus")?.value).toBe("FINAL");
  });

  it("accepts an inherited name when the child adds no declaration of its own", () => {
    const child = defineProfile({ name: "child", extends: base });
    expect(parseHL7(RAW, child).part("ZDP")?.get("departmentCode")?.value).toBe("CARDIOLOGY");
  });

  it("merges the runtime map exactly as the type says it does", () => {
    const child = defineProfile({
      name: "child",
      extends: base,
      customSegments: { ZDP: { fields: { departmentName: 4 } } },
    });
    expect(child.customSegments.ZDP.fields).toEqual({ departmentCode: 3, departmentName: 4 });
  });
});

describe("a factory-built profile is still the general interface", () => {
  it("assigns to Profile with no cast and passes to every API that takes one", () => {
    const asGeneral: Profile = vendor;
    expect(asGeneral.name).toBe("vendor");

    setDefaultProfile(vendor);
    try {
      expect(getDefaultProfile()?.name).toBe("vendor");
    } finally {
      setDefaultProfile(null);
    }

    const extended = defineProfile({ name: "extended", extends: asGeneral });
    expect(extended.lineage).toEqual(["vendor", "extended"]);

    expect(parseHL7(RAW, { profile: asGeneral }).profile?.name).toBe("vendor");
    expect(parseHL7(RAW, { profile: vendor, strict: false }).profile?.name).toBe("vendor");
  });

  it("keeps describe() and every other member of the interface", () => {
    expect(vendor.describe?.()).toContain("vendor");
    expect(vendor.lineage).toEqual(["vendor"]);
    expect(vendor.dateFormats).toEqual([]);
  });
});
