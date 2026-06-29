/**
 * Phase D — integration tests for `msg.medications()` (RXO/RXE/RXD/RXA with
 * RXR/RXC grouped positionally). Covers the four contexts, give-code
 * provenance, the amount-vs-strength separation (never reconciled), positional
 * grouping, and the HELPERS-07 never-throws contract.
 */

import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

import { parseHL7 } from "../src/index.js";

const FIXTURE_DIR = path.join(
  path.dirname(fileURLToPath(import.meta.url)),
  "fixtures",
  "canonical",
);
function loadFixture(name: string): string {
  return readFileSync(path.join(FIXTURE_DIR, `${name}.hl7`), "utf8");
}

const MSH = "MSH|^~\\&|APP|FAC|||20250102||RDE^O11|1|P|2.5\r";
const PID = "PID|||X\r";

describe("helpers/medications: contexts", () => {
  it("returns [] when no RX* segment present (D-05)", () => {
    expect(parseHL7(MSH + PID).medications()).toEqual([]);
  });

  it("RXO → order context with give code, min/max amount, dosage form", () => {
    const fx = MSH + PID + "RXO|1100^Amoxicillin^RXN|250|500|mg^milligram^UCUM|CAP^capsule^UCUM";
    const meds = parseHL7(fx).medications();
    expect(meds).toHaveLength(1);
    const m = meds[0];
    expect(m?.context).toBe("order");
    expect(m?.giveCode?.identifier).toBe("1100");
    expect(m?.giveCode?.nameOfCodingSystem).toBe("RXN");
    expect(m?.amount?.minimum).toBe(250);
    expect(m?.amount?.maximum).toBe(500);
    expect(m?.amount?.units?.identifier).toBe("mg");
    expect(m?.amount?.units?.nameOfCodingSystem).toBe("UCUM");
    expect(m?.dosageForm?.identifier).toBe("CAP");
    expect("strength" in (m ?? {})).toBe(false);
  });

  it("RXE → encoded context with give amount AND separate give strength", () => {
    const m = parseHL7(loadFixture("rde-o11-pharmacy")).medications()[0];
    expect(m?.context).toBe("encoded");
    expect(m?.giveCode?.identifier).toBe("1049630");
    expect(m?.giveCode?.nameOfCodingSystem).toBe("RXN");
    // amount (how much is given) — RXE-3/4/5
    expect(m?.amount?.minimum).toBe(2);
    expect(m?.amount?.maximum).toBe(2);
    expect(m?.amount?.units?.identifier).toBe("TAB");
    // strength (concentration) — RXE-25/26 — a SEPARATE field
    expect(m?.strength?.value).toBe(325);
    expect(m?.strength?.units?.identifier).toBe("mg");
    expect(m?.strength?.units?.nameOfCodingSystem).toBe("UCUM");
  });

  it("RXD → dispense context with a SINGLE actual-dispense amount (no maximum)", () => {
    const m = parseHL7(loadFixture("rds-o13-dispense")).medications()[0];
    expect(m?.context).toBe("dispense");
    expect(m?.giveCode?.identifier).toBe("0093505601");
    expect(m?.giveCode?.nameOfCodingSystem).toBe("NDC");
    expect(m?.amount?.minimum).toBe(30);
    expect("maximum" in (m?.amount ?? {})).toBe(false);
    expect(m?.amount?.units?.identifier).toBe("CAP");
  });

  it("RXA → administration context with a SINGLE administered amount", () => {
    const fx = MSH + PID + "RXA|0|1|20260419140000||49281041688^Influenza^CVX|0.5|mL^mL^UCUM";
    const m = parseHL7(fx).medications()[0];
    expect(m?.context).toBe("administration");
    expect(m?.giveCode?.identifier).toBe("49281041688");
    expect(m?.giveCode?.nameOfCodingSystem).toBe("CVX");
    expect(m?.amount?.minimum).toBe(0.5);
    expect("maximum" in (m?.amount ?? {})).toBe(false);
    expect(m?.amount?.units?.identifier).toBe("mL");
  });
});

describe("helpers/medications: amount vs strength are never reconciled (Phase D §4)", () => {
  it("surfaces BOTH the coded drug and the disagreeing explicit strength", () => {
    const m = parseHL7(loadFixture("ndc-redundant-strength")).medications()[0];
    // The NDC give code implies a 10 mg product...
    expect(m?.giveCode?.identifier).toBe("00071015523");
    expect(m?.giveCode?.nameOfCodingSystem).toBe("NDC");
    expect(m?.giveCode?.text).toContain("10 MG");
    // ...while the explicit RXE-25 strength says 20 mg. BOTH are surfaced; the
    // helper never picks a winner.
    expect(m?.strength?.value).toBe(20);
    expect(m?.strength?.units?.identifier).toBe("mg");
  });
});

