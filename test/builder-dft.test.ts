/**
 * Round-trip tests for the typed `DFT` builder.
 *
 * Acceptance exercised here:
 *   - **spec-clean golden**: the builder emits byte-for-byte the recorded
 *     golden for fixed inputs.
 *   - **zero-warning + structurally complete** for both recognised events.
 *   - **read-side round trip**: `msg.charges()` returns the charges supplied,
 *     in the order supplied, and no charge value the caller did not supply.
 *   - **no money as a float**: the amount survives emit and re-read verbatim.
 *
 * All values are synthetic.
 */

import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

import { buildDft, parseHL7 } from "../src/index.js";

import { DFT_INIT, ENVELOPE, PATIENT } from "./_helpers/supported-pairs.js";

function golden(name: string): string {
  return readFileSync(fileURLToPath(new URL(`./fixtures/build/${name}`, import.meta.url)), "utf8");
}

function toGoldenForm(hl7: string): string {
  return hl7.replaceAll("\r", "\n") + "\n";
}

describe("buildDft", () => {
  it("emits the recorded spec-clean golden for fixed inputs", () => {
    expect(toGoldenForm(buildDft("P03", DFT_INIT).toString())).toBe(golden("dft-p03.golden.hl7"));
  });

  it("re-parses with zero warnings and is structurally complete, both events", () => {
    for (const event of ["P03", "P11"]) {
      const round = parseHL7(buildDft(event, DFT_INIT).toString());
      expect(round.warnings, `DFT^${event}`).toEqual([]);
      expect(round.structure.recognized).toBe(true);
      expect(round.structure.missingGroups).toEqual([]);
      expect(round.meta.type).toBe(`DFT^${event}`);
    }
  });

  it("reads back every supplied charge, in the order supplied", () => {
    const round = parseHL7(buildDft("P03", DFT_INIT).toString());
    const charges = round.charges();
    expect(charges.length).toBe(2);

    const [first, second] = charges;
    expect(first?.transactionDate?.raw).toBe("20260801");
    expect(first?.transactionType).toBe("CG");
    expect(first?.transactionCode?.identifier).toBe("80053");
    expect(first?.transactionCode?.text).toBe("Metabolic panel");
    expect(first?.quantity).toBe(1);
    expect(first?.amountExtended).toBe("150.00&USD");
    expect(first?.amountUnit).toBe("150.00&USD^AP");
    expect(first?.diagnoses.map((d) => d.identifier)).toEqual(["E11.9", "I10"]);

    // Order is the order supplied, not sorted or re-grouped.
    expect(second?.transactionType).toBe("CD");
    expect(second?.transactionCode?.identifier).toBe("99213");
    expect(second?.quantity).toBe(2);
    expect(second?.amountExtended).toBe("75.50&USD");
  });

  it("never turns money into a float: precision and denomination survive verbatim", () => {
    const msg = buildDft("P03", {
      ...ENVELOPE,
      patient: PATIENT,
      charges: [{ amountExtended: { price: "0.10", denomination: "EUR" } }],
    });
    const round = parseHL7(msg.toString());
    expect(round.get("FT1.11.1.1")).toBe("0.10");
    expect(round.get("FT1.11.1.2")).toBe("EUR");
    expect(round.charges()[0]?.amountExtended).toBe("0.10&EUR");
  });

  it("emits no charge value the caller did not supply", () => {
    const msg = buildDft("P03", {
      ...ENVELOPE,
      patient: PATIENT,
      charges: [{ transactionType: "CG" }],
    });
    const charge = parseHL7(msg.toString()).charges()[0];
    expect(charge?.transactionType).toBe("CG");
    expect(charge?.transactionDate).toBeUndefined();
    expect(charge?.transactionCode).toBeUndefined();
    expect(charge?.quantity).toBeUndefined();
    expect(charge?.amountExtended).toBeUndefined();
    expect(charge?.amountUnit).toBeUndefined();
    expect(charge?.diagnoses).toEqual([]);
  });

  it("emits a PV1 only when a visit is supplied", () => {
    const without = parseHL7(
      buildDft("P03", { ...ENVELOPE, patient: PATIENT, charges: [{ setId: "1" }] }).toString(),
    );
    expect(without.segments("PV1").length).toBe(0);
    expect(without.warnings).toEqual([]);

    const with_ = parseHL7(buildDft("P03", DFT_INIT).toString());
    expect(with_.segments("PV1").length).toBe(1);
    expect(with_.visit?.patientClass).toBe("O");
  });

  it("emits only the amount parts supplied", () => {
    const round = parseHL7(
      buildDft("P03", {
        ...ENVELOPE,
        patient: PATIENT,
        charges: [
          { setId: "1", amountExtended: { price: "10.00" }, amountUnit: { priceType: "AP" } },
          { setId: "2", amountExtended: { denomination: "USD" }, diagnoses: { identifier: "I10" } },
        ],
      }).toString(),
    );
    const charges = round.charges();
    expect(charges[0]?.amountExtended).toBe("10.00");
    expect(charges[0]?.amountUnit).toBe("^AP");
    expect(charges[1]?.amountExtended).toBe("&USD");
    expect(charges[1]?.diagnoses.map((d) => d.identifier)).toEqual(["I10"]);
    expect(round.warnings).toEqual([]);
  });

  it("emit then parse then rebuild preserves the modelled charge fields", () => {
    const first = parseHL7(buildDft("P03", DFT_INIT).toString());
    const rebuilt = parseHL7(
      buildDft("P03", {
        ...ENVELOPE,
        patient: PATIENT,
        charges: [
          {
            transactionType: first.charges()[0]?.transactionType ?? "",
            transactionCode: first.charges()[0]?.transactionCode ?? {},
            quantity: first.get("FT1.10") ?? "",
            amountExtended: {
              price: first.get("FT1.11.1.1") ?? "",
              denomination: first.get("FT1.11.1.2") ?? "",
            },
          },
        ],
      }).toString(),
    );
    const second = rebuilt.charges()[0];
    expect(second?.transactionType).toBe("CG");
    expect(second?.transactionCode?.identifier).toBe("80053");
    expect(second?.quantity).toBe(1);
    expect(second?.amountExtended).toBe("150.00&USD");
    expect(rebuilt.warnings).toEqual([]);
  });
});
