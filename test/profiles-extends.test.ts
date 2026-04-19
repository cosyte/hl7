import { describe, expect, it } from "vitest";

import { ProfileDefinitionError } from "../src/parser/errors.js";
import type { Profile } from "../src/parser/types.js";
import type { Hl7ParseWarning } from "../src/parser/warnings.js";
import { defineProfile } from "../src/profiles/define.js";

describe("extends: lineage (D-03)", () => {
  it("single parent → [parent, child]", () => {
    const a = defineProfile({ name: "a" });
    const b = defineProfile({ name: "b", extends: a });
    expect(b.lineage).toEqual(["a", "b"]);
  });

  it("array [p1, p2] with p2 extending p1 → [a, b, c] deduped", () => {
    const a = defineProfile({ name: "a" });
    const b = defineProfile({ name: "b", extends: a }); // lineage ['a', 'b']
    const c = defineProfile({ name: "c", extends: [a, b] });
    expect(c.lineage).toEqual(["a", "b", "c"]);
  });

  it("deep chain a ← b ← c ← d preserves full lineage", () => {
    const a = defineProfile({ name: "a" });
    const b = defineProfile({ name: "b", extends: a });
    const c = defineProfile({ name: "c", extends: b });
    const d = defineProfile({ name: "d", extends: c });
    expect(d.lineage).toEqual(["a", "b", "c", "d"]);
  });

  it("self-name already present in parent lineage is NOT re-appended", () => {
    const a = defineProfile({ name: "a" });
    // Manually craft a child named 'a' extending 'a' — rare but legal.
    const aPrime = defineProfile({ name: "a", extends: a });
    expect(aPrime.lineage).toEqual(["a"]); // no ['a', 'a']
  });

  it("no parents → lineage = [selfName] (Plan 01 backward compat)", () => {
    const a = defineProfile({ name: "a" });
    expect(a.lineage).toEqual(["a"]);
  });
});

describe("extends: dateFormats (D-10)", () => {
  it("concat preserves parent order, then child", () => {
    const a = defineProfile({ name: "a", dateFormats: ["YYYY-MM-DD"] });
    const b = defineProfile({
      name: "b",
      extends: a,
      dateFormats: ["MM/DD/YYYY"],
    });
    expect(b.dateFormats).toEqual(["YYYY-MM-DD", "MM/DD/YYYY"]);
  });

  it("first-occurrence dedupe across [p1, p2] + self", () => {
    const a = defineProfile({ name: "a", dateFormats: ["YYYY-MM-DD"] });
    const b = defineProfile({
      name: "b",
      dateFormats: ["MM/DD/YYYY", "YYYY-MM-DD"],
    });
    const c = defineProfile({
      name: "c",
      extends: [a, b],
      dateFormats: ["YYYY"],
    });
    expect(c.dateFormats).toEqual(["YYYY-MM-DD", "MM/DD/YYYY", "YYYY"]);
  });
});

describe("extends: customSegments (D-11)", () => {
  it("parent ZPI.a:3 + child ZPI.b:5 → merged ZPI { a:3, b:5 }", () => {
    const a = defineProfile({
      name: "a",
      customSegments: { ZPI: { fields: { a: 3 } } },
    });
    const b = defineProfile({
      name: "b",
      extends: a,
      customSegments: { ZPI: { fields: { b: 5 } } },
    });
    expect(b.customSegments?.["ZPI"]?.fields).toEqual({ a: 3, b: 5 });
  });

  it("distinct Z-segments merge additively", () => {
    const a = defineProfile({
      name: "a",
      customSegments: { ZPI: { fields: { a: 3 } } },
    });
    const b = defineProfile({
      name: "b",
      extends: a,
      customSegments: { ZDP: { fields: { x: 1 } } },
    });
    expect(Object.keys(b.customSegments ?? {}).sort()).toEqual(["ZDP", "ZPI"]);
  });

  it("position conflict: child wins (parent ZPI.a:3, child ZPI.a:5 → a:5)", () => {
    const a = defineProfile({
      name: "a",
      customSegments: { ZPI: { fields: { a: 3 } } },
    });
    const b = defineProfile({
      name: "b",
      extends: a,
      customSegments: { ZPI: { fields: { a: 5 } } },
    });
    expect(b.customSegments?.["ZPI"]?.fields["a"]).toBe(5);
  });
});

