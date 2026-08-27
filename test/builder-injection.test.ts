/**
 * Delimiter-injection and null-versus-empty suites for the typed builders.
 *
 * Acceptance exercised here:
 *   - **a hostile value cannot re-frame a message**: a supplied value carrying
 *     a field, component, subcomponent, repetition or escape character is
 *     emitted escaped, re-parses to the original string, and leaves the
 *     builder's own field and component boundaries exactly where they were.
 *   - **empty string and explicit null stay distinct**, the same way the
 *     pre-existing typed builders distinguish them: an empty string emits as an
 *     absent field, and an HL7 explicit null is set after construction and
 *     survives the round trip as `isNull`.
 *
 * All values are synthetic.
 */

import { describe, expect, it } from "vitest";

import {
  buildAdt,
  buildDft,
  buildMdm,
  buildOrm,
  buildOru,
  buildSiu,
  buildVxu,
  parseHL7,
  type Hl7Message,
} from "../src/index.js";

import { ENVELOPE, PATIENT } from "./_helpers/supported-pairs.js";

/** Every structural delimiter plus the escape character, in one value. */
const HOSTILE = "a|b^c~d\\e&f";

/** A value that looks like an HL7 escape sequence and an explicit null. */
const LOOKS_LIKE_ESCAPE = '\\F\\ and "" and \\.br\\';

describe("a hostile typed value cannot break framing", () => {
  interface Case {
    readonly name: string;
    readonly build: (value: string) => Hl7Message;
    /** Where the hostile value lands, and what must still be at a neighbour. */
    readonly path: string;
    readonly neighbourPath: string;
    readonly neighbour: string;
  }

  const CASES: readonly Case[] = [
    {
      name: "buildVxu: a vaccine code text",
      build: (value) =>
        buildVxu({
          ...ENVELOPE,
          patient: PATIENT,
          immunizations: [
            { vaccineCode: { identifier: "115", text: value, nameOfCodingSystem: "CVX" } },
          ],
        }),
      path: "RXA.5.2",
      neighbourPath: "RXA.5.3",
      neighbour: "CVX",
    },
    {
      name: "buildDft: a transaction code text",
      build: (value) =>
        buildDft("P03", {
          ...ENVELOPE,
          patient: PATIENT,
          charges: [
            { transactionCode: { identifier: "80053", text: value }, transactionType: "CG" },
          ],
        }),
      path: "FT1.7.2",
      neighbourPath: "FT1.6",
      neighbour: "CG",
    },
    {
      name: "buildDft: a price",
      build: (value) =>
        buildDft("P03", {
          ...ENVELOPE,
          patient: PATIENT,
          charges: [{ amountExtended: { price: value, denomination: "USD" } }],
        }),
      path: "FT1.11.1.1",
      neighbourPath: "FT1.11.1.2",
      neighbour: "USD",
    },
    {
      name: "buildMdm: a narrative line",
      build: (value) =>
        buildMdm("T02", {
          ...ENVELOPE,
          patient: PATIENT,
          document: {
            documentType: "DS",
            completionStatus: "AU",
            body: [{ setId: "1", valueType: "TX", value }],
          },
        }),
      path: "OBX.5",
      neighbourPath: "TXA.17",
      neighbour: "AU",
    },
    {
      name: "buildMdm: a unique document number",
      build: (value) =>
        buildMdm("T01", {
          ...ENVELOPE,
          patient: PATIENT,
          document: { uniqueDocumentNumber: value, availabilityStatus: "AV" },
        }),
      path: "TXA.12",
      neighbourPath: "TXA.19",
      neighbour: "AV",
    },
    {
      name: "buildSiu: an appointment identifier",
      build: (value) =>
        buildSiu("S12", {
          ...ENVELOPE,
          appointment: { placerAppointmentId: value, fillerAppointmentId: "FL-1" },
          resourceGroups: [{ setId: "1" }],
        }),
      path: "SCH.1",
      neighbourPath: "SCH.2",
      neighbour: "FL-1",
    },
    {
      name: "buildSiu: a resource code",
      build: (value) =>
        buildSiu("S12", {
          ...ENVELOPE,
          appointment: { fillerAppointmentId: "FL-1" },
          resourceGroups: [
            {
              setId: "1",
              resources: [{ kind: "service", setId: "9", code: { identifier: value } }],
            },
          ],
        }),
      path: "AIS.3.1",
      neighbourPath: "AIS.1",
      neighbour: "9",
    },
    {
      name: "buildOrm: a universal service text",
      build: (value) =>
        buildOrm({
          ...ENVELOPE,
          patient: PATIENT,
          orders: [
            {
              orderControl: "NW",
              universalServiceId: { identifier: "CBC", text: value },
              resultStatus: "O",
            },
          ],
        }),
      path: "OBR.4.2",
      neighbourPath: "OBR.25",
      neighbour: "O",
    },
    {
      name: "buildAdt: a prior identifier",
      build: (value) =>
        buildAdt("A40", {
          ...ENVELOPE,
          patient: PATIENT,
          priorIdentity: {
            identifiers: { idNumber: value, identifierTypeCode: "MR" },
          },
        }),
      path: "MRG.1.1",
      neighbourPath: "MRG.1.5",
      neighbour: "MR",
    },
  ];

  it.each(CASES.map((c) => [c.name, c] as const))(
    "%s: every delimiter survives, and no boundary moves",
    (_name, testCase) => {
      for (const value of [HOSTILE, LOOKS_LIKE_ESCAPE]) {
        const round = parseHL7(testCase.build(value).toString());
        expect(round.get(testCase.path), `${testCase.path} for ${JSON.stringify(value)}`).toBe(
          value,
        );
        expect(round.get(testCase.neighbourPath)).toBe(testCase.neighbour);
        expect(round.warnings).toEqual([]);
      }
    },
  );

  it("a hostile value never adds a repetition, component or segment", () => {
    const clean = parseHL7(
      buildOrm({
        ...ENVELOPE,
        patient: PATIENT,
        orders: [{ orderControl: "NW", universalServiceId: { identifier: "CBC", text: "plain" } }],
      }).toString(),
    );
    const hostile = parseHL7(
      buildOrm({
        ...ENVELOPE,
        patient: PATIENT,
        orders: [{ orderControl: "NW", universalServiceId: { identifier: "CBC", text: HOSTILE } }],
      }).toString(),
    );
    expect(hostile.allSegments().length).toBe(clean.allSegments().length);
    const obrClean = clean.segments("OBR")[0]?.field(4);
    const obrHostile = hostile.segments("OBR")[0]?.field(4);
    expect(obrHostile?.repetitions.length).toBe(obrClean?.repetitions.length);
    expect(obrHostile?.repetitions[0]?.components.length).toBe(
      obrClean?.repetitions[0]?.components.length,
    );
    expect(hostile.orders()[0]?.universalServiceId?.text).toBe(HOSTILE);
    expect(hostile.orders()[0]?.universalServiceId?.identifier).toBe("CBC");
  });

  it("a segment name in a value is still just a value", () => {
    const round = parseHL7(
      buildMdm("T02", {
        ...ENVELOPE,
        patient: PATIENT,
        document: {
          documentType: "DS",
          body: [{ setId: "1", valueType: "TX", value: "OBX|1|TX|forged" }],
        },
      }).toString(),
    );
    expect(round.segments("OBX").length).toBe(1);
    expect(round.get("OBX.5")).toBe("OBX|1|TX|forged");
  });
});

