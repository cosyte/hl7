/**
 * Round-trip tests for the typed `VXU^V04` builder.
 *
 * Acceptance exercised here:
 *   - **spec-clean golden**: the builder emits byte-for-byte the recorded
 *     golden for fixed inputs.
 *   - **zero-warning + structurally complete**: a built message re-parses with
 *     `warnings: []` and `msg.structure.missingGroups` empty.
 *   - **read-side round trip**: `msg.immunizations()` returns the doses
 *     supplied, in the order supplied, and no immunization value the caller did
 *     not supply.
 *
 * All values are synthetic.
 */

import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

import { buildVxu, parseHL7 } from "../src/index.js";

import { ENVELOPE, PATIENT, VXU_INIT } from "./_helpers/supported-pairs.js";

function golden(name: string): string {
  return readFileSync(fileURLToPath(new URL(`./fixtures/build/${name}`, import.meta.url)), "utf8");
}

function toGoldenForm(hl7: string): string {
  return hl7.replaceAll("\r", "\n") + "\n";
}

describe("buildVxu", () => {
  it("emits the recorded spec-clean golden for fixed inputs", () => {
    expect(toGoldenForm(buildVxu(VXU_INIT).toString())).toBe(golden("vxu-v04.golden.hl7"));
  });

  it("re-parses with zero warnings and is structurally complete", () => {
    const round = parseHL7(buildVxu(VXU_INIT).toString());
    expect(round.warnings).toEqual([]);
    expect(round.structure.recognized).toBe(true);
    expect(round.structure.missingGroups).toEqual([]);
    expect(round.meta.type).toBe("VXU^V04");
  });

  it("reads back every supplied immunization, in the order supplied", () => {
    const round = parseHL7(buildVxu(VXU_INIT).toString());
    const imms = round.immunizations();
    expect(imms.length).toBe(2);

    const [administered, refused] = imms;
    expect(administered?.orderControl).toBe("RE");
    expect(administered?.vaccineCode?.identifier).toBe("115");
    expect(administered?.vaccineCode?.text).toBe("Tdap");
    expect(administered?.vaccineCode?.nameOfCodingSystem).toBe("CVX");
    expect(administered?.administeredDateTime?.raw).toBe("20260801");
    expect(administered?.doseAmount).toBe(0.5);
    expect(administered?.doseUnits?.identifier).toBe("mL");
    expect(administered?.doseUnitsAreUcum).toBe(true);
    expect(administered?.recordOrigin).toBe("administered");
    expect(administered?.lotNumber).toBe("LOT-9");
    expect(administered?.expirationDate?.raw).toBe("20270101");
    expect(administered?.manufacturer?.identifier).toBe("PMC");
    expect(administered?.completionStatus).toBe("CP");
    expect(administered?.actionCode).toBe("A");
    expect(administered?.routes.length).toBe(1);
    expect(administered?.routes[0]?.route?.identifier).toBe("IM");
    expect(administered?.routes[0]?.site?.identifier).toBe("LD");
    expect(administered?.observations.length).toBe(1);
    // OBX-2 declares CE, so the typed value is the coded element.
    expect(administered?.observations[0]?.value).toEqual({ identifier: "V02" });

    expect(refused?.vaccineCode?.identifier).toBe("150");
    expect(refused?.refusalReason?.identifier).toBe("00");
    expect(refused?.completionStatus).toBe("RE");
  });

  it("emits no immunization value the caller did not supply", () => {
    const msg = buildVxu({
      ...ENVELOPE,
      patient: PATIENT,
      immunizations: [{ vaccineCode: { identifier: "115" } }],
    });
    const imm = parseHL7(msg.toString()).immunizations()[0];
    expect(imm?.vaccineCode?.identifier).toBe("115");
    expect(imm?.doseAmount).toBeUndefined();
    expect(imm?.doseUnits).toBeUndefined();
    expect(imm?.doseUnitsAreUcum).toBeUndefined();
    expect(imm?.actionCode).toBeUndefined();
    expect(imm?.completionStatus).toBeUndefined();
    expect(imm?.recordOrigin).toBeUndefined();
    expect(imm?.informationSource).toBeUndefined();
    expect(imm?.lotNumber).toBeUndefined();
    expect(imm?.manufacturer).toBeUndefined();
    expect(imm?.administeredDateTime).toBeUndefined();
    expect(imm?.orderControl).toBeUndefined();
    expect(imm?.routes).toEqual([]);
    expect(imm?.observations).toEqual([]);
  });

  it("emits an ORC only when an order control is supplied", () => {
    const without = parseHL7(
      buildVxu({
        ...ENVELOPE,
        patient: PATIENT,
        immunizations: [{ vaccineCode: { identifier: "115" } }],
      }).toString(),
    );
    expect(without.segments("ORC").length).toBe(0);

    const with_ = parseHL7(
      buildVxu({
        ...ENVELOPE,
        patient: PATIENT,
        immunizations: [{ orderControl: "RE", vaccineCode: { identifier: "115" } }],
      }).toString(),
    );
    expect(with_.segments("ORC").length).toBe(1);
    expect(with_.immunizations()[0]?.orderControl).toBe("RE");
  });

  it("accepts a route with no site, and a numeric dose amount", () => {
    const round = parseHL7(
      buildVxu({
        ...ENVELOPE,
        patient: PATIENT,
        immunizations: [
          {
            vaccineCode: { identifier: "115" },
            doseAmount: 0.5,
            routes: [{ route: { identifier: "IM" } }, { site: { identifier: "LD" } }],
          },
        ],
      }).toString(),
    );
    const imm = round.immunizations()[0];
    expect(imm?.doseAmount).toBe(0.5);
    expect(imm?.routes.length).toBe(2);
    expect(imm?.routes[0]?.route?.identifier).toBe("IM");
    expect(imm?.routes[0]?.site).toBeUndefined();
    expect(imm?.routes[1]?.route).toBeUndefined();
    expect(imm?.routes[1]?.site?.identifier).toBe("LD");
    expect(round.warnings).toEqual([]);
  });

  it("emit then parse then rebuild preserves the modelled dose fields", () => {
    const first = parseHL7(buildVxu(VXU_INIT).toString());
    const dose = first.immunizations()[0];
    const rebuilt = parseHL7(
      buildVxu({
        ...ENVELOPE,
        patient: PATIENT,
        immunizations: [
          {
            vaccineCode: dose?.vaccineCode ?? {},
            doseAmount: first.get("RXA.6") ?? "",
            doseUnits: dose?.doseUnits ?? {},
            administeredDateTime: dose?.administeredDateTime?.raw ?? "",
            lotNumber: dose?.lotNumber ?? "",
            completionStatus: dose?.completionStatus ?? "",
            actionCode: dose?.actionCode ?? "",
          },
        ],
      }).toString(),
    );
    const second = rebuilt.immunizations()[0];
    expect(second?.vaccineCode?.identifier).toBe(dose?.vaccineCode?.identifier);
    expect(second?.vaccineCode?.text).toBe(dose?.vaccineCode?.text);
    expect(second?.doseAmount).toBe(dose?.doseAmount);
    expect(second?.doseUnits?.identifier).toBe(dose?.doseUnits?.identifier);
    expect(second?.administeredDateTime?.raw).toBe(dose?.administeredDateTime?.raw);
    expect(second?.lotNumber).toBe(dose?.lotNumber);
    expect(rebuilt.warnings).toEqual([]);
  });
});
