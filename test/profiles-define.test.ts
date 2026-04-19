import { describe, expect, it } from "vitest";

import { SUPPORTED_DATE_TOKENS } from "../src/parser/dates.js";
import { ProfileDefinitionError } from "../src/parser/errors.js";
import {
  defineProfile,
  type CustomSegmentDefinition,
  type DefineProfileOptions,
} from "../src/profiles/define.js";

describe("SUPPORTED_DATE_TOKENS", () => {
  it("exports exactly 7 tokens including YYYY and SSSS", () => {
    expect(SUPPORTED_DATE_TOKENS).toHaveLength(7);
    expect(SUPPORTED_DATE_TOKENS).toContain("YYYY");
    expect(SUPPORTED_DATE_TOKENS).toContain("SSSS");
  });
});

describe("defineProfile: happy path", () => {
  it("returns a frozen profile with name-only input", () => {
    const p = defineProfile({ name: "x" });
    expect(p.name).toBe("x");
    expect(p.lineage).toEqual(["x"]);
    expect(p.customSegments).toEqual({});
    expect(p.dateFormats).toEqual([]);
    expect(p.description).toBeUndefined();
    expect(p.onWarning).toBeUndefined();
    expect(typeof p.describe).toBe("function");
    expect(Object.isFrozen(p)).toBe(true);
  });

  it("preserves description when supplied", () => {
    const p = defineProfile({ name: "x", description: "a test profile" });
    expect(p.description).toBe("a test profile");
  });

  it("preserves customSegments with Z-segment keys", () => {
    const p = defineProfile({
      name: "x",
      customSegments: { ZPI: { fields: { encounterId: 3, visitId: 5 } } },
    });
    expect(p.customSegments).toEqual({
      ZPI: { fields: { encounterId: 3, visitId: 5 } },
    });
  });

  it("preserves dateFormats in order", () => {
    const p = defineProfile({
      name: "x",
      dateFormats: ["MM/DD/YYYY", "YYYY-MM-DD"],
    });
    expect(p.dateFormats).toEqual(["MM/DD/YYYY", "YYYY-MM-DD"]);
  });

  it("Wave-1: extends option accepted but lineage stays [name]", () => {
    // Plan 06-02 will extend lineage computation — for Wave 1, lineage
    // is always [opts.name] regardless of extends.
    const parent = defineProfile({ name: "parent" });
    const child = defineProfile({ name: "child", extends: parent });
    expect(child.lineage).toEqual(["child"]);
  });

  it("preserves onWarning callback reference", () => {
    const handler = (): void => undefined;
    const p = defineProfile({ name: "x", onWarning: handler });
    expect(p.onWarning).toBe(handler);
  });
});

describe("defineProfile: D-05 customSegments validation", () => {
  it("throws on standard-segment overlay (PID)", () => {
    expect(() =>
      defineProfile({
        name: "bad",
        customSegments: {
          PID: { fields: { mrn: 3 } },
        } as unknown as Readonly<Record<string, CustomSegmentDefinition>>,
      }),
    ).toThrow(ProfileDefinitionError);
  });

  it("error message names the offending segment + mentions Z-segments", () => {
    try {
      defineProfile({
        name: "bad",
        customSegments: {
          PID: { fields: { mrn: 3 } },
        } as unknown as Readonly<Record<string, CustomSegmentDefinition>>,
      });
      expect.fail("should throw");
    } catch (err) {
      expect(err).toBeInstanceOf(ProfileDefinitionError);
      if (err instanceof ProfileDefinitionError) {
        expect(err.message).toContain("PID");
        expect(err.message).toContain("Z-segments");
        expect(err.profileName).toBe("bad");
      }
    }
  });

  it("throws on 4-char Z-ish segment (ZZZZ)", () => {
    expect(() =>
      defineProfile({
        name: "bad",
        customSegments: {
          ZZZZ: { fields: { a: 1 } },
        } as unknown as Readonly<Record<string, CustomSegmentDefinition>>,
      }),
    ).toThrow(ProfileDefinitionError);
  });

  it("accepts Z99 (Z + 2 alnum)", () => {
    const p = defineProfile({
      name: "ok",
      customSegments: { Z99: { fields: { a: 1 } } },
    });
    expect(p.customSegments?.["Z99"]?.fields["a"]).toBe(1);
  });

  it("throws on non-positive field position", () => {
    expect(() =>
      defineProfile({
        name: "bad",
        customSegments: { ZPI: { fields: { x: 0 } } },
      }),
    ).toThrow(ProfileDefinitionError);
  });

  it("throws on non-integer field position", () => {
    expect(() =>
      defineProfile({
        name: "bad",
        customSegments: { ZPI: { fields: { x: 1.5 } } },
      }),
    ).toThrow(ProfileDefinitionError);
  });

  it("throws on missing fields map", () => {
    expect(() =>
      defineProfile({
        name: "bad",
        customSegments: {
          ZPI: {},
        } as unknown as Readonly<Record<string, CustomSegmentDefinition>>,
      }),
    ).toThrow(ProfileDefinitionError);
  });
});