describe("extends: scalars (D-09)", () => {
  it("child description overrides parent", () => {
    const a = defineProfile({ name: "a", description: "parent" });
    const b = defineProfile({
      name: "b",
      extends: a,
      description: "child",
    });
    expect(b.description).toBe("child");
  });

  it("child without description inherits from parent", () => {
    const a = defineProfile({ name: "a", description: "parent" });
    const b = defineProfile({ name: "b", extends: a });
    expect(b.description).toBe("parent");
  });

  it("with [p1, p2] + no child desc, LAST parent with description wins", () => {
    const a = defineProfile({ name: "a", description: "a-desc" });
    const b = defineProfile({ name: "b", description: "b-desc" });
    const c = defineProfile({ name: "c", extends: [a, b] });
    expect(c.description).toBe("b-desc");
  });

  it("empty-undefined description on child does NOT clear parent", () => {
    const a = defineProfile({ name: "a", description: "parent" });
    const b = defineProfile({ name: "b", extends: a }); // description omitted
    expect(b.description).toBe("parent");
  });
});

describe("extends: onWarning chain (D-12)", () => {
  const fakeWarning: Hl7ParseWarning = {
    code: "UNKNOWN_SEGMENT",
    message: "x",
    position: { segmentIndex: 0 },
  };

  it("parent + child handlers both fire in order", () => {
    const callLog: string[] = [];
    const a = defineProfile({
      name: "a",
      onWarning: () => callLog.push("a"),
    });
    const b = defineProfile({
      name: "b",
      extends: a,
      onWarning: () => callLog.push("b"),
    });
    b.onWarning?.(fakeWarning);
    expect(callLog).toEqual(["a", "b"]);
  });

  it("handler exceptions are silently swallowed; subsequent handlers still run", () => {
    const callLog: string[] = [];
    const a = defineProfile({
      name: "a",
      onWarning: () => {
        callLog.push("a");
        throw new Error("boom");
      },
    });
    const b = defineProfile({
      name: "b",
      extends: a,
      onWarning: () => callLog.push("b"),
    });
    expect(() => b.onWarning?.(fakeWarning)).not.toThrow();
    expect(callLog).toEqual(["a", "b"]);
  });

  it("no handlers anywhere → onWarning undefined", () => {
    const a = defineProfile({ name: "a" });
    const b = defineProfile({ name: "b", extends: a });
    expect(b.onWarning).toBeUndefined();
  });

  it("[p1, p2] + child handler — all 3 invoked in order", () => {
    const callLog: string[] = [];
    const a = defineProfile({
      name: "a",
      onWarning: () => callLog.push("a"),
    });
    const b = defineProfile({
      name: "b",
      onWarning: () => callLog.push("b"),
    });
    const c = defineProfile({
      name: "c",
      extends: [a, b],
      onWarning: () => callLog.push("c"),
    });
    c.onWarning?.(fakeWarning);
    expect(callLog).toEqual(["a", "b", "c"]);
  });
});

describe("extends: post-merge re-validation (D-05 rogue-parent)", () => {
  it("parent containing non-Z segment (bypass) makes child throw on merge", () => {
    // Manually-crafted profile bypassing defineProfile validates D-05
    // at merge time.
    const rogueParent = {
      name: "rogue",
      lineage: ["rogue"],
      customSegments: { PID: { fields: { mrn: 3 } } },
    } as unknown as Profile;
    expect(() =>
      defineProfile({ name: "child", extends: rogueParent }),
    ).toThrow(ProfileDefinitionError);
  });

  // Note: the D-06 duplicate-name-different-position validator is
  // present in validate.ts as defense-in-depth. Under the present
  // mergeCustomSegments strategy it is unreachable (the position-
  // indexed accumulator collapses same-name-different-position to a
  // single entry), so no test asserts defineProfile throws through
  // that path today. See validateUniqueFieldNames JSDoc for the
  // rationale.
});

describe("extends: returned profile remains frozen", () => {
  it("Object.isFrozen on the extends result is true", () => {
    const a = defineProfile({ name: "a" });
    const b = defineProfile({ name: "b", extends: a });
    expect(Object.isFrozen(b)).toBe(true);
  });
});

describe("extends: describe() reflects merged lineage", () => {
  it("lineage line shows parent → child arrow for 2+ names", () => {
    const a = defineProfile({ name: "a" });
    const b = defineProfile({ name: "b", extends: a });
    const desc = b.describe?.() ?? "";
    expect(desc).toContain("lineage: a → b");
  });
});
