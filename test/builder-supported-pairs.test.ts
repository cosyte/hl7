/**
 * The invariant harness over the published typed-builder support set.
 *
 * Three claims are graded here, once, over the WHOLE set rather than per
 * family, so a new builder cannot publish a pair it does not actually satisfy:
 *
 *   1. the set is machine-readable and covers every pair the structural
 *      authority names;
 *   2. it excludes every pair whose registry entry requires a segment no typed
 *      init can supply;
 *   3. every published pair, built from a typed init, re-parses with zero
 *      warnings and no missing expected structure group.
 *
 * All values are synthetic.
 */

import { describe, expect, it } from "vitest";

import {
  MESSAGE_STRUCTURE_DEFINITIONS,
  SUPPORTED_BUILDER_MESSAGES,
  TYPED_BUILDER_COVERAGE,
  buildAck,
  buildAdt,
  buildOru,
  findMessageStructureDefinition,
  parseHL7,
  supportsBuilderMessage,
  type Hl7Message,
  type SupportedBuilderMessage,
} from "../src/index.js";

import { ENVELOPE, buildSupportedPair } from "./_helpers/supported-pairs.js";

/** The (message code, trigger event) pairs the spec's structural authority names. */
const AUTHORITY_PAIRS: readonly string[] = [
  ...["S12", "S13", "S14", "S15", "S16", "S17", "S18", "S19"].map((e) => `SIU^${e}`),
  ...["S20", "S21", "S22", "S23", "S24", "S26", "S27"].map((e) => `SIU^${e}`),
  ...["T01", "T02", "T03", "T04", "T05", "T06"].map((e) => `MDM^${e}`),
  ...["T07", "T08", "T09", "T10", "T11"].map((e) => `MDM^${e}`),
  "DFT^P03",
  "DFT^P11",
  "VXU^V04",
  "ORM^O01",
  ...["A40", "A41", "A42", "A43", "A44", "A47", "A49"].map((e) => `ADT^${e}`),
  ...["A45", "A50", "A51"].map((e) => `ADT^${e}`),
];

function key(m: SupportedBuilderMessage): string {
  return `${m.messageCode}^${m.triggerEvent}`;
}

describe("the published support set is machine-readable", () => {
  it("is a frozen list of (message code, trigger event) pairs naming their builder", () => {
    expect(Object.isFrozen(SUPPORTED_BUILDER_MESSAGES)).toBe(true);
    expect(SUPPORTED_BUILDER_MESSAGES.length).toBeGreaterThan(0);
    for (const m of SUPPORTED_BUILDER_MESSAGES) {
      expect(typeof m.messageCode).toBe("string");
      expect(m.messageCode.length).toBeGreaterThan(0);
      expect(typeof m.triggerEvent).toBe("string");
      expect(m.builder).toMatch(/^build[A-Z]/);
      expect(Array.isArray(m.requiredSegments)).toBe(true);
    }
  });

  it("carries no duplicate pair", () => {
    const seen = SUPPORTED_BUILDER_MESSAGES.map(key);
    expect(new Set(seen).size).toBe(seen.length);
  });

  it("`supportsBuilderMessage` answers for every published pair", () => {
    for (const m of SUPPORTED_BUILDER_MESSAGES) {
      expect(supportsBuilderMessage(m.messageCode, m.triggerEvent)).toBe(true);
    }
    expect(supportsBuilderMessage("BAR", "P01")).toBe(false);
    expect(supportsBuilderMessage("ADT", "A20")).toBe(false);
  });

  it("an ACK entry matches on message code alone, as its registry entry does", () => {
    const ack = SUPPORTED_BUILDER_MESSAGES.filter((m) => m.messageCode === "ACK");
    expect(ack.map((m) => m.triggerEvent)).toEqual([""]);
    expect(supportsBuilderMessage("ACK", "A01")).toBe(true);
    expect(supportsBuilderMessage("ACK", "R01")).toBe(true);
  });
});