describe("an empty string and an explicit null stay distinct", () => {
  it("an empty string emits as an absent field, exactly as the pre-existing builders do", () => {
    // The reference behaviour, from a builder that shipped before this change:
    const oru = parseHL7(
      buildOru({
        ...ENVELOPE,
        patient: { ...PATIENT, administrativeSex: "" },
        observations: [{ setId: "1", valueType: "ST", value: "x" }],
      }).toString(),
    );
    expect(oru.get("PID.8")).toBeUndefined();
    expect(oru.segments("PID")[0]?.field(8).isNull).toBe(false);

    // Every new builder behaves identically.
    const vxu = parseHL7(
      buildVxu({
        ...ENVELOPE,
        patient: { ...PATIENT, administrativeSex: "" },
        immunizations: [{ vaccineCode: { identifier: "115" }, lotNumber: "" }],
      }).toString(),
    );
    expect(vxu.get("PID.8")).toBeUndefined();
    expect(vxu.get("RXA.15")).toBeUndefined();
    expect(vxu.segments("RXA")[0]?.field(15).isNull).toBe(false);
    expect(vxu.immunizations()[0]?.lotNumber).toBeUndefined();

    const mdm = parseHL7(
      buildMdm("T01", {
        ...ENVELOPE,
        patient: PATIENT,
        document: { documentType: "DS", completionStatus: "" },
      }).toString(),
    );
    expect(mdm.get("TXA.17")).toBeUndefined();
    expect(mdm.documents()[0]?.completionStatus).toBeUndefined();
  });

  it("an explicit null is set after construction and survives the round trip", () => {
    // The documented route, unchanged: `setField(path, '""')` marks the field
    // HL7-null, which the emitter preserves as the two-character literal.
    const msg = buildVxu({
      ...ENVELOPE,
      patient: PATIENT,
      immunizations: [{ vaccineCode: { identifier: "115" }, lotNumber: "LOT-1" }],
    }).setField("RXA.15", '""');
    const wire = msg.toString();
    expect(wire).toContain('""');

    const round = parseHL7(wire);
    expect(round.segments("RXA")[0]?.field(15).isNull).toBe(true);
    expect(round.get("RXA.15")).toBeUndefined();
    expect(round.warnings).toEqual([]);
  });

  it("the two are distinguishable on the wire for the same position", () => {
    const base = {
      ...ENVELOPE,
      patient: PATIENT,
      document: { documentType: "DS", completionStatus: "" },
    };
    const empty = buildMdm("T01", base).toString();
    const explicitNull = buildMdm("T01", base).setField("TXA.17", '""').toString();
    expect(empty).not.toBe(explicitNull);
    expect(parseHL7(empty).segments("TXA")[0]?.field(17).isNull).toBe(false);
    expect(parseHL7(explicitNull).segments("TXA")[0]?.field(17).isNull).toBe(true);
  });
});
