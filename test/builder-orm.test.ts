/**
 * Round-trip tests for the typed `ORM^O01` builder.
 *
 * The registry entry behind `ORM^O01` is a RETAINED TRANSCRIPTION: the vendored
 * publication names no structure for this message type and its only expectation
 * is `ORC`, so a zero-warning ORM proves very little on its own. The load
 * bearing check here is therefore the read-side round trip through
 * `msg.orders()`, which walks `ORC` then `OBR`, not the warning count.
 *
 * All values are synthetic.
 */

import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

import { buildOrm, findMessageStructureDefinition, parseHL7 } from "../src/index.js";

import { ENVELOPE, ORM_INIT, PATIENT } from "./_helpers/supported-pairs.js";

function golden(name: string): string {
  return readFileSync(fileURLToPath(new URL(`./fixtures/build/${name}`, import.meta.url)), "utf8");
}

function toGoldenForm(hl7: string): string {
  return hl7.replaceAll("\r", "\n") + "\n";
}

describe("buildOrm", () => {
  it("emits the recorded spec-clean golden for fixed inputs", () => {
    expect(toGoldenForm(buildOrm(ORM_INIT).toString())).toBe(golden("orm-o01.golden.hl7"));
  });

  it("re-parses with zero warnings and is structurally complete", () => {
    const round = parseHL7(buildOrm(ORM_INIT).toString());
    expect(round.warnings).toEqual([]);
    expect(round.structure.recognized).toBe(true);
    expect(round.structure.missingGroups).toEqual([]);
    expect(round.meta.type).toBe("ORM^O01");
  });

  it("the registry expectation is ORC alone, which is why the read side is the check", () => {
    const def = findMessageStructureDefinition("ORM", "O01");
    expect(def?.derivation).toBe("retained-transcription");
    expect([...(def?.requiredSegments ?? [])]).toEqual(["ORC"]);
    // An ORM carrying only its ORC would satisfy the structure net and still be
    // useless: the read side returns no order at all without an OBR.
    const orcOnly = parseHL7("MSH|^~\\&|A|B|C|D|20260801||ORM^O01|CTRL1|P|2.5\rORC|NW\r");
    expect(orcOnly.warnings).toEqual([]);
    expect(orcOnly.orders()).toEqual([]);
  });

  it("reads back every supplied order, in the order supplied", () => {
    const round = parseHL7(buildOrm(ORM_INIT).toString());
    const orders = round.orders();
    expect(orders.length).toBe(2);

    const [first, second] = orders;
    expect(first?.orderControl).toBe("NW");
    expect(first?.placerOrderNumber).toBe("PL-1001");
    expect(first?.fillerOrderNumber).toBe("FL-2002");
    expect(first?.universalServiceId?.identifier).toBe("CBC");
    expect(first?.universalServiceId?.text).toBe("Complete Blood Count");
    expect(first?.orderStatus).toBe("O");
    expect(first?.orderedBy?.idNumber).toBe("9990");
    expect(first?.orderedBy?.familyName).toBe("Welby");
    expect(first?.observations.map((o) => o.value)).toEqual(["Fasting"]);

    expect(second?.placerOrderNumber).toBe("PL-1002");
    expect(second?.universalServiceId?.identifier).toBe("BMP");
    expect(second?.observations).toEqual([]);
  });

  it("emits no order value the caller did not supply", () => {
    const msg = buildOrm({
      ...ENVELOPE,
      patient: PATIENT,
      orders: [{ orderControl: "NW", placerOrderNumber: "PL-1" }],
    });
    const order = parseHL7(msg.toString()).orders()[0];
    expect(order?.orderControl).toBe("NW");
    expect(order?.placerOrderNumber).toBe("PL-1");
    expect(order?.fillerOrderNumber).toBeUndefined();
    expect(order?.universalServiceId).toBeUndefined();
    expect(order?.orderStatus).toBeUndefined();
    expect(order?.orderedBy).toBeUndefined();
    expect(order?.observations).toEqual([]);
    expect(order?.timings).toEqual([]);
    expect(order?.notes).toBeUndefined();
  });

  it("never copies a placer or filler number between ORC and OBR", () => {
    const round = parseHL7(
      buildOrm({
        ...ENVELOPE,
        patient: PATIENT,
        orders: [{ orderControl: "NW", placerOrderNumber: "OBR-ONLY" }],
      }).toString(),
    );
    expect(round.get("OBR.2")).toBe("OBR-ONLY");
    expect(round.get("ORC.2")).toBeUndefined();
    expect(round.get("ORC.1")).toBe("NW");
  });

  it("carries the ORC placer and filler numbers when they are supplied there", () => {
    const round = parseHL7(
      buildOrm({
        ...ENVELOPE,
        patient: PATIENT,
        orders: [
          {
            orderControl: "NW",
            orcPlacerOrderNumber: "ORC-PL",
            orcFillerOrderNumber: "ORC-FL",
            placerOrderNumber: "OBR-PL",
            observationDateTime: "20260801080000",
          },
        ],
      }).toString(),
    );
    expect(round.get("ORC.2")).toBe("ORC-PL");
    expect(round.get("ORC.3")).toBe("ORC-FL");
    expect(round.get("OBR.2")).toBe("OBR-PL");
    expect(round.get("OBR.7")).toBe("20260801080000");
    expect(round.orders()[0]?.placerOrderNumber).toBe("OBR-PL");
  });

  it("emit then parse then rebuild preserves the modelled order fields", () => {
    const first = parseHL7(buildOrm(ORM_INIT).toString());
    const order = first.orders()[0];
    const rebuilt = parseHL7(
      buildOrm({
        ...ENVELOPE,
        patient: PATIENT,
        orders: [
          {
            orderControl: order?.orderControl ?? "",
            placerOrderNumber: order?.placerOrderNumber ?? "",
            fillerOrderNumber: order?.fillerOrderNumber ?? "",
            universalServiceId: order?.universalServiceId ?? {},
            orderingProvider: order?.orderedBy ?? {},
            resultStatus: order?.orderStatus ?? "",
          },
        ],
      }).toString(),
    );
    const second = rebuilt.orders()[0];
    expect(second?.orderControl).toBe(order?.orderControl);
    expect(second?.placerOrderNumber).toBe(order?.placerOrderNumber);
    expect(second?.fillerOrderNumber).toBe(order?.fillerOrderNumber);
    expect(second?.universalServiceId?.identifier).toBe(order?.universalServiceId?.identifier);
    expect(second?.orderedBy?.idNumber).toBe(order?.orderedBy?.idNumber);
    expect(second?.orderStatus).toBe(order?.orderStatus);
    expect(rebuilt.warnings).toEqual([]);
  });
});
