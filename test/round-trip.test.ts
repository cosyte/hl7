/**
 * SER-02 round-trip structural-equivalence sweep. For each canonical
 * fixture under `test/fixtures/canonical/`, asserts:
 *   - `parseHL7(fixture)` succeeds.
 *   - `parseHL7(parseHL7(fixture).toString()).rawSegments` deeply equals
 *     `parseHL7(fixture).rawSegments` (D-03 structural — not byte —
 *     equivalence on the first pass).
 *   - `parseHL7(emitted).toString() === emitted` byte-for-byte (D-03
 *     idempotency from the second pass).
 *
 * Also covers specific preservation checks for the 3 migrated edge-case
 * fixtures (null-fields, embedded-delimiters, decoded-br — now under
 * `test/fixtures/edge-cases/` per Phase 7 Plan 01 D-08), plus the
 * oru-r01 repetition-count check and the adt-a01 segment-roster check.
 *
 * The shared `assertStructuralRoundTrip` helper is extracted to
 * `test/_helpers/structural-equivalence.ts` (D-19) so canonical-messages
 * (Plan 02) and any future round-trip-checking test can import it.
 */

import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

import { parseHL7 } from "../src/index.js";

import { assertStructuralRoundTrip } from "./_helpers/structural-equivalence.js";

const FIXTURE_DIR = path.join(
  path.dirname(fileURLToPath(import.meta.url)),
  "fixtures",
  "canonical",
);

const EDGE_CASE_DIR = path.join(
  path.dirname(fileURLToPath(import.meta.url)),
  "fixtures",
  "edge-cases",
);

function loadFixture(name: string): string {
  return readFileSync(path.join(FIXTURE_DIR, `${name}.hl7`), "utf8");
}

function loadEdgeCaseFixture(name: string): string {
  return readFileSync(path.join(EDGE_CASE_DIR, `${name}.hl7`), "utf8");
}

/**
 * D-03 idempotency: byte-identical from the second pass onward.
 */
function assertIdempotency(raw: string): void {
  const once = parseHL7(raw).toString();
  const twice = parseHL7(once).toString();
  expect(twice).toBe(once);
}

const FIXTURES = ["adt-a01", "oru-r01"] as const;

describe("round-trip: SER-02 structural-equivalence sweep", () => {
  for (const name of FIXTURES) {
    it(`${name} round-trips structurally`, () => {
      assertStructuralRoundTrip(loadFixture(name));
    });

    it(`${name} is idempotent from the second pass onward (D-03)`, () => {
      assertIdempotency(loadFixture(name));
    });
  }
});

