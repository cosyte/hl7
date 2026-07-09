/**
 * Targeted coverage-closing tests for `src/profiles/merge.ts`,
 * `src/profiles/validate.ts`, and `src/profiles/describe.ts` (HL7-J Part A).
 *
 * These three modules sit at 81.98% branches as a whole (profiles/) because
 * a handful of internal branches are UNREACHABLE via the public
 * `defineProfile()` API — they only fire when a `Profile`-shaped object
 * bypasses `defineProfile`'s own validation/assembly (e.g. a hand-crafted
 * parent object missing `lineage`, or a `customSegments` map with a
 * `fields` entry whose value is `undefined`). The existing
 * `test/profiles-extends.test.ts` "rogue-parent" test already establishes
 * this pattern (a hand-crafted `Profile` cast via `as unknown as Profile`)
 * for D-05; this file extends the same pattern to close the remaining
 * `merge.ts` / `validate.ts` / `describe.ts` branch holes.
 *
 * Every test here asserts REAL behavior of the merge/validate/describe
 * helpers (not coverage-gaming no-ops) — each one pins a documented
 * reducer or validator contract (D-03, D-09, D-10, D-11, D-06 defense-in-
 * depth, D-04) against a specific hand-crafted input shape.
 */

import { describe, expect, it } from "vitest";

import type { CustomSegmentDefinition, Profile } from "../src/parser/types.js";
import { buildDescribe } from "../src/profiles/describe.js";
import {
  composeOnWarning,
  mergeCustomSegments,
  mergeDateFormats,
  mergeLineage,
  mergeScalar,
} from "../src/profiles/merge.js";
import { validateUniqueFieldNames } from "../src/profiles/validate.js";

describe("mergeLineage: parent without a `lineage` field falls back to [p.name] (merge.ts:47)", () => {
  it("hand-crafted parent missing lineage contributes its own name", () => {
    // Bypasses defineProfile (which always sets `lineage`) the same way
    // the existing rogue-parent test does, so the `p.lineage ?? [p.name]`
    // fallback branch actually fires.
    const bareParent = { name: "bare-parent" } as unknown as Profile;
    const lineage = mergeLineage([bareParent], "child");
    expect(lineage).toEqual(["bare-parent", "child"]);
  });

  it("mixed: one parent with lineage, one without — both contribute correctly", () => {
    const withLineage = { name: "b", lineage: ["a", "b"] } as unknown as Profile;
    const withoutLineage = { name: "c" } as unknown as Profile;
    const lineage = mergeLineage([withLineage, withoutLineage], "d");
    expect(lineage).toEqual(["a", "b", "c", "d"]);
  });
});

describe("mergeDateFormats: self-format dedupe against earlier self entries (merge.ts:82)", () => {
  it("a duplicate WITHIN selfFormats is deduped (kept on first occurrence)", () => {
    // The parent-loop `seen` set is empty here, so this exercises the
    // self-loop's `!seen.has(f)` FALSE branch: the second "MM/DD/YYYY" in
    // selfFormats collides with the first, not with any parent format.
    const out = mergeDateFormats([], ["MM/DD/YYYY", "YYYY-MM-DD", "MM/DD/YYYY"]);
    expect(out).toEqual(["MM/DD/YYYY", "YYYY-MM-DD"]);
  });

  it("self format duplicating a PARENT format is also deduped", () => {
    const parent = { name: "p", dateFormats: ["YYYY-MM-DD"] } as unknown as Profile;
    const out = mergeDateFormats([parent], ["YYYY-MM-DD", "MM/DD/YYYY"]);
    expect(out).toEqual(["YYYY-MM-DD", "MM/DD/YYYY"]);
  });
});

describe("mergeCustomSegments: layer() branches (merge.ts:82-115)", () => {
  it("a parent with customSegments === undefined is skipped (layer's map-undefined branch)", () => {
    const parentNoSegments = { name: "p" } as unknown as Profile;
    const out = mergeCustomSegments([parentNoSegments], { ZPI: { fields: { a: 1 } } });
    expect(out).toEqual({ ZPI: { fields: { a: 1 } } });
  });

  it("a parent whose customSegments has an undefined entry value is skipped (entry-undefined branch)", () => {
    // Sparse-ish record: Object.keys still yields the key, but the value
    // itself is `undefined` — hits the `entry === undefined` continue at
    // merge.ts:115. Cast bypasses the compile-time guarantee since this
    // shape cannot occur through normal TS construction.
    const parentWithHole = {
      name: "p",
      customSegments: { ZPI: undefined, ZDP: { fields: { a: 1 } } },
    } as unknown as Profile;
    const out = mergeCustomSegments([parentWithHole], {});
    expect(out).toEqual({ ZDP: { fields: { a: 1 } } });
    expect(Object.keys(out)).not.toContain("ZPI");
  });

  it("multiple parents + self all contribute distinct segments additively", () => {
    const p1 = { name: "p1", customSegments: { ZAA: { fields: { x: 1 } } } } as unknown as Profile;
    const p2 = { name: "p2", customSegments: { ZBB: { fields: { y: 2 } } } } as unknown as Profile;
    const out = mergeCustomSegments([p1, p2], { ZCC: { fields: { z: 3 } } });
    expect(Object.keys(out).sort()).toEqual(["ZAA", "ZBB", "ZCC"]);
  });
});

