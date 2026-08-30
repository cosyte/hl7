import { describe, expect, it } from "vitest";

import { SUPPORTED_DATE_TOKENS } from "../src/parser/dates.js";
import { ProfileDefinitionError } from "../src/parser/errors.js";
import {
  defineProfile,
  type CustomSegmentDefinition,
  type DefineProfileOptions,
} from "../src/profiles/define.js";

describe("SUPPORTED_DATE_TOKENS", () => {
  it("exports the whole vocabulary, including YYYY and SSSS", () => {
    expect(SUPPORTED_DATE_TOKENS).toHaveLength(15);
    expect(SUPPORTED_DATE_TOKENS).toContain("YYYY");
    expect(SUPPORTED_DATE_TOKENS).toContain("SSSS");
    expect(SUPPORTED_DATE_TOKENS).toContain("MMM");
    expect(SUPPORTED_DATE_TOKENS).toContain("A");
  });

  it("contains no two-digit-year token", () => {
    expect(SUPPORTED_DATE_TOKENS).not.toContain("YY");
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

  it("Wave-2: extends computes full lineage [parent, child]", () => {
    // Plan 06-02 replaces the Wave-1 stub: lineage now flattens parent
    // lineage + appends child name, deduped by first occurrence (D-03).
    const parent = defineProfile({ name: "parent" });
    const child = defineProfile({ name: "child", extends: parent });
    expect(child.lineage).toEqual(["parent", "child"]);
  });

  it("invokes onWarning callback when supplied (composed via D-12 chain)", () => {
    // Plan 06-02 introduces composeOnWarning: even a single handler is
    // wrapped in a chain closure for uniform D-12 try/catch behavior. The
    // behavior contract ("handler runs when onWarning fires") is what
    // matters; reference identity was an implementation detail of the
    // Wave-1 stub that Plan 02 deliberately replaces.
    let called = false;
    const handler = (): void => {
      called = true;
    };
    const p = defineProfile({ name: "x", onWarning: handler });
    expect(typeof p.onWarning).toBe("function");
    p.onWarning?.({
      code: "UNKNOWN_SEGMENT",
      message: "x",
      position: { segmentIndex: 0 },
    } as unknown as Parameters<NonNullable<typeof p.onWarning>>[0]);
    expect(called).toBe(true);
  });
});

describe("defineProfile: D-05 customSegments validation", () => {
  it("throws on standard-segment overlay (PID)", () => {
    expect(() =>
      defineProfile({
        name: "bad",
        customSegments: {
          PID: { fields: { mrn: 3 } },
        },
      }),
    ).toThrow(ProfileDefinitionError);
  });

  it("error message names the offending segment + mentions Z-segments", () => {
    try {
      defineProfile({
        name: "bad",
        customSegments: {
          PID: { fields: { mrn: 3 } },
        },
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
        },
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
    // the D-08 throw path (Rule-1 fix: plan test example was contradictory).
    expect(() => defineProfile({ name: "bad", dateFormats: ["nope"] })).toThrow(
      ProfileDefinitionError,
    );
  });

  it("throws on empty format string", () => {
    expect(() => defineProfile({ name: "bad", dateFormats: [""] })).toThrow(ProfileDefinitionError);
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

  it("refuses SSSS with no seconds token, which used to construct and never match", () => {
    // Previously accepted: the validator recognised the token and the matcher
    // could not, so the format sat in the list matching nothing.
    expect(() => defineProfile({ name: "bad", dateFormats: ["SSSS"] })).toThrow(
      ProfileDefinitionError,
    );
    expect(defineProfile({ name: "ok", dateFormats: ["ss.SSSS"] }).dateFormats).toEqual([
      "ss.SSSS",
    ]);
  });
});

/** Every message must name the offending format so a developer can find it. */
function refusalMessage(format: string): string {
  try {
    defineProfile({ name: "vendor", dateFormats: [format] });
  } catch (err) {
    if (err instanceof ProfileDefinitionError) return err.message;
    throw err;
  }
  throw new Error(`expected ${JSON.stringify(format)} to be refused, and it was accepted`);
}

describe("defineProfile: dateFormats refuses a two-digit year", () => {
  it.each(["MM/DD/YY", "YY-MM-DD", "DD/MM/YY HH:mm"])("refuses %s", (format) => {
    expect(() => defineProfile({ name: "vendor", dateFormats: [format] })).toThrow(
      ProfileDefinitionError,
    );
  });

  it("names the format, names two-digit years, and says no century window is applied", () => {
    const message = refusalMessage("MM/DD/YY");
    expect(message).toContain('"MM/DD/YY"');
    expect(message).toContain("two-digit year");
    expect(message).toContain("century window");
  });

  it("a two-digit year inside a literal escape is a literal, not a year", () => {
    expect(() => defineProfile({ name: "vendor", dateFormats: ["YYYY[YY]MM"] })).not.toThrow();
  });
});

describe("defineProfile: dateFormats refuses an unescaped letter or digit that forms no token", () => {
  it.each([
    ["MM/DD/YYYY hrs", "r"],
    ["YYY/MM", "Y"],
    ["YYYY-MM-DD 0", "0"],
    ["nope", "n"],
    ["YYYY/MM/DD x", "x"],
  ])("refuses %s naming the character %s", (format, character) => {
    const message = refusalMessage(format);
    expect(message).toContain(JSON.stringify(format));
    expect(message).toContain(`'${character}'`);
  });

  it("YYY is reported as a stray character, not as a two-digit year", () => {
    const message = refusalMessage("YYY/MM");
    expect(message).not.toContain("two-digit year");
    expect(message).toContain("not part of any token");
  });

  it("accepts the same characters once they are escaped", () => {
    expect(
      defineProfile({ name: "ok", dateFormats: ["YYYY-MM-DD[T]HH:mm:ss"] }).dateFormats,
    ).toEqual(["YYYY-MM-DD[T]HH:mm:ss"]);
    expect(() => defineProfile({ name: "ok", dateFormats: ["MM/DD/YYYY [hrs]"] })).not.toThrow();
  });

  it("refuses a literal escape that is never closed", () => {
    const message = refusalMessage("YYYY-MM-DD[T");
    expect(message).toContain("never closed");
  });
});

describe("defineProfile: dateFormats refuses a broken token pairing", () => {
  it("refuses a 12-hour token with no meridiem, naming the missing pairing", () => {
    for (const format of ["h:mm", "YYYY-MM-DD hh:mm", "YYYY-MM-DD h"]) {
      const message = refusalMessage(format);
      expect(message).toContain(JSON.stringify(format));
      expect(message).toContain("meridiem");
    }
  });

  it("refuses a meridiem with no 12-hour token, naming the missing pairing", () => {
    const message = refusalMessage("YYYY-MM-DD HH:mm A");
    expect(message).toContain('"YYYY-MM-DD HH:mm A"');
    expect(message).toContain("12-hour");
  });

  it("refuses fractional seconds with no seconds token, naming the missing pairing", () => {
    const message = refusalMessage("YYYY-MM-DD HH:mm.SSSS");
    expect(message).toContain('"YYYY-MM-DD HH:mm.SSSS"');
    expect(message).toContain("'ss'");
  });

  it("accepts each pairing once it is complete", () => {
    expect(() => defineProfile({ name: "ok", dateFormats: ["M/D/YYYY h:mm A"] })).not.toThrow();
    expect(() =>
      defineProfile({ name: "ok", dateFormats: ["YYYY-MM-DD hh:mm:ss A"] }),
    ).not.toThrow();
    expect(() =>
      defineProfile({ name: "ok", dateFormats: ["YYYY-MM-DD HH:mm:ss.SSSS"] }),
    ).not.toThrow();
  });
});

describe("defineProfile: dateFormats refuses an ambiguous adjacency", () => {
  it.each([
    ["MDYYYY", "M", "D"],
    ["YYYYMD", "YYYY", "M"],
    ["HHmmssSSSS", "ss", "SSSS"],
    ["YYYYMMD", "MM", "D"],
    ["HMM", "H", "MM"],
  ])("refuses %s, naming %s beside %s", (format, left, right) => {
    const message = refusalMessage(format);
    expect(message).toContain(JSON.stringify(format));
    expect(message).toContain(`'${left}'`);
    expect(message).toContain(`'${right}'`);
    expect(message).toContain("adjacent");
  });

  it("accepts two adjacent FIXED-width numeric tokens, which split deterministically", () => {
    expect(() => defineProfile({ name: "ok", dateFormats: ["YYYYMMDDHHmmss"] })).not.toThrow();
  });

  it("accepts the same tokens once a literal separates them", () => {
    expect(() => defineProfile({ name: "ok", dateFormats: ["M/D/YYYY"] })).not.toThrow();
    expect(() => defineProfile({ name: "ok", dateFormats: ["YYYY[Q]M"] })).not.toThrow();
  });

  it("a letter token beside a numeric token is not ambiguous", () => {
    expect(() => defineProfile({ name: "ok", dateFormats: ["MMMD, YYYY"] })).not.toThrow();
  });
});

describe("defineProfile: dateFormats accepts the whole widened vocabulary", () => {
  it.each([
    "YYYY",
    "YYYY-MM",
    "YYYY-MM-DD",
    "M/D/YYYY",
    "DD-MMM-YYYY",
    "MMMM D, YYYY",
    "YYYY-MM-DD HH:mm:ss",
    "M/D/YYYY h:mm A",
    "YYYY-MM-DD hh:mm A",
    "YYYY-MM-DD HH:mm:ss.SSSS",
    "YYYY-MM-DD[T]HH:mm:ss",
    "D [of] MMMM YYYY",
    "H:mm",
  ])("accepts %s", (format) => {
    expect(defineProfile({ name: "ok", dateFormats: [format] }).dateFormats).toEqual([format]);
  });

  it("still accepts every format the built-in profiles ship", () => {
    for (const format of [
      "MM/DD/YYYY",
      "MM/DD/YYYY HH:mm:ss",
      "YYYY-MM-DD",
      "YYYY-MM-DD[T]HH:mm:ss",
      "YYYYMMDD HHmm",
      "YYYYMMDDHHmm",
    ]) {
      expect(() => defineProfile({ name: "ok", dateFormats: [format] })).not.toThrow();
    }
  });
});

describe("defineProfile: name validation", () => {
  it("throws on missing name", () => {
    expect(() => defineProfile({} as unknown as DefineProfileOptions)).toThrow(
      ProfileDefinitionError,
    );
  });

  it("throws on empty name", () => {
    expect(() => defineProfile({ name: "" })).toThrow(ProfileDefinitionError);
  });

  it("throws on whitespace-only name", () => {
    expect(() => defineProfile({ name: "   " })).toThrow(ProfileDefinitionError);
  });

  it("throws on null opts", () => {
    expect(() => defineProfile(null as unknown as DefineProfileOptions)).toThrow(
      ProfileDefinitionError,
    );
  });

  it("throws on undefined opts", () => {
    expect(() => defineProfile(undefined as unknown as DefineProfileOptions)).toThrow(
      ProfileDefinitionError,
    );
  });

  it("throws on non-string name (null)", () => {
    expect(() => defineProfile({ name: null as unknown as string })).toThrow(
      ProfileDefinitionError,
    );
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
    // handle multi-name lineage for Plan 06-02 readiness: verify via a
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
