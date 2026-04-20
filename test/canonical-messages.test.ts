/**
 * TEST-02 canonical message sweep. For each canonical fixture in
 * `test/fixtures/canonical/`, asserts parse success, SER-02 structural
 * round-trip, and a per-fixture helper probe per CONTEXT.md D-20.
 *
 * Fixture roster (9 total):
 *   - adt-a01, adt-a04, adt-a08 — three ADT flavors
 *   - oru-r01 — observation results (also doubles as TEST-02 repeating-field
 *     structural case via PID-3 ~-separated reps and 3 OBX rows)
 *   - orm-o01 — order message
 *   - siu-s12 — scheduling notification (parse + round-trip only;
 *     no scheduling helper in v1)
 *   - mdm-t02 — document notification (parse + round-trip only;
 *     no document helper in v1)
 *   - z-segments — ADT^A01 + ZXX/ZYY ad-hoc Z-segments
 *   - nested-subcomponents — PID-5 with `&`-delimited subcomponents
 *
 * Subcomponent access note: `Field` exposes subcomponents via the raw tree
 * (`field.repetitions[i].components[c].subcomponents[s]`) rather than a
 * `.component(c).subcomponent(s)` wrapper chain (matches the idiom used in
 * `test/round-trip.test.ts` and `test/parser-tokenize.test.ts`).
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

function loadFixture(name: string): string {
  return readFileSync(path.join(FIXTURE_DIR, `${name}.hl7`), "utf8");
}

describe("TEST-02 canonical: ADT^A01 (adt-a01.hl7)", () => {
  const fixture = loadFixture("adt-a01");
  it("parses successfully", () => {
    expect(() => parseHL7(fixture)).not.toThrow();
  });
  it("structural round-trip per SER-02", () => {
    assertStructuralRoundTrip(fixture);
  });
  it("D-20 helper probe — msg.patient.mrn === 'MRN12345'", () => {
    expect(parseHL7(fixture).patient?.mrn).toBe("MRN12345");
  });
  it("D-20 helper probe — msg.visit.patientClass === 'I'", () => {
    expect(parseHL7(fixture).visit?.patientClass).toBe("I");
  });
});

describe("TEST-02 canonical: ADT^A04 (adt-a04.hl7)", () => {
  const fixture = loadFixture("adt-a04");
  it("parses successfully", () => {
    expect(() => parseHL7(fixture)).not.toThrow();
  });
  it("structural round-trip per SER-02", () => {
    assertStructuralRoundTrip(fixture);
  });
  it("D-20 helper probe — msg.patient.mrn === 'MRN-A04-001'", () => {
    expect(parseHL7(fixture).patient?.mrn).toBe("MRN-A04-001");
  });
});

describe("TEST-02 canonical: ADT^A08 (adt-a08.hl7)", () => {
  const fixture = loadFixture("adt-a08");
  it("parses successfully", () => {
    expect(() => parseHL7(fixture)).not.toThrow();
  });
  it("structural round-trip per SER-02", () => {
    assertStructuralRoundTrip(fixture);
  });
  it("D-20 helper probe — msg.patient.mrn === 'MRN-A08-001'", () => {
    expect(parseHL7(fixture).patient?.mrn).toBe("MRN-A08-001");
  });
});

describe("TEST-02 canonical: ORU^R01 (oru-r01.hl7) — doubles as repeating-field case", () => {
  const fixture = loadFixture("oru-r01");
  it("parses successfully", () => {
    expect(() => parseHL7(fixture)).not.toThrow();
  });
  it("structural round-trip per SER-02", () => {
    assertStructuralRoundTrip(fixture);
  });
  it("D-20 helper probe — msg.observations() has >=3 entries with .valueType populated", () => {
    const msg = parseHL7(fixture);
    const obs = msg.observations();
    expect(obs.length).toBeGreaterThanOrEqual(3);
    expect(obs[0]?.valueType).toBe("NM");
  });
});

describe("TEST-02 canonical: ORM^O01 (orm-o01.hl7)", () => {
  const fixture = loadFixture("orm-o01");
  it("parses successfully", () => {
    expect(() => parseHL7(fixture)).not.toThrow();
  });
  it("structural round-trip per SER-02", () => {
    assertStructuralRoundTrip(fixture);
  });
  it("D-20 helper probe — msg.orders().length >= 1", () => {
    expect(parseHL7(fixture).orders().length).toBeGreaterThanOrEqual(1);
  });
});

describe("TEST-02 canonical: SIU^S12 (siu-s12.hl7) — parse + round-trip only (no scheduling helper in v1)", () => {
  const fixture = loadFixture("siu-s12");
  it("parses successfully", () => {
    expect(() => parseHL7(fixture)).not.toThrow();
  });
  it("structural round-trip per SER-02", () => {
    assertStructuralRoundTrip(fixture);
  });
});

describe("TEST-02 canonical: MDM^T02 (mdm-t02.hl7) — parse + round-trip only (no document helper in v1)", () => {
  const fixture = loadFixture("mdm-t02");
  it("parses successfully", () => {
    expect(() => parseHL7(fixture)).not.toThrow();
  });
  it("structural round-trip per SER-02", () => {
    assertStructuralRoundTrip(fixture);
  });
});

describe("TEST-02 canonical: z-segments (z-segments.hl7) — Z-segment structural case", () => {
  const fixture = loadFixture("z-segments");
  it("parses successfully", () => {
    expect(() => parseHL7(fixture)).not.toThrow();
  });
  it("structural round-trip per SER-02", () => {
    assertStructuralRoundTrip(fixture);
  });
  it("D-18/D-20 — allSegments includes ZXX and ZYY", () => {
    const segments = parseHL7(fixture).allSegments();
    const names = segments.map((s) => s.type);
    expect(names).toContain("ZXX");
    expect(names).toContain("ZYY");
  });
  it("D-18 — each unknown Z-segment emits UNKNOWN_SEGMENT warning (no profile applied)", () => {
    const msg = parseHL7(fixture);
    const unknownCount = msg.warnings.filter((w) => w.code === "UNKNOWN_SEGMENT").length;
    expect(unknownCount).toBeGreaterThanOrEqual(2);
  });
});

describe("TEST-02 canonical: nested-subcomponents (nested-subcomponents.hl7) — nested-subcomponent structural case", () => {
  const fixture = loadFixture("nested-subcomponents");
  it("parses successfully", () => {
    expect(() => parseHL7(fixture)).not.toThrow();
  });
  it("structural round-trip per SER-02", () => {
    assertStructuralRoundTrip(fixture);
  });
  it("D-18/D-20 — PID-5 component 8 subcomponent 2 resolves to 'Jones'", () => {
    // `Field` has no `.component(n)` wrapper; access subcomponents via the raw
    // tree per the existing `test/round-trip.test.ts` / `test/parser-tokenize.test.ts`
    // idiom: field(N).repetitions[R].components[C].subcomponents[S] (0-indexed).
    // PID-5 component 8 → components[7]; subcomponent 2 → subcomponents[1].
    const msg = parseHL7(fixture);
    const pid = msg.allSegments().find((s) => s.type === "PID");
    expect(pid).toBeDefined();
    const sub = pid?.field(5).repetitions[0]?.components[7]?.subcomponents[1];
    expect(sub).toBe("Jones");
  });
});