describe("mergeCustomSegments: field position-undefined branch (merge.ts:123)", () => {
  it("a field entry with pos === undefined is skipped, not written to the accumulator", () => {
    // `entry.fields` typed as Record<string, number>, but we hand-craft a
    // hole so `pos === undefined` — the `if (pos === undefined) continue;`
    // branch — actually fires. Cast bypasses compile-time guarantees the
    // same way the existing rogue-parent tests do.
    const selfMap = {
      ZPI: { fields: { a: 3, ghost: undefined } },
    } as unknown as Readonly<Record<string, CustomSegmentDefinition>>;
    const out = mergeCustomSegments([], selfMap);
    expect(out["ZPI"]?.fields).toEqual({ a: 3 });
    expect(Object.keys(out["ZPI"]?.fields ?? {})).not.toContain("ghost");
  });
});

describe("mergeScalar: undefined parent slot is skipped (merge.ts:162)", () => {
  it("a hole in the parents array is skipped; the last DEFINED parent with a value wins", () => {
    const a = { name: "a", description: "a-desc" } as unknown as Profile;
    // `noUncheckedIndexedAccess`-style hole: build the array with a real
    // `undefined` element at the tail (post-`a`) so `p === undefined`
    // fires inside the reverse scan before it reaches `a`.
    const parents: readonly (Profile | undefined)[] = [a, undefined];
    const value = mergeScalar(parents as readonly Profile[], undefined, "description");
    expect(value).toBe("a-desc");
  });

  it("selfValue explicitly provided still wins over any parent (baseline, no regression)", () => {
    const a = { name: "a", description: "a-desc" } as unknown as Profile;
    const value = mergeScalar([a], "self-desc", "description");
    expect(value).toBe("self-desc");
  });
});

describe("composeOnWarning: sanity (already covered elsewhere, kept here for locality)", () => {
  it("filters out undefined handlers and returns undefined when none remain", () => {
    expect(composeOnWarning([undefined, undefined])).toBeUndefined();
  });
});

describe("validateUniqueFieldNames: D-06 defense-in-depth (validate.ts)", () => {
  it("cross-position aliasing (two DIFFERENT names, same position) does not throw", () => {
    // Legal: distinct field names may share one position.
    const map: Readonly<Record<string, CustomSegmentDefinition>> = {
      ZPI: { fields: { mrn: 3, patientId: 3 } },
    };
    expect(() => validateUniqueFieldNames(map, "test")).not.toThrow();
  });

  it("multi-segment map with an undefined entry is skipped (entry-undefined continue)", () => {
    const map = {
      ZPI: undefined,
      ZDP: { fields: { a: 1 } },
    } as unknown as Readonly<Record<string, CustomSegmentDefinition>>;
    expect(() => validateUniqueFieldNames(map, "test")).not.toThrow();
  });

  it("documents: the throw branch (validate.ts:247) is provably unreachable via any real Record<string, number>", () => {
    // `Object.keys`/`for...in` cannot yield the same enumerable own-key
    // twice for any real JS object — not via an object literal, `Map` →
    // `Object.fromEntries`, `Object.defineProperty`, or even a `Proxy`
    // (V8 throws "'ownKeys' on proxy: trap returned duplicate entries" if
    // you try). Since `entry.fields` is typed `Record<string, number>`,
    // `positionsByName` in `validateUniqueFieldNames` can therefore never
    // observe the same `fieldName` twice within one segment's fields loop,
    // so `prior !== undefined` can never be true and the throw at
    // validate.ts:247 is dead code under the current type — exactly as
    // the function's own JSDoc states. This test pins that contract
    // (a no-op over every constructible input) rather than fabricating an
    // artificial throw the real code path cannot produce.
    expect(() =>
      Object.keys(
        new Proxy(
          {},
          {
            ownKeys: () => ["mrn", "mrn"],
          },
        ),
      ),
    ).toThrow(TypeError);

    const map: Readonly<Record<string, CustomSegmentDefinition>> = {
      ZPI: { fields: { mrn: 3 } },
    };
    expect(() => validateUniqueFieldNames(map, "test")).not.toThrow();
  });
});

describe("buildDescribe: customSegments/dateFormats undefined branches (describe.ts:28-30)", () => {
  it("customSegments === undefined omits the customSegments line entirely", () => {
    const p: Profile = { name: "bare" };
    const desc = buildDescribe(p);
    expect(desc).not.toContain("customSegments:");
  });

  it("dateFormats === undefined omits the dateFormats line entirely", () => {
    const p: Profile = { name: "bare" };
    const desc = buildDescribe(p);
    expect(desc).not.toContain("dateFormats:");
  });

  it("customSegments === {} (empty, defined) omits the segment-name suffix but keeps the count line", () => {
    const p: Profile = { name: "empty-segs", customSegments: {} };
    const desc = buildDescribe(p);
    expect(desc).toContain("customSegments: 0");
    expect(desc).not.toMatch(/customSegments: 0 \(/);
  });

  it("dateFormats === [] (empty, defined) omits the dateFormats line (length > 0 guard)", () => {
    const p: Profile = { name: "empty-formats", dateFormats: [] };
    const desc = buildDescribe(p);
    expect(desc).not.toContain("dateFormats:");
  });

  it("both customSegments and dateFormats present and non-empty produce both lines", () => {
    const p: Profile = {
      name: "full",
      customSegments: { ZPI: { fields: { a: 1 } } },
      dateFormats: ["YYYY-MM-DD"],
    };
    const desc = buildDescribe(p);
    expect(desc).toContain("customSegments: 1 (ZPI)");
    expect(desc).toContain("dateFormats: 1");
  });
});