describe("the published support set is checked against the derived structure registry", () => {
  it("publishes only pairs whose required segments a typed init can supply", () => {
    for (const m of SUPPORTED_BUILDER_MESSAGES) {
      const coverage = TYPED_BUILDER_COVERAGE.find((c) => c.builder === m.builder);
      expect(coverage, `no coverage entry for ${m.builder}`).toBeDefined();
      const missing = m.requiredSegments.filter((s) => !(coverage?.segments ?? []).includes(s));
      expect(missing, `${key(m)} claims support it cannot supply`).toEqual([]);
    }
  });

  it("the published required segments match the registry entry exactly", () => {
    for (const m of SUPPORTED_BUILDER_MESSAGES) {
      const def = findMessageStructureDefinition(m.messageCode, m.triggerEvent);
      expect(def, `${key(m)} is not in the structure registry`).toBeDefined();
      expect([...m.requiredSegments]).toEqual([...(def?.requiredSegments ?? [])]);
    }
  });

  it("excludes every registry pair requiring a segment no typed init can supply", () => {
    const excluded: string[] = [];
    for (const def of MESSAGE_STRUCTURE_DEFINITIONS) {
      const coverage = TYPED_BUILDER_COVERAGE.find((c) => c.messageCode === def.messageCode);
      if (coverage === undefined) continue;
      if (def.requiredSegments.every((s) => coverage.segments.includes(s))) continue;
      // This definition needs content no typed init can supply: NO trigger event
      // of it may appear in the published set.
      for (const ev of def.triggerEvents) {
        if (SUPPORTED_BUILDER_MESSAGES.some((m) => key(m) === `${def.messageCode}^${ev}`)) {
          excluded.push(`${def.messageCode}^${ev}`);
        }
      }
    }
    expect(excluded).toEqual([]);
  });

  it("names the two ADT structures that are excluded, and why", () => {
    // A15 requires PRT and A20 requires NPU: no typed init supplies either, so
    // support is not claimed for them even though the registry recognises them.
    expect(findMessageStructureDefinition("ADT", "A15")?.requiredSegments).toContain("PRT");
    expect(findMessageStructureDefinition("ADT", "A20")?.requiredSegments).toContain("NPU");
    expect(supportsBuilderMessage("ADT", "A15")).toBe(false);
    expect(supportsBuilderMessage("ADT", "A20")).toBe(false);
  });
});

describe("every published pair round-trips clean", () => {
  it.each(SUPPORTED_BUILDER_MESSAGES.map((m) => [key(m), m] as const))(
    "%s builds, re-parses with zero warnings and no missing group",
    (label, m) => {
      const built: Hl7Message = buildSupportedPair(m);
      const round = parseHL7(built.toString());
      expect(round.warnings, `${label} re-parsed with warnings`).toEqual([]);
      expect(round.structure.recognized).toBe(true);
      expect(round.structure.missingGroups, `${label} is missing a group`).toEqual([]);
      const present = new Set(round.allSegments().map((s) => s.type));
      for (const seg of m.requiredSegments) {
        expect(present.has(seg), `${label} omitted the required ${seg}`).toBe(true);
      }
    },
  );

  it("the harness reds when a pair does not round-trip clean", () => {
    // A negative control on the harness itself: an ADT built for a merge event
    // WITHOUT the merge content is exactly the shape the invariant must catch.
    const bare = buildAdt("A01", { patient: { name: { familyName: "Control" } } });
    const forged = parseHL7(bare.toString().replace("ADT^A01", "ADT^A40"));
    expect(forged.structure.missingGroups).toContain("MRG");
  });
});

describe("the support set covers the structural authority", () => {
  it("publishes every (message code, trigger event) pair the authority names", () => {
    const published = new Set(
      SUPPORTED_BUILDER_MESSAGES.map((m) =>
        m.triggerEvent === "" ? m.messageCode : `${m.messageCode}^${m.triggerEvent}`,
      ),
    );
    const missing = AUTHORITY_PAIRS.filter((p) => !published.has(p));
    expect(missing).toEqual([]);
  });

  it("still publishes the pairs the pre-existing typed builders satisfy", () => {
    expect(supportsBuilderMessage("ADT", "A01")).toBe(true);
    expect(supportsBuilderMessage("ORU", "R01")).toBe(true);
    expect(supportsBuilderMessage("ACK", "")).toBe(true);
    // Unchanged behaviour, re-proved through the pre-existing builders:
    const adt = parseHL7(buildAdt("A01", { ...ENVELOPE, patient: { setId: "1" } }).toString());
    expect(adt.warnings).toEqual([]);
    const oru = parseHL7(
      buildOru({
        ...ENVELOPE,
        patient: { setId: "1" },
        observations: [{ setId: "1", valueType: "ST", value: "x" }],
      }).toString(),
    );
    expect(oru.warnings).toEqual([]);
    const ack = parseHL7(buildAck(adt, { code: "AA" }).toString());
    expect(ack.warnings).toEqual([]);
  });
});
