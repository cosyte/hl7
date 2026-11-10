/**
 * Edge cases of the read-side helpers the main suites do not reach: empty
 * repetitions and components on the wire, components a mutation left without
 * subcomponents, segments a group does not model, and a message built by hand.
 *
 * Every case asserts what a consumer reads back. All values are synthetic.
 */

import { describe, expect, it } from "vitest";

import {
  DEFAULT_ENCODING_CHARACTERS,
  Hl7Message,
  interpretAck,
  parseHL7,
  type RawField,
} from "../src/index.js";

const msh = (type: string, version = "2.5"): string =>
  `MSH|^~\\&|A|B|C|D|20260101||${type}|MSG1|P|${version}`;

const message = (type: string, ...segments: readonly string[]): Hl7Message =>
  parseHL7([msh(type), ...segments].join("\r"));

describe("interpretAck", () => {
  it("reports no code when MSA-1 is empty", () => {
    const ack = interpretAck(message("ACK", "MSA||MSG9"));
    expect(ack.code).toBeUndefined();
    expect(ack.controlId).toBe("MSG9");
    expect(ack.accepted).toBe(false);
  });

  it("reports no condition code when ERR-3 is empty", () => {
    const [entry] = interpretAck(message("ACK", "MSA|AE|MSG9", "ERR||PID^1^5||E")).errors;
    expect(entry?.conditionCode).toBeUndefined();
    expect(entry?.location).toBe("PID^1^5");
    expect(entry?.severity).toBe("E");
  });

  it("keeps the positions of ERR-2 components a mutation left empty", () => {
    const msg = message("ACK", "MSA|AE|MSG9", "ERR|||207^Application internal error^HL70357|E");
    msg.setField("ERR.2.3", "5");
    expect(interpretAck(msg).errors[0]?.location).toBe("^^5");
  });

  it("reports no location when the first ERR-2 repetition is empty", () => {
    const [entry] = interpretAck(
      message("ACK", "MSA|AE|MSG9", "ERR||~PID^1^5|207^Application internal error^HL70357|E"),
    ).errors;
    expect(entry?.location).toBeUndefined();
    expect(entry?.conditionCode).toBe("207");
  });
});

describe("allergies from IAM", () => {
  const iam = (actionCode: string, uniqueId: string): Hl7Message =>
    message(
      "ADT^A60",
      "PID|1||MRN1",
      `IAM|1|DA|PCN^Penicillin^L|SV|Hives|${actionCode}|${uniqueId}`,
    );

  it("reports no unique identifier when IAM-7 carries only separators", () => {
    const [allergy] = iam("A", "^").allergies();
    expect(allergy?.uniqueIdentifier).toBeUndefined();
    expect(allergy?.actionCode).toBe("A");
  });

  it("reads the namespace when a mutation left IAM-7.1 without subcomponents", () => {
    const msg = iam("A", "");
    msg.setField("IAM.7.2", "NS");
    expect(msg.allergies()[0]?.uniqueIdentifier).toEqual({ namespaceId: "NS" });
  });

  it("an empty repetition before a D never reads as a delete", () => {
    const msg = iam("", "UID1");
    msg.setField("IAM.6[1].1", "D");
    const [allergy] = msg.allergies();
    expect(allergy?.actionCode).toBe("~D");
    expect(allergy?.deleteRequested).toBeUndefined();
  });
});

describe("charges", () => {
  it("drops an empty FT1-19 repetition and keeps the diagnosis after it", () => {
    const [charge] = message(
      "DFT^P03",
      "PID|1||MRN1",
      "FT1|1|||20260101||CG|99213^Office visit||1||||||||||~I10^Hypertension^I10",
    ).charges();
    expect(charge?.diagnoses).toEqual([
      { identifier: "I10", text: "Hypertension", nameOfCodingSystem: "I10" },
    ]);
  });
});

describe("documents", () => {
  it("skips a segment after TXA that is not an OBX", () => {
    const [doc] = message(
      "MDM^T02",
      "PID|1||MRN1",
      "TXA|1|DS",
      "ZDX|1",
      "OBX|1|TX|NOTE||Line one",
    ).documents();
    expect(doc?.observations.map((o) => o.value)).toEqual(["Line one"]);
  });
});

describe("identity events", () => {
  it("treats a bare major version above 2 as v2.7 or later", () => {
    const [ev] = parseHL7(
      [msh("ADT^A40", "3"), "PID|1|LEG1^^^H^PE|MRN1^^^H^MR", "MRG|MRN2^^^H^MR|||LEG2^^^H^PE"].join(
        "\r",
      ),
    ).identityEvents();
    expect(ev?.surviving?.legacyPatientId).toBeUndefined();
    expect(ev?.prior?.legacyPatientId).toBeUndefined();
    expect(ev?.prior?.identifiers.map((cx) => cx.idNumber)).toEqual(["MRN2"]);
  });

  it("treats a bare major version of 2 as before v2.7", () => {
    const [ev] = parseHL7(
      [msh("ADT^A40", "2"), "PID|1|LEG1^^^H^PE|MRN1^^^H^MR", "MRG|MRN2^^^H^MR|||LEG2^^^H^PE"].join(
        "\r",
      ),
    ).identityEvents();
    expect(ev?.prior?.legacyPatientId?.idNumber).toBe("LEG2");
  });
});