describe("helpers/medications: positional grouping of RXR / RXC", () => {
  it("groups RXR (route) + RXC (component) under the preceding RX* parent", () => {
    const fx =
      MSH +
      PID +
      "RXE|1|D5W1000^D5W 1000 mL^RXN|1|1|BAG\r" +
      "RXR|IV^Intravenous^HL70162|LA^Left Arm^HL70163\r" +
      "RXC|B|D5W^Dextrose 5%^RXN|1000|mL^mL^UCUM\r" +
      "RXC|A|KCL^Potassium Chloride^RXN|20|mEq^mEq^UCUM";
    const m = parseHL7(fx).medications()[0];
    expect(m?.routes).toHaveLength(1);
    expect(m?.routes[0]?.route?.identifier).toBe("IV");
    expect(m?.routes[0]?.route?.nameOfCodingSystem).toBe("HL70162");
    expect(m?.routes[0]?.site?.identifier).toBe("LA");
    expect(m?.components).toHaveLength(2);
    expect(m?.components[0]?.type).toBe("B");
    expect(m?.components[0]?.code?.identifier).toBe("D5W");
    expect(m?.components[0]?.amount).toBe(1000);
    expect(m?.components[1]?.type).toBe("A");
    expect(m?.components[1]?.amount).toBe(20);
  });

  it("opens a new medication per RX* parent; RXR/RXC attach to the right one", () => {
    const fx =
      MSH +
      PID +
      "RXE|1|A^DrugA^RXN|1|1|TAB\r" +
      "RXR|PO^Oral^HL70162\r" +
      "RXD|1|B^DrugB^NDC|20260419|10|CAP\r" +
      "RXR|IV^Intravenous^HL70162";
    const meds = parseHL7(fx).medications();
    expect(meds).toHaveLength(2);
    expect(meds[0]?.context).toBe("encoded");
    expect(meds[0]?.routes[0]?.route?.identifier).toBe("PO");
    expect(meds[1]?.context).toBe("dispense");
    expect(meds[1]?.routes[0]?.route?.identifier).toBe("IV");
  });

  it("RXR/RXC before any RX* parent are dropped (no phantom medication)", () => {
    const fx = MSH + PID + "RXR|PO^Oral\r" + "RXC|B|X^Y^RXN\r" + "RXE|1|A^DrugA^RXN|1|1|TAB";
    const meds = parseHL7(fx).medications();
    expect(meds).toHaveLength(1);
    expect(meds[0]?.routes).toEqual([]);
    expect(meds[0]?.components).toEqual([]);
  });

  it("routes and components are always present (empty) arrays", () => {
    const fx = MSH + PID + "RXE|1|A^DrugA^RXN|1|1|TAB";
    const m = parseHL7(fx).medications()[0];
    expect(m?.routes).toEqual([]);
    expect(m?.components).toEqual([]);
  });
});

describe("helpers/medications: fail-safe + immutability", () => {
  it("strict-parses numerics — non-numeric amount → omitted key, never NaN", () => {
    const fx = MSH + PID + "RXO|1100^Amoxicillin^RXN|notanumber||mg";
    const m = parseHL7(fx).medications()[0];
    expect("minimum" in (m?.amount ?? {})).toBe(false);
    expect(m?.amount?.units?.identifier).toBe("mg");
  });

  it("never throws on malformed RX* segments (HELPERS-07)", () => {
    expect(() => {
      const msg = parseHL7(MSH + PID + "RXO\r" + "RXE\r" + "RXD\r" + "RXA\r" + "RXR\r" + "RXC");
      const meds = msg.medications();
      expect(meds).toHaveLength(4); // one per RX* parent; empty RXR/RXC grouped
    }).not.toThrow();
  });

  it("returned array + entries are frozen and NOT memoized (D-01/D-06)", () => {
    const msg = parseHL7(MSH + PID + "RXE|1|A^DrugA^RXN|1|1|TAB\r" + "RXR|PO");
    const a = msg.medications();
    const b = msg.medications();
    expect(Object.isFrozen(a)).toBe(true);
    expect(Object.isFrozen(a[0])).toBe(true);
    expect(Object.isFrozen(a[0]?.routes)).toBe(true);
    expect(a).not.toBe(b);
    expect(a).toStrictEqual(b);
  });

  it("all three canonical pharmacy fixtures parse + round-trip cleanly", () => {
    for (const name of ["rde-o11-pharmacy", "rds-o13-dispense", "ndc-redundant-strength"]) {
      const raw = loadFixture(name);
      const msg = parseHL7(raw);
      expect(() => msg.medications()).not.toThrow();
      // SER-02 structural round-trip.
      const rt = parseHL7(msg.toString());
      expect(rt.rawSegments).toEqual(msg.rawSegments);
    }
  });
});
