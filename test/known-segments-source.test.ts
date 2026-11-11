/**
 * `KNOWN_SEGMENTS` matches the published lists it is derived from.
 *
 * The table in `src/parser/known-segments.ts` names every standard segment of
 * HL7 v2.1 to v2.9 and the version that introduced it. These tests recompute
 * both from the vendored lists under `vendor/segment-names/` and require the
 * shipped table to agree, name by name and version by version, so the registry
 * cannot drift from its source without a red test saying where.
 */

import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it, vi } from "vitest";

import { KNOWN_SEGMENTS } from "../src/index.js";
import { RETAINED_UNLISTED_SEGMENTS, SEGMENT_INTRODUCED_IN } from "../src/parser/known-segments.js";

const REPO_ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const VENDOR_DIR = path.join(REPO_ROOT, "vendor", "segment-names");

interface Hl7apySnapshot {
  readonly source: { readonly repository: string; readonly commit: string };
  readonly versions: readonly {
    readonly version: string;
    readonly sha256: string;
    readonly segments: readonly string[];
  }[];
}

interface V2igList {
  readonly entry: readonly { readonly item: { readonly reference: string } }[];
}

const hl7apyBytes = readFileSync(path.join(VENDOR_DIR, "hl7apy-segment-names.json"), "utf8");
const hl7apy = JSON.parse(hl7apyBytes) as Hl7apySnapshot;
const v2igBytes = readFileSync(path.join(VENDOR_DIR, "v2ig-segments.json"));
const v2ig = JSON.parse(v2igBytes.toString("utf8")) as V2igList;

const HL7APY_VERSIONS = [
  "2.1",
  "2.2",
  "2.3",
  "2.3.1",
  "2.4",
  "2.5",
  "2.5.1",
  "2.6",
  "2.7",
  "2.8",
  "2.8.1",
  "2.8.2",
];

/** The v2+ list's segment ids, less `Hxx` (its placeholder for any segment). */
function v2igNames(): Set<string> {
  const prefix = "StructureDefinition/";
  const names = new Set<string>();
  for (const { item } of v2ig.entry) {
    expect(item.reference.startsWith(prefix)).toBe(true);
    names.add(item.reference.slice(prefix.length));
  }
  names.delete("Hxx");
  return names;
}

/** Each name with the first version that lists it: hl7apy in order, then v2+ as v2.9. */
function expectedIntroducedIn(): Map<string, string> {
  const expected = new Map<string, string>();
  for (const { version, segments } of hl7apy.versions) {
    for (const name of segments) if (!expected.has(name)) expected.set(name, version);
  }
  for (const name of v2igNames()) if (!expected.has(name)) expected.set(name, "2.9");
  return expected;
}

describe("the vendored source", () => {
  it("is the HL7 v2+ list HL7 published, byte for byte", () => {
    expect(createHash("sha256").update(v2igBytes).digest("hex")).toBe(
      "013ca7a1ebb44fbd52b7f9ca5af2193c4d436f6b9248a955d37463cd32187f37",
    );
  });

  it("carries every hl7apy version from v2.1 to v2.8.2, each with its upstream hash", () => {
    expect(hl7apy.source.repository).toBe("crs4/hl7apy");
    expect(hl7apy.source.commit).toMatch(/^[0-9a-f]{40}$/);
    expect(hl7apy.versions.map((v) => v.version)).toEqual(HL7APY_VERSIONS);
    for (const v of hl7apy.versions) {
      expect(v.sha256).toMatch(/^[0-9a-f]{64}$/);
      expect(v.segments.length).toBeGreaterThan(0);
    }
  });
});

describe("KNOWN_SEGMENTS against its source", () => {
  const expected = expectedIntroducedIn();

  it("introduces each name in the version the source first lists it", () => {
    expect(new Map([...SEGMENT_INTRODUCED_IN].sort())).toEqual(new Map([...expected].sort()));
  });

  it.each([...expected].sort())("%s is known, introduced in v%s", (name, version) => {
    expect(KNOWN_SEGMENTS.has(name)).toBe(true);
    expect(SEGMENT_INTRODUCED_IN.get(name)).toBe(version);
  });

  it("holds nothing outside the source except the retained names", () => {
    const outside = [...KNOWN_SEGMENTS].filter((name) => !expected.has(name)).sort();
    expect(outside).toEqual(["FAM"]);
    expect([...RETAINED_UNLISTED_SEGMENTS]).toEqual(["FAM"]);
  });

  // The table is built when its module loads, before any test runs, so a tool
  // that traces each line to the tests that executed it (mutation testing)
  // cannot see that the tests above read it. Evaluating the module afresh
  // inside a test makes that test the one that builds the table.
  it("a fresh load of the module builds the same table, set and retained names", async () => {
    vi.resetModules();
    const fresh = await import("../src/parser/known-segments.js");
    expect(new Map([...fresh.SEGMENT_INTRODUCED_IN].sort())).toEqual(new Map([...expected].sort()));
    expect([...fresh.KNOWN_SEGMENTS].sort()).toEqual([...expected.keys(), "FAM"].sort());
    expect([...fresh.RETAINED_UNLISTED_SEGMENTS]).toEqual(["FAM"]);
  });

  it("every name is a three-character standard id, never a Z-segment", () => {
    for (const name of KNOWN_SEGMENTS) {
      expect(name).toMatch(/^[A-Z][A-Z0-9]{2}$/);
      expect(name.startsWith("Z")).toBe(false);
    }
  });

  it.each([
    ["PRT", "2.7"],
    ["ARV", "2.6"],
    ["OH1", "2.9"],
    ["OH4", "2.9"],
    ["URD", "2.1"],
    ["EQP", "2.4"],
  ])("%s reads as introduced in v%s", (name, version) => {
    expect(SEGMENT_INTRODUCED_IN.get(name)).toBe(version);
  });
});