describe("round-trip: specific preservation checks", () => {
  it("null-fields preserves RawField.isNull === true through round-trip", () => {
    const raw = loadEdgeCaseFixture("null-fields");
    const original = parseHL7(raw);
    const roundTripped = parseHL7(original.toString());
    // PID-2, PID-9, PID-10 are "" nulls in the fixture.
    const pidOriginal = original.rawSegments.find((s) => s.name === "PID");
    const pidRound = roundTripped.rawSegments.find((s) => s.name === "PID");
    expect(pidOriginal).toBeDefined();
    expect(pidRound).toBeDefined();
    // Spot-check a known-null field (PID-2 = fields[2]).
    expect(pidOriginal?.fields[2]?.isNull).toBe(true);
    expect(pidRound?.fields[2]?.isNull).toBe(true);
    // And PID-9 / PID-10.
    expect(pidOriginal?.fields[9]?.isNull).toBe(true);
    expect(pidRound?.fields[9]?.isNull).toBe(true);
    expect(pidOriginal?.fields[10]?.isNull).toBe(true);
    expect(pidRound?.fields[10]?.isNull).toBe(true);
  });

  it("embedded-delimiters preserves all 5 escape forms through round-trip", () => {
    const raw = loadEdgeCaseFixture("embedded-delimiters");
    const original = parseHL7(raw);
    const roundTripped = parseHL7(original.toString());
    // Structural equivalence: same raw tree after re-parse.
    expect(roundTripped.rawSegments).toEqual(original.rawSegments);
    // PID-5 is XPN with 5 components, each containing one of the 5 literal
    // delimiter chars in its decoded form (the raw tree holds DECODED
    // subcomponents per the Phase 2 tokenize unescape-on-parse contract).
    const pidOriginal = original.rawSegments.find((s) => s.name === "PID");
    expect(pidOriginal).toBeDefined();
    const pid5 = pidOriginal?.fields[5]?.repetitions[0]?.components;
    expect(pid5).toBeDefined();
    // Each literal delimiter char appears in exactly one component's first
    // subcomponent (the fixture uses one escape form per component):
    //   C1 Smith\F\Jones  -> "Smith|Jones"  (| from \F\)
    //   C2 John\S\Public  -> "John^Public"  (^ from \S\)
    //   C3 Q\T\Roe        -> "Q&Roe"        (& from \T\)
    //   C4 Jr\R\Sr        -> "Jr~Sr"        (~ from \R\)
    //   C5 Dr\E\Prof      -> "Dr\\Prof"     (\ from \E\)
    expect(pid5?.[0]?.subcomponents[0]).toBe("Smith|Jones");
    expect(pid5?.[1]?.subcomponents[0]).toBe("John^Public");
    expect(pid5?.[2]?.subcomponents[0]).toBe("Q&Roe");
    expect(pid5?.[3]?.subcomponents[0]).toBe("Jr~Sr");
    expect(pid5?.[4]?.subcomponents[0]).toBe("Dr\\Prof");
    // Emitted form re-escapes each literal delimiter back to its HL7 form.
    const emitted = original.toString();
    expect(emitted).toContain("Smith\\F\\Jones");
    expect(emitted).toContain("John\\S\\Public");
    expect(emitted).toContain("Q\\T\\Roe");
    expect(emitted).toContain("Jr\\R\\Sr");
    expect(emitted).toContain("Dr\\E\\Prof");
  });

  it("decoded-br emits \\n positions back as \\.br\\ on emit", () => {
    const raw = loadEdgeCaseFixture("decoded-br");
    const original = parseHL7(raw);
    const emitted = original.toString();
    // After emit, OBX-5 should contain \.br\ (NOT literal \n) because
    // reescape translates \n -> \.br\.
    expect(emitted).toContain("\\.br\\");
    // No literal LF anywhere — only CR segment terminators.
    expect(emitted.includes("\n")).toBe(false);
    // Raw tree's OBX-5 first subcomponent stores the DECODED form (literal
    // \n chars from the \.br\ sequences on the wire).
    const obx = original.rawSegments.find((s) => s.name === "OBX");
    const obx5 = obx?.fields[5]?.repetitions[0]?.components[0]?.subcomponents[0];
    expect(obx5).toContain("\n");
    // Structural round-trip holds.
    assertStructuralRoundTrip(raw);
  });

  it("oru-r01 preserves ~-separated repetition count", () => {
    const raw = loadFixture("oru-r01");
    const original = parseHL7(raw);
    const roundTripped = parseHL7(original.toString());
    // PID-3 has 2 repetitions (MRN ~ SSN) in the fixture.
    const pidOriginal = original.rawSegments.find((s) => s.name === "PID");
    const pidRound = roundTripped.rawSegments.find((s) => s.name === "PID");
    expect(pidOriginal?.fields[3]?.repetitions.length).toBe(2);
    expect(pidRound?.fields[3]?.repetitions.length).toBe(2);
    // And 3 OBX segments (observations) survive.
    const obxOriginal = original.rawSegments.filter((s) => s.name === "OBX");
    const obxRound = roundTripped.rawSegments.filter((s) => s.name === "OBX");
    expect(obxOriginal.length).toBe(3);
    expect(obxRound.length).toBe(3);
  });

  it("adt-a01 structural round-trip produces identical rawSegments tree", () => {
    const raw = loadFixture("adt-a01");
    const original = parseHL7(raw);
    const roundTripped = parseHL7(original.toString());
    // Deep structural equivalence on the whole tree.
    expect(roundTripped.rawSegments).toEqual(original.rawSegments);
    expect(roundTripped.encodingCharacters).toEqual(original.encodingCharacters);
    // Segment roster preserved (MSH + EVN + PID + PV1).
    const names = original.rawSegments.map((s) => s.name);
    expect(names).toEqual(["MSH", "EVN", "PID", "PV1"]);
  });
});
