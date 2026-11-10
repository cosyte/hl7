/**
 * Edge cases of the typed builders that the round-trip suites do not reach:
 * an omitted optional member, an all-empty composite, a value a JavaScript
 * caller passes past the types, and a message built by hand with no MSH.
 *
 * Each case asserts what a consumer reads back, never only that a line ran.
 * All values are synthetic.
 */

import { describe, expect, it } from "vitest";

import {
  DEFAULT_ENCODING_CHARACTERS,
  Hl7Message,
  buildAck,
  buildDft,
  buildMessage,
  buildMdm,
  buildOrm,
  buildOru,
  buildSiu,
  buildVxu,
  encodeComposite,
  parseHL7,
} from "../src/index.js";

import {
  DFT_INIT,
  ENVELOPE,
  MDM_INIT,
  PATIENT,
  SIU_INIT,
  VXU_INIT,
} from "./_helpers/supported-pairs.js";

describe("buildMessage", () => {
  it("names a null init in its TypeError", () => {
    expect(() => buildMessage(null as never)).toThrow(/Received: null\./);
  });
});

describe("encodeComposite", () => {
  it("throws a TypeError naming a kind outside CompositeKind", () => {
    expect(() => encodeComposite("ZZZ" as never, undefined as never)).toThrow(
      new TypeError('encodeComposite: unknown composite kind "ZZZ".'),
    );
  });
});

describe("buildAck", () => {
  it("leaves the addressing and MSA-2 empty for a hand-built message with no MSH", () => {
    const inbound = new Hl7Message({
      segments: [],
      encodingCharacters: DEFAULT_ENCODING_CHARACTERS,
      version: "2.5",
      warnings: [],
    });
    const ack = buildAck(inbound, { code: "AA" });
    // No MSH-10 to correlate with: the positive accept is downgraded.
    expect(ack.get("MSA.1")).toBe("AE");
    expect(ack.get("MSA.2")).toBeUndefined();
    for (const n of [3, 4, 5, 6]) expect(ack.get(`MSH.${String(n)}`)).toBeUndefined();
    expect(ack.warnings.map((w) => w.code)).toEqual(["ACK_NO_CORRELATION_ID"]);
  });

  it("emits ERR-4 absent when a JavaScript caller passes an empty severity", () => {
    const inbound = parseHL7("MSH|^~\\&|A|B|C|D|20260801||ADT^A01|CTRL1|P|2.5\rPID|1\r");
    const ack = buildAck(inbound, { code: "AE", error: { severity: "" as never } });
    const round = parseHL7(ack.toString());
    expect(round.get("ERR.3.1")).toBe("207");
    expect(round.get("ERR.4")).toBeUndefined();
  });
});

describe("OBX bodies with sparse optional members", () => {
  it("buildOru emits OBX-1, OBX-2 and OBX-5 empty when they are omitted", () => {
    const msg = buildOru({
      ...ENVELOPE,
      patient: { identifiers: { idNumber: "MRN001" } },
      order: { universalServiceId: { identifier: "CBC" } },
      observations: [{ identifier: { identifier: "WBC" }, units: { identifier: "10*3/uL" } }],
    });
    const round = parseHL7(msg.toString());
    expect(round.get("OBX.1")).toBeUndefined();
    expect(round.get("OBX.2")).toBeUndefined();
    expect(round.get("OBX.3.1")).toBe("WBC");
    expect(round.get("OBX.5")).toBeUndefined();
    expect(round.get("OBX.6.1")).toBe("10*3/uL");
  });

  it("the shared OBX body carries units, range, flags, status and time when supplied", () => {
    const msg = buildMdm("T02", {
      ...MDM_INIT,
      document: {
        ...MDM_INIT.document,
        body: [
          {
            setId: "1",
            valueType: "NM",
            identifier: { identifier: "WBC" },
            units: { identifier: "10*3/uL" },
            referenceRange: "4.0-11.0",
            abnormalFlags: "N",
            observationResultStatus: "F",
            observationDateTime: "20260801093000",
          },
        ],
      },
    });
    const round = parseHL7(msg.toString());
    // No value was supplied, so OBX-5 stays empty rather than defaulted.
    expect(round.get("OBX.5")).toBeUndefined();
    expect(round.get("OBX.6.1")).toBe("10*3/uL");
    expect(round.get("OBX.7")).toBe("4.0-11.0");
    expect(round.get("OBX.8")).toBe("N");
    expect(round.get("OBX.11")).toBe("F");
    expect(round.get("OBX.14")).toBe("20260801093000");
  });
});

describe("omitted optional members are never defaulted", () => {
  it("buildOrm leaves ORC-1 empty with no order control", () => {
    const msg = buildOrm({
      ...ENVELOPE,
      patient: PATIENT,
      orders: [{ placerOrderNumber: "PL-1" }],
    });
    const round = parseHL7(msg.toString());
    expect(round.segments("ORC")).toHaveLength(1);
    expect(round.get("ORC.1")).toBeUndefined();
    expect(round.orders()[0]?.orderControl).toBeUndefined();
  });

  it("buildSiu leaves RGS-1 empty with no set id", () => {
    const msg = buildSiu("S12", {
      ...SIU_INIT,
      resourceGroups: [{ actionCode: "A", resources: [] }],
    });
    const round = parseHL7(msg.toString());
    expect(round.get("RGS.1")).toBeUndefined();
    expect(round.get("RGS.2")).toBe("A");
  });

  it("buildSiu emits SCH-11 absent when both times are empty strings", () => {
    const msg = buildSiu("S12", {
      ...SIU_INIT,
      appointment: { placerAppointmentId: "PL-1", startDateTime: "", endDateTime: "" },
    });
    const round = parseHL7(msg.toString());
    expect(round.get("SCH.1")).toBe("PL-1");
    expect(round.segments("SCH")[0]?.field(11).raw.repetitions).toEqual([]);
  });

  it("buildVxu leaves RXA-5 empty with no vaccine code", () => {
    const first = VXU_INIT.immunizations[0];
    if (first === undefined) throw new Error("fixture has an immunization");
    const { vaccineCode: _omitted, ...rest } = first;
    const msg = buildVxu({ ...VXU_INIT, immunizations: [rest] });
    const round = parseHL7(msg.toString());
    expect(round.get("RXA.3")).toBe("20260801");
    expect(round.get("RXA.5")).toBeUndefined();
  });

  it("buildDft emits an all-empty amount as an absent field", () => {
    const first = DFT_INIT.charges[0];
    if (first === undefined) throw new Error("fixture has a charge");
    const msg = buildDft("P03", { ...DFT_INIT, charges: [{ ...first, amountExtended: {} }] });
    const round = parseHL7(msg.toString());
    expect(round.segments("FT1")[0]?.field(11).raw.repetitions).toEqual([]);
    expect(round.get("FT1.12.1")).toBe("150.00");
  });
});
