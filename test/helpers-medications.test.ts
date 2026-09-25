/**
 * Phase D: integration tests for `msg.medications()` (RXO/RXE/RXD/RXA with
 * RXR/RXC grouped positionally). Covers the four contexts, give-code
 * provenance, the amount-vs-strength separation (never reconciled), positional
 * grouping, the HELPERS-07 never-throws contract, and the ORC-1 order control
 * each medication carries from the ORC that opened its order group.
 */

import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, expectTypeOf, it } from "vitest";

import { parseHL7 } from "../src/index.js";
import type { Immunization, Medication, Order } from "../src/index.js";

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
    // amount (how much is given): RXE-3/4/5
    expect(m?.amount?.minimum).toBe(2);
    expect(m?.amount?.maximum).toBe(2);
    expect(m?.amount?.units?.identifier).toBe("TAB");
    // strength (concentration), RXE-25/26, a SEPARATE field
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
  it("strict-parses numerics: non-numeric amount → omitted key, never NaN", () => {
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

describe("helpers/medications: ORC-1 order control of the ORC that opened the group", () => {
  // RXE-1 (Quantity/Timing) is left empty in these RXE segments, so the ORC-7
  // legacy timing is the only legacy source a group can read.
  const RXE_A = "RXE||A^DrugA^RXN|1|1|TAB";
  const RXE_B = "RXE||B^DrugB^RXN|1|1|TAB";

  /** A medication with its `orderControl` key removed, for AC-3's invariance check. */
  function withoutOrderControl(med: Medication): Record<string, unknown> {
    return Object.fromEntries(Object.entries(med).filter(([key]) => key !== "orderControl"));
  }

  /**
   * One pharmacy body whose every ORC carries `code` as ORC-1: four order
   * groups exercising ORC-7 legacy timing, RXE-25/26 strength, RXR, RXC, a TQ1
   * and all four RX* contexts, so any field that moved with the code would show.
   */
  function pharmacyBody(code: string): string {
    return (
      MSH +
      PID +
      `ORC|${code}|P1|F1||||1^Q8H^^20250101^^R^^^^^^9\r` +
      "RXO|1100^Amoxicillin^RXN|250|500|mg^milligram^UCUM|CAP^capsule^UCUM\r" +
      "RXE||1049630^Acetaminophen 325 MG Oral Tablet^RXN|2|2|TAB^tablet^UCUM||||||||||||||||||||325|mg^milligram^UCUM\r" +
      "RXR|PO^Oral^HL70162|LA^Left Arm^HL70163\r" +
      "RXC|B|D5W^Dextrose 5%^RXN|1000|mL^mL^UCUM\r" +
      `ORC|${code}|P2|F2\r` +
      "TQ1|1||Q6H\r" +
      "RXE||2000^Ibuprofen^RXN|1|1|TAB\r" +
      `ORC|${code}|P3|F3\r` +
      "RXD|1|0093505601^Drug^NDC|20260419|30|CAP\r" +
      `ORC|${code}|P4|F4\r` +
      "RXA|0|1|20260419140000||49281041688^Influenza^CVX|0.5|mL^mL^UCUM"
    );
  }

  it("AC-1: surfaces the opening ORC's ORC-1 verbatim on every RX* context", () => {
    const parents = [
      "RXO|A^DrugA^RXN|1||mg",
      RXE_A,
      "RXD|1|A^DrugA^NDC|20260419|30|CAP",
      "RXA|0|1|20260419140000||A^DrugA^CVX|0.5|mL^mL^UCUM",
    ];
    for (const parent of parents) {
      const meds = parseHL7(MSH + PID + "ORC|NW|P1|F1\r" + parent).medications();
      expect(meds).toHaveLength(1);
      expect(meds[0]?.orderControl).toBe("NW");
    }
  });

  it("AC-2: omits orderControl when the message carries no ORC at all", () => {
    const meds = parseHL7(MSH + PID + "RXO|A^DrugA^RXN|1||mg\r" + RXE_B).medications();
    expect(meds).toHaveLength(2);
    for (const med of meds) expect("orderControl" in med).toBe(false);
  });

  it("AC-2: an RX* before the first ORC gets no orderControl; the later group keeps its own", () => {
    const raw = MSH + PID + RXE_A + "\r" + "ORC|DC|P2|F2\r" + RXE_B;
    const meds = parseHL7(raw).medications();
    expect(meds).toHaveLength(2);
    expect(meds[0]?.giveCode?.identifier).toBe("A");
    expect("orderControl" in (meds[0] ?? {})).toBe(false);
    expect(meds[1]?.orderControl).toBe("DC");
  });

  it("AC-3: the ORC-1 code moves no other field and no other key (NW DC OD HD CA CR XO RL ZZ)", () => {
    const baseline = parseHL7(pharmacyBody("NW")).medications();
    expect(baseline).toHaveLength(5);
    const baselineStripped = baseline.map(withoutOrderControl);
    for (const code of ["NW", "DC", "OD", "HD", "CA", "CR", "XO", "RL", "ZZ"]) {
      const meds = parseHL7(pharmacyBody(code)).medications();
      expect(meds).toHaveLength(baseline.length);
      for (const med of meds) expect(med.orderControl).toBe(code);
      expect(meds.map(withoutOrderControl)).toStrictEqual(baselineStripped);
    }
  });

  it("AC-4: every RX* of one ORC group carries its ORC-1; the ORC-7 timing stays on the first", () => {
    const groups: readonly (readonly [string, string])[] = [
      ["RXO|A^DrugA^RXN|1||mg", RXE_A], // ORC RXO RXE
      [RXE_A, "RXD|1|A^DrugA^NDC|20260419|30|CAP"], // ORC RXE RXD
    ];
    for (const [first, second] of groups) {
      const raw =
        MSH + PID + "ORC|HD|P1|F1||||1^Q8H^^20250101^^R^^^^^^9\r" + first + "\r" + second;
      const meds = parseHL7(raw).medications();
      expect(meds).toHaveLength(2);
      expect(meds.map((med) => med.orderControl)).toEqual(["HD", "HD"]);
      expect(meds[0]?.timings).toHaveLength(1);
      expect(meds[0]?.timings[0]?.source).toBe("legacy");
      expect(meds[0]?.timings[0]?.repeatPattern?.code).toBe("Q8H");
      expect(meds[1]?.timings).toEqual([]);
    }
  });

  it("AC-5: each medication carries its own group's ORC-1, never a neighbour's (NW, DC, HD)", () => {
    const raw =
      MSH +
      PID +
      "ORC|NW|P1|F1\r" +
      RXE_A +
      "\r" +
      "RXR|PO^Oral^HL70162\r" +
      "ORC|DC|P2|F2\r" +
      "RXO|B^DrugB^RXN|1||mg\r" +
      RXE_B +
      "\r" +
      "ORC|HD|P3|F3\r" +
      "RXD|1|C^DrugC^NDC|20260419|30|CAP";
    const meds = parseHL7(raw).medications();
    expect(meds.map((med) => [med.giveCode?.identifier, med.orderControl])).toEqual([
      ["A", "NW"],
      ["B", "DC"],
      ["B", "DC"],
      ["C", "HD"],
    ]);
  });

  it("AC-6: an empty ORC-1 omits orderControl: no empty string, no earlier group's code", () => {
    // `ORC|` (ORC-1 empty), a bare `ORC` with no fields, and an ORC whose later
    // fields are filled but ORC-1 is empty.
    for (const opener of ["ORC|", "ORC", "ORC||P2|F2"]) {
      const raw =
        MSH +
        PID +
        "ORC|NW|P1|F1\r" +
        RXE_A +
        "\r" +
        opener +
        "\r" +
        RXE_B +
        "\r" +
        "RXD|1|B^DrugB^NDC|20260419|30|CAP";
      const meds = parseHL7(raw).medications();
      expect(meds).toHaveLength(3);
      expect(meds[0]?.orderControl).toBe("NW");
      for (const med of meds.slice(1)) {
        expect(med.giveCode?.identifier).toBe("B");
        expect("orderControl" in med).toBe(false);
      }
    }
  });

  it("AC-7: a trailing ORC after the last RX* never lends its ORC-1 to an earlier medication", () => {
    const opened = parseHL7(MSH + PID + "ORC|NW|P1|F1\r" + RXE_A + "\r" + "ORC|DC|P2|F2");
    expect(opened.medications()).toHaveLength(1);
    expect(opened.medications()[0]?.orderControl).toBe("NW");

    const unopened = parseHL7(MSH + PID + RXE_A + "\r" + "RXR|PO^Oral^HL70162\r" + "ORC|DC|P2|F2");
    expect(unopened.medications()).toHaveLength(1);
    expect("orderControl" in (unopened.medications()[0] ?? {})).toBe(false);
  });

  it("AC-8: an unlisted or odd-case ORC-1 is surfaced exactly as sent and never throws", () => {
    for (const code of ["ZZ", "dc"]) {
      const raw = MSH + PID + `ORC|${code}|P1|F1\r` + RXE_A;
      let meds: readonly Medication[] = [];
      expect(() => {
        meds = parseHL7(raw).medications();
      }).not.toThrow();
      expect(meds).toHaveLength(1);
      expect(meds[0]?.orderControl).toBe(code);
    }
  });

  it("AC-9: orderControl is typed like Order and Immunization and the medication is frozen", () => {
    // Same name, optionality, readonly-ness and type as the two precedents.
    expectTypeOf<Pick<Medication, "orderControl">>().toEqualTypeOf<Pick<Order, "orderControl">>();
    expectTypeOf<Pick<Medication, "orderControl">>().toEqualTypeOf<
      Pick<Immunization, "orderControl">
    >();
    const meds = parseHL7(MSH + PID + "ORC|NW|P1|F1\r" + RXE_A).medications();
    expect(meds).toHaveLength(1);
    for (const med of meds) {
      const orderControl: string | undefined = med.orderControl;
      expect(orderControl).toBe("NW");
      expect(Object.isFrozen(med)).toBe(true);
    }
  });
});