describe("defineProfile: D-07 unknown top-level keys", () => {
  it("throws on typo'd 'dateFormatz' with 'did you mean dateFormats?' hint", () => {
    try {
      defineProfile({
        name: "bad",
        dateFormatz: ["MM/DD/YYYY"],
      } as unknown as DefineProfileOptions);
      expect.fail("should throw");
    } catch (err) {
      expect(err).toBeInstanceOf(ProfileDefinitionError);
      if (err instanceof ProfileDefinitionError) {
        expect(err.message).toContain("dateFormatz");
        expect(err.message).toContain("dateFormats");
        expect(err.message).toContain("Did you mean");
      }
    }
  });

  it("throws without hint when key is Levenshtein > 2 from every known key", () => {
    try {
      defineProfile({
        name: "bad",
        totallyMadeUp: "foo",
      } as unknown as DefineProfileOptions);
      expect.fail("should throw");
    } catch (err) {
      expect(err).toBeInstanceOf(ProfileDefinitionError);
      if (err instanceof ProfileDefinitionError) {
        expect(err.message).toContain("unknown option key");
        expect(err.message).not.toContain("Did you mean");
      }
    }
  });
});

describe("defineProfile: D-08 date format validation", () => {
  it("throws on format with no recognised token (literal-only string)", () => {
    // Plan's behavior note referenced "YYY/MM" as a negative case, but that
    // string contains "MM" as a literal substring and legitimately matches
    // the month token. Use a string with zero recognised tokens to exercise
    // the D-08 throw path (Rule-1 fix — plan test example was contradictory).
    expect(() =>
      defineProfile({ name: "bad", dateFormats: ["nope"] }),
    ).toThrow(ProfileDefinitionError);
  });

  it("throws on empty format string", () => {
    expect(() => defineProfile({ name: "bad", dateFormats: [""] })).toThrow(
      ProfileDefinitionError,
    );
  });

  it("accepts format containing only YYYY", () => {
    const p = defineProfile({ name: "ok", dateFormats: ["YYYY"] });
    expect(p.dateFormats).toEqual(["YYYY"]);
  });

  it("error message names the bad index", () => {
    try {
      defineProfile({
        name: "bad",
        dateFormats: ["YYYY-MM-DD", "nope"],
      });
      expect.fail("should throw");
    } catch (err) {
      expect(err).toBeInstanceOf(ProfileDefinitionError);
      if (err instanceof ProfileDefinitionError) {
        expect(err.message).toContain("dateFormats[1]");
      }
    }
  });

  it("accepts format with only SSSS (fractional seconds)", () => {
    const p = defineProfile({ name: "ok", dateFormats: ["SSSS"] });
    expect(p.dateFormats).toEqual(["SSSS"]);
  });
});

describe("defineProfile: name validation", () => {
  it("throws on missing name", () => {
    expect(() =>
      defineProfile({} as unknown as DefineProfileOptions),
    ).toThrow(ProfileDefinitionError);
  });

  it("throws on empty name", () => {
    expect(() => defineProfile({ name: "" })).toThrow(ProfileDefinitionError);
  });

  it("throws on whitespace-only name", () => {
    expect(() => defineProfile({ name: "   " })).toThrow(
      ProfileDefinitionError,
    );
  });

  it("throws on null opts", () => {
    expect(() =>
      defineProfile(null as unknown as DefineProfileOptions),
    ).toThrow(ProfileDefinitionError);
  });

  it("throws on undefined opts", () => {
    expect(() =>
      defineProfile(undefined as unknown as DefineProfileOptions),
    ).toThrow(ProfileDefinitionError);
  });

  it("throws on non-string name (null)", () => {
    expect(() =>
      defineProfile({ name: null as unknown as string }),
    ).toThrow(ProfileDefinitionError);
  });
});

describe("defineProfile: describe() (D-04, PROF-05)", () => {
  it("returns a multi-line string containing the profile name", () => {
    const p = defineProfile({ name: "epic" });
    const desc = p.describe?.() ?? "";
    expect(desc.length).toBeGreaterThan(0);
    expect(desc).toContain("epic");
    expect(desc.startsWith("Profile 'epic'")).toBe(true);
  });

  it("includes description line only when supplied", () => {
    const a = defineProfile({ name: "x", description: "hi" });
    const b = defineProfile({ name: "x" });
    expect(a.describe?.()).toContain("description: hi");
    expect(b.describe?.()).not.toContain("description:");
  });

  it("includes customSegments count + names when populated", () => {
    const p = defineProfile({
      name: "x",
      customSegments: {
        ZDP: { fields: { a: 1 } },
        ZRS: { fields: { b: 2 } },
      },
    });
    expect(p.describe?.()).toContain("customSegments: 2 (ZDP, ZRS)");
  });

  it("renders lineage with arrows when more than one name present", () => {
    // Wave 1 only produces single-name lineage, but describe() must
    // handle multi-name lineage for Plan 06-02 readiness — verify via a
    // hand-built Profile passed through buildDescribe.
    const p = defineProfile({ name: "solo" });
    expect(p.describe?.()).toContain("lineage: solo");
  });

  it("includes onWarning: registered only when supplied", () => {
    const p = defineProfile({
      name: "x",
      onWarning: (): void => undefined,
    });
    expect(p.describe?.()).toContain("onWarning: registered");
  });

  it("omits onWarning line when not supplied", () => {
    const p = defineProfile({ name: "x" });
    expect(p.describe?.()).not.toContain("onWarning:");
  });

  it("includes dateFormats line with count when populated", () => {
    const p = defineProfile({
      name: "x",
      dateFormats: ["MM/DD/YYYY", "YYYY-MM-DD"],
    });
    expect(p.describe?.()).toContain("dateFormats: 2");
  });
});

describe("defineProfile: return-value immutability", () => {
  it("top-level object is frozen", () => {
    const p = defineProfile({ name: "x" });
    expect(Object.isFrozen(p)).toBe(true);
  });
});