describe("immunizations", () => {
  it("reports no order control for an empty ORC-1 and skips unmodelled segments", () => {
    const [imm] = message(
      "VXU^V04",
      "PID|1||MRN1",
      "ORC||PL1",
      "RXA|0|1|20260101|20260101|08^HepB^CVX|0.5",
      "ZIM|1",
      "OBX|1|CE|64994-7^Eligibility^LN||V02",
    ).immunizations();
    expect(imm?.orderControl).toBeUndefined();
    expect(imm?.routes).toEqual([]);
    expect(imm?.observations.map((o) => o.valueType)).toEqual(["CE"]);
  });
});

describe("medications and orders", () => {
  it("a TQ1 after the medication's own parent attaches to that medication", () => {
    const [med] = message(
      "RDE^O11",
      "PID|1||MRN1",
      "ORC|NW",
      "RXE|^^^^^R|RX1^Drug^L|5||mg",
      "TQ1|1||BID",
    ).medications();
    expect(med?.timings.map((t) => t.repeatPattern?.code)).toEqual(["BID"]);
  });

  it("a TQ1 after the order's OBR attaches to that order", () => {
    const orders = message(
      "ORM^O01",
      "PID|1||MRN1",
      "ORC||PL1",
      "OBR|1|PL1||CBC^Blood count^L",
      "TQ1|1||Q6H",
    ).orders();
    expect(orders).toHaveLength(1);
    expect(orders[0]?.orderControl).toBeUndefined();
    expect(orders[0]?.timings.map((t) => t.repeatPattern?.code)).toEqual(["Q6H"]);
  });

  it("a TQ1 quantity whose units carry no content has no units", () => {
    const [order] = message(
      "ORM^O01",
      "PID|1||MRN1",
      "ORC|NW",
      "OBR|1|PL1||CBC^Blood count^L",
      "TQ1|1|5^&",
    ).orders();
    expect(order?.timings[0]?.quantity).toEqual({ value: 5 });
  });
});

describe("meta", () => {
  it("keeps an empty middle component of MSH-9 a mutation created", () => {
    const msg = message("ADT");
    msg.setField("MSH.9.3", "ADT_A01");
    expect(msg.meta.type).toBe("ADT^^ADT_A01");
  });

  it("drops trailing empty components of MSH-9", () => {
    const msg = message("ADT^A01");
    msg.setField("MSH.9.3", "");
    expect(msg.meta.type).toBe("ADT^A01");
  });

  it("reports no type when MSH-9 carries no content", () => {
    const msg = message("ADT");
    msg.setField("MSH.9.1", "");
    expect(msg.meta.type).toBeUndefined();
    expect(msg.meta.messageCode).toBeUndefined();
  });

  it("reads nothing from a message built by hand with no MSH", () => {
    const msg = new Hl7Message({
      segments: [],
      encodingCharacters: DEFAULT_ENCODING_CHARACTERS,
      version: "2.5",
      warnings: [],
    });
    expect(msg.meta.type).toBeUndefined();
    expect(msg.meta.timestamp).toBeUndefined();
    expect(msg.meta.controlId).toBeUndefined();
  });
});

describe("notes", () => {
  it("drops an empty NTE-3 repetition", () => {
    expect(message("ORU^R01", "NTE|1||~line two").notes()).toEqual(["line two"]);
  });
});

describe("observations", () => {
  it("a CWE or CE observation with an empty value has no value", () => {
    const [cwe, ce] = message(
      "ORU^R01",
      "PID|1||MRN1",
      "OBR|1",
      "OBX|1|CWE|X^Coded^LN||",
      "OBX|2|CE|Y^Coded^LN||",
    ).observations();
    expect(cwe?.valueType).toBe("CWE");
    expect(cwe?.value).toBeUndefined();
    expect(ce?.valueType).toBe("CE");
    expect(ce?.value).toBeUndefined();
  });

  it("an OBX-11 holding one hole classifies as undetermined", () => {
    const parsed = message("ORU^R01", "OBX|1|ST|X^Text^LN||value||||||F");
    const obx = parsed.rawSegments[1];
    if (obx === undefined) throw new Error("fixture has an OBX");
    const status: RawField = { repetitions: [], isNull: false };
    (status.repetitions as unknown[]).length = 1;
    const fields = obx.fields.slice();
    fields[11] = status;
    const msg = new Hl7Message({
      segments: [parsed.rawSegments[0] as never, { name: "OBX", fields }],
      encodingCharacters: DEFAULT_ENCODING_CHARACTERS,
      version: "2.5",
      warnings: [],
    });
    expect(msg.observations()[0]?.resultStatus.classification).toBe("undetermined");
  });
});

describe("patient", () => {
  it("reads PID-14 phones after PID-13 and skips empty repetitions in both", () => {
    const patient = message(
      "ADT^A01",
      "PID|1||~MRN1^^^H^MR||Doe^Jane||19800101|F|||||~5551234|~5559876",
    ).patient;
    expect(patient?.identifiers.map((cx) => cx.idNumber)).toEqual(["MRN1"]);
    expect(patient?.phoneNumbers).toHaveLength(2);
  });

  it("reads race, ethnicity and primary language when sent", () => {
    const patient = message(
      "ADT^A01",
      "PID|1||MRN1||Doe^Jane||19800101|F||2106-3^White^CDCREC|||||en^English^ISO639|||||||2186-5^Not Hispanic^CDCREC",
    ).patient;
    expect(patient?.race?.identifier).toBe("2106-3");
    expect(patient?.language?.identifier).toBe("en");
    expect(patient?.ethnicity?.identifier).toBe("2186-5");
  });
});
