/**
 * The common data types read by name: EI, EIP, CNE, DR, MO, CP, CQ, VID, MSG,
 * PT and FC, each with its parser, its `Field` accessor and its encoder, plus
 * the CWE components 10 to 22 that v2.7 added.
 *
 * What is pinned here, per type:
 *   - every component lands on its HL7 name, in HL7 order;
 *   - an absent or empty component is omitted, never `undefined`;
 *   - a nested composite (EI in EIP, MO in CP, a coded element in CQ, VID, CP
 *     and FC) is read from the subcomponents of its component, and an empty one
 *     is omitted rather than left as `{}`;
 *   - components past the named ones are kept on `extraComponents`, never
 *     dropped, as CWE and CE already keep theirs;
 *   - a repetition built by hand with `null` holes reads as absent.
 *
 * All values are synthetic.
 */

import { describe, expect, it } from "vitest";

import {
  buildMessage,
  encodeCne,
  encodeComposite,
  encodeCp,
  encodeCq,
  encodeCwe,
  encodeDr,
  encodeEi,
  encodeEip,
  encodeFc,
  encodeMo,
  encodeMsg,
  encodePt,
  encodeVid,
  parseCne,
  parseCp,
  parseCq,
  parseCwe,
  parseDr,
  parseEi,
  parseEip,
  parseFc,
  parseHL7,
  parseMo,
  parseMsg,
  parsePt,
  parseVid,
  type CNE,
  type CWE,
  type HL7,
  type RawField,
  type RawRepetition,
} from "../src/index.js";
import { DEFAULT_ENCODING_CHARACTERS as ENC } from "../src/parser/delimiters.js";

/** A repetition from a list of components, each a list of subcomponents. */
function rep(components: string[][]): RawRepetition {
  return { components: components.map((subcomponents) => ({ subcomponents })) };
}

/** Encode, serialize inside a real message, re-parse: the field's first repetition. */
function roundTrip(field: RawField): RawRepetition {
  const msg = buildMessage({ type: "ADT^A01" }).addSegment("NTE", [field]);
  const parsed = parseHL7(msg.toString());
  const nte = parsed.rawSegments.find((s) => s.name === "NTE");
  const out = nte?.fields[1]?.repetitions[0];
  if (out === undefined) throw new Error("roundTrip: expected one parsed repetition");
  return out;
}

/** The 22 coded-element component values, numbered so a misplacement shows. */
const CODED_22: string[][] = Array.from({ length: 22 }, (_v, i) => [`c${String(i + 1)}`]);

/** The 22 coded-element names, in HL7 order, with the value `CODED_22` puts there. */
const CODED_22_NAMED = {
  identifier: "c1",
  text: "c2",
  nameOfCodingSystem: "c3",
  alternateIdentifier: "c4",
  alternateText: "c5",
  nameOfAlternateCodingSystem: "c6",
  codingSystemVersionId: "c7",
  alternateCodingSystemVersionId: "c8",
  originalText: "c9",
  secondAlternateIdentifier: "c10",
  secondAlternateText: "c11",
  nameOfSecondAlternateCodingSystem: "c12",
  secondAlternateCodingSystemVersionId: "c13",
  codingSystemOid: "c14",
  valueSetOid: "c15",
  valueSetVersionId: "c16",
  alternateCodingSystemOid: "c17",
  alternateValueSetOid: "c18",
  alternateValueSetVersionId: "c19",
  secondAlternateCodingSystemOid: "c20",
  secondAlternateValueSetOid: "c21",
  secondAlternateValueSetVersionId: "c22",
} as const;

describe("CWE: components 10 to 22 by name", () => {
  it("reads all 22 components onto their v2.7 names", () => {
    const out = parseCwe(rep(CODED_22), ENC);
    const { extraComponents, ...named } = out;
    expect(named).toStrictEqual(CODED_22_NAMED);
    // Kept as before: component 10 onward, verbatim.
    expect(extraComponents).toStrictEqual(CODED_22.slice(9).map((c) => c[0]));
  });

  it("names a second-alternate code from a v2.7 sender", () => {
    const out = parseCwe(
      rep([
        ["12345-6"],
        ["Synthetic panel"],
        ["LN"],
        ["LOC1"],
        ["Local panel"],
        ["99LOC"],
        [""],
        [""],
        [""],
        ["ALT2"],
        ["Second local"],
        ["99ALT"],
        [""],
        ["2.16.840.1.113883.6.1"],
      ]),
      ENC,
    );
    expect(out.secondAlternateIdentifier).toBe("ALT2");
    expect(out.secondAlternateText).toBe("Second local");
    expect(out.nameOfSecondAlternateCodingSystem).toBe("99ALT");
    expect("secondAlternateCodingSystemVersionId" in out).toBe(false);
    expect(out.codingSystemOid).toBe("2.16.840.1.113883.6.1");
    expect(out.extraComponents).toStrictEqual([
      "ALT2",
      "Second local",
      "99ALT",
      "",
      "2.16.840.1.113883.6.1",
    ]);
  });

  it("adds no new key to a v2.5-shaped value", () => {
    const out = parseCwe(rep([["GLU"], ["Glucose"], ["LN"]]), ENC);
    expect(out).toStrictEqual({ identifier: "GLU", text: "Glucose", nameOfCodingSystem: "LN" });
  });

  it("keeps a component past the 22nd on extraComponents only", () => {
    const out = parseCwe(rep([...CODED_22, ["c23"]]), ENC);
    expect(out.secondAlternateValueSetVersionId).toBe("c22");
    expect(out.extraComponents?.at(-1)).toBe("c23");
    expect(out.extraComponents).toHaveLength(14);
  });

  it("encodes the named components 10 to 22 and reads them back", () => {
    const value: CWE = CODED_22_NAMED;
    const back = parseCwe(roundTrip(encodeCwe(value)), ENC);
    const { extraComponents: _extras, ...named } = back;
    expect(named).toStrictEqual(CODED_22_NAMED);
  });

  it("lets a named field win over extraComponents at the same position", () => {
    const value: CWE = {
      identifier: "A",
      secondAlternateIdentifier: "EDITED",
      extraComponents: ["OLD", "kept"],
    };
    const back = parseCwe(roundTrip(encodeCwe(value)), ENC);
    expect(back.secondAlternateIdentifier).toBe("EDITED");
    expect(back.secondAlternateText).toBe("kept");
  });

  it("still encodes a value that carries only extraComponents (code written before names)", () => {
    const value: CWE = { identifier: "A", extraComponents: ["X10", "", "X12"] };
    const back = parseCwe(roundTrip(encodeCwe(value)), ENC);
    expect(back.secondAlternateIdentifier).toBe("X10");
    expect(back.nameOfSecondAlternateCodingSystem).toBe("X12");
    expect(back.extraComponents).toStrictEqual(["X10", "", "X12"]);
  });

  it("emits extraComponents past the 22nd after the named ones", () => {
    const parsed = parseCwe(rep([...CODED_22, ["c23"], [""], ["c25"]]), ENC);
    const back = parseCwe(roundTrip(encodeCwe(parsed)), ENC);
    expect(back).toStrictEqual(parsed);
  });
});

describe("CNE", () => {
  it("reads all 22 components onto the coded-element names", () => {
    expect(parseCne(rep(CODED_22), ENC)).toStrictEqual(CODED_22_NAMED);
  });

  it("keeps components past the 22nd on extraComponents", () => {
    const out = parseCne(rep([...CODED_22, [""], ["c24"]]), ENC);
    expect(out.extraComponents).toStrictEqual(["", "c24"]);
  });

  it("omits empty components and reads a hand-built null hole as absent", () => {
    const holed = {
      components: [{ subcomponents: ["Y"] }, null, { subcomponents: ["HL70136"] }],
    } as unknown as RawRepetition;
    expect(parseCne(holed, ENC)).toStrictEqual({ identifier: "Y", nameOfCodingSystem: "HL70136" });
    expect(parseCne({ components: [] }, ENC)).toStrictEqual({});
  });

  it("round-trips through the serializer, extras included", () => {
    const value: CNE = { ...CODED_22_NAMED, extraComponents: ["c23"] };
    expect(parseCne(roundTrip(encodeCne(value)), ENC)).toStrictEqual(value);
  });
});

describe("EI", () => {
  it("reads the identifier and its assigning authority", () => {
    const out = parseEi(rep([["PL-1001"], ["CLINIC"], ["2.16.840.1.113883.19.5"], ["ISO"]]), ENC);
    expect(out).toStrictEqual({
      entityIdentifier: "PL-1001",
      namespaceId: "CLINIC",
      universalId: "2.16.840.1.113883.19.5",
      universalIdType: "ISO",
    });
  });

  it("omits empty components and keeps extras past the 4th", () => {
    expect(parseEi(rep([["PL-1001"], [""], [""], [""], ["x5"]]), ENC)).toStrictEqual({
      entityIdentifier: "PL-1001",
      extraComponents: ["x5"],
    });
    expect(parseEi({ components: [] }, ENC)).toStrictEqual({});
  });
});

describe("EIP", () => {
  it("reads each component as a nested EI from its subcomponents", () => {
    const out = parseEip(
      rep([
        ["PL-1001", "CLINIC"],
        ["FL-2002", "LAB", "2.16.840.1.113883.19.6", "ISO"],
      ]),
      ENC,
    );
    expect(out).toStrictEqual({
      placerAssignedIdentifier: { entityIdentifier: "PL-1001", namespaceId: "CLINIC" },
      fillerAssignedIdentifier: {
        entityIdentifier: "FL-2002",
        namespaceId: "LAB",
        universalId: "2.16.840.1.113883.19.6",
        universalIdType: "ISO",
      },
    });
  });

  it("omits an empty side rather than leaving {}", () => {
    const out = parseEip(rep([["", ""], ["FL-2002"]]), ENC);
    expect(out).toStrictEqual({ fillerAssignedIdentifier: { entityIdentifier: "FL-2002" } });
  });

  it("keeps extras past the 2nd and reads a null hole as absent", () => {
    const holed = {
      components: [null, { subcomponents: ["FL-2002"] }, { subcomponents: ["x3"] }],
    } as unknown as RawRepetition;
    expect(parseEip(holed, ENC)).toStrictEqual({
      fillerAssignedIdentifier: { entityIdentifier: "FL-2002" },
      extraComponents: ["x3"],
    });
  });
});

describe("DR", () => {
  it("reads the start and end as raw datetime text", () => {
    expect(parseDr(rep([["202601010800-0500"], ["20261231"]]), ENC)).toStrictEqual({
      rangeStartDateTime: "202601010800-0500",
      rangeEndDateTime: "20261231",
    });
  });

  it("keeps an open-ended range and extras", () => {
    expect(parseDr(rep([["20260101"], [""], ["x3"]]), ENC)).toStrictEqual({
      rangeStartDateTime: "20260101",
      extraComponents: ["x3"],
    });
  });
});

describe("MO", () => {
  it("keeps the amount as written, never a number", () => {
    const out = parseMo(rep([["150.00"], ["USD"]]), ENC);
    expect(out).toStrictEqual({ quantity: "150.00", denomination: "USD" });
    expect(typeof out.quantity).toBe("string");
  });

  it("keeps extras past the 2nd", () => {
    expect(parseMo(rep([["1"], [""], ["x3"]]), ENC)).toStrictEqual({
      quantity: "1",
      extraComponents: ["x3"],
    });
  });
});

describe("CP", () => {
  it("reads the nested price, range and nested range units", () => {
    const out = parseCp(
      rep([["150.00", "USD"], ["UP"], ["1"], ["10"], ["EA", "each", "99UNIT"], ["F"]]),
      ENC,
    );
    expect(out).toStrictEqual({
      price: { quantity: "150.00", denomination: "USD" },
      priceType: "UP",
      fromValue: "1",
      toValue: "10",
      rangeUnits: { identifier: "EA", text: "each", nameOfCodingSystem: "99UNIT" },
      rangeType: "F",
    });
  });

  it("omits empty nested parts and keeps extras past the 6th", () => {
    const out = parseCp(rep([[""], [""], [""], [""], ["", ""], [""], ["x7"]]), ENC);
    expect(out).toStrictEqual({ extraComponents: ["x7"] });
    expect(parseCp({ components: [] }, ENC)).toStrictEqual({});
  });
});

describe("CQ", () => {
  it("reads the quantity and the nested units", () => {
    expect(parseCq(rep([["2"], ["TAB", "tablet", "99UNIT"]]), ENC)).toStrictEqual({
      quantity: "2",
      units: { identifier: "TAB", text: "tablet", nameOfCodingSystem: "99UNIT" },
    });
  });

  it("omits empty units and keeps extras", () => {
    expect(parseCq(rep([["2"], [""], ["x3"]]), ENC)).toStrictEqual({
      quantity: "2",
      extraComponents: ["x3"],
    });
  });
});

describe("VID", () => {
  it("reads the version and both nested coded parts", () => {
    expect(parseVid(rep([["2.5.1"], ["USA", "United States"], ["2.5.1.1"]]), ENC)).toStrictEqual({
      versionId: "2.5.1",
      internationalizationCode: { identifier: "USA", text: "United States" },
      internationalVersionId: { identifier: "2.5.1.1" },
    });
  });

  it("omits empty parts and keeps extras", () => {
    expect(parseVid(rep([["2.9"], [""], [""], ["x4"]]), ENC)).toStrictEqual({
      versionId: "2.9",
      extraComponents: ["x4"],
    });
  });
});

describe("MSG", () => {
  it("reads code, event and structure", () => {
    expect(parseMsg(rep([["ADT"], ["A01"], ["ADT_A01"]]), ENC)).toStrictEqual({
      messageCode: "ADT",
      triggerEvent: "A01",
      messageStructure: "ADT_A01",
    });
  });

  it("keeps extras past the 3rd", () => {
    expect(parseMsg(rep([["ACK"], [""], [""], ["x4"]]), ENC)).toStrictEqual({
      messageCode: "ACK",
      extraComponents: ["x4"],
    });
  });
});

describe("PT", () => {
  it("reads processing id and mode", () => {
    expect(parsePt(rep([["P"], ["T"]]), ENC)).toStrictEqual({
      processingId: "P",
      processingMode: "T",
    });
  });

  it("keeps extras past the 2nd", () => {
    expect(parsePt(rep([["D"], [""], ["x3"]]), ENC)).toStrictEqual({
      processingId: "D",
      extraComponents: ["x3"],
    });
  });
});

describe("FC", () => {
  it("reads a v2.5 bare code as the nested identifier", () => {
    expect(parseFc(rep([["SP"], ["20260101"]]), ENC)).toStrictEqual({
      financialClassCode: { identifier: "SP" },
      effectiveDate: "20260101",
    });
  });

  it("reads a v2.7 coded class with its text and system", () => {
    expect(parseFc(rep([["SP", "Self pay", "HL70064"]]), ENC)).toStrictEqual({
      financialClassCode: { identifier: "SP", text: "Self pay", nameOfCodingSystem: "HL70064" },
    });
  });

  it("omits an empty class and keeps extras", () => {
    expect(parseFc(rep([[""], [""], ["x3"]]), ENC)).toStrictEqual({ extraComponents: ["x3"] });
  });
});

describe("Field accessors", () => {
  const raw =
    "MSH|^~\\&|APP|FAC|LAB|REF|20260102||ORU^R01^ORU_R01|CTRL1|P^T|2.5.1^USA|||||||||PROF-1^CLINIC^2.16.840.1.113883.19.1^ISO\r" +
    "PID|1||MRN0001^^^HOSP^MR||Doe^Jane\r" +
    "PV1|1|O||||||||||||||||||SP^20260101\r" +
    "ORC|NW|PL-1001^CLINIC|FL-2002^LAB\r" +
    "OBR|1|PL-1001^CLINIC|FL-2002^LAB|GLU^Glucose^LN|||||||||||||||||||||||||PL-0900&CLINIC^FL-1900&LAB\r" +
    "TQ1|1|2^TAB&tablet\r" +
    "FT1|1||||20260102|CG|CODE1||||1|150.00&USD^UP\r" +
    "OBX|1|CE|Y^Yes^HL70136||ok\r" +
    "ZCV|20260101^20261231|150.00^USD";
  const msg = parseHL7(raw);
  const msh = msg.segments("MSH")[0];
  const field = (seg: string, n: number) => msg.segments(seg)[0]?.field(n);

  it("asEi, asMsg, asPt, asVid read the header composites", () => {
    expect(msh?.field(21).asEi()).toStrictEqual({
      entityIdentifier: "PROF-1",
      namespaceId: "CLINIC",
      universalId: "2.16.840.1.113883.19.1",
      universalIdType: "ISO",
    });
    expect(msh?.field(9).asMsg()).toStrictEqual({
      messageCode: "ORU",
      triggerEvent: "R01",
      messageStructure: "ORU_R01",
    });
    expect(msh?.field(11).asPt()).toStrictEqual({ processingId: "P", processingMode: "T" });
    expect(msh?.field(12).asVid()).toStrictEqual({
      versionId: "2.5.1",
      internationalizationCode: { identifier: "USA" },
    });
  });

  it("asEip, asCq, asCp, asCne, asFc, asDr, asMo read the body composites", () => {
    expect(field("OBR", 29)?.asEip()).toStrictEqual({
      placerAssignedIdentifier: { entityIdentifier: "PL-0900", namespaceId: "CLINIC" },
      fillerAssignedIdentifier: { entityIdentifier: "FL-1900", namespaceId: "LAB" },
    });
    expect(field("TQ1", 2)?.asCq()).toStrictEqual({
      quantity: "2",
      units: { identifier: "TAB", text: "tablet" },
    });
    expect(field("FT1", 12)?.asCp()).toStrictEqual({
      price: { quantity: "150.00", denomination: "USD" },
      priceType: "UP",
    });
    expect(field("OBX", 3)?.asCne()).toStrictEqual({
      identifier: "Y",
      text: "Yes",
      nameOfCodingSystem: "HL70136",
    });
    expect(field("PV1", 20)?.asFc()).toStrictEqual({
      financialClassCode: { identifier: "SP" },
      effectiveDate: "20260101",
    });
    expect(field("ZCV", 1)?.asDr()).toStrictEqual({
      rangeStartDateTime: "20260101",
      rangeEndDateTime: "20261231",
    });
    expect(field("ZCV", 2)?.asMo()).toStrictEqual({ quantity: "150.00", denomination: "USD" });
  });

  it("an empty field reads as {} through every new accessor", () => {
    const empty = msg.segments("PID")[0]?.field(40);
    expect(empty?.asEi()).toStrictEqual({});
    expect(empty?.asEip()).toStrictEqual({});
    expect(empty?.asCne()).toStrictEqual({});
    expect(empty?.asDr()).toStrictEqual({});
    expect(empty?.asMo()).toStrictEqual({});
    expect(empty?.asCp()).toStrictEqual({});
    expect(empty?.asCq()).toStrictEqual({});
    expect(empty?.asVid()).toStrictEqual({});
    expect(empty?.asMsg()).toStrictEqual({});
    expect(empty?.asPt()).toStrictEqual({});
    expect(empty?.asFc()).toStrictEqual({});
  });
});

describe("encoders", () => {
  it("encodeComposite dispatches every new kind to its encoder", () => {
    expect(encodeComposite("EI", { entityIdentifier: "A" })).toStrictEqual(
      encodeEi({ entityIdentifier: "A" }),
    );
    expect(
      encodeComposite("EIP", { fillerAssignedIdentifier: { entityIdentifier: "B" } }),
    ).toStrictEqual(encodeEip({ fillerAssignedIdentifier: { entityIdentifier: "B" } }));
    expect(encodeComposite("CNE", { identifier: "Y" })).toStrictEqual(
      encodeCne({ identifier: "Y" }),
    );
    expect(encodeComposite("DR", { rangeStartDateTime: "2026" })).toStrictEqual(
      encodeDr({ rangeStartDateTime: "2026" }),
    );
    expect(encodeComposite("MO", { quantity: "1" })).toStrictEqual(encodeMo({ quantity: "1" }));
    expect(encodeComposite("CP", { priceType: "UP" })).toStrictEqual(encodeCp({ priceType: "UP" }));
    expect(encodeComposite("CQ", { quantity: "2" })).toStrictEqual(encodeCq({ quantity: "2" }));
    expect(encodeComposite("VID", { versionId: "2.9" })).toStrictEqual(
      encodeVid({ versionId: "2.9" }),
    );
    expect(encodeComposite("MSG", { messageCode: "ACK" })).toStrictEqual(
      encodeMsg({ messageCode: "ACK" }),
    );
    expect(encodeComposite("PT", { processingId: "P" })).toStrictEqual(
      encodePt({ processingId: "P" }),
    );
    expect(encodeComposite("FC", { effectiveDate: "2026" })).toStrictEqual(
      encodeFc({ effectiveDate: "2026" }),
    );
  });

  it("an all-empty value encodes to an absent field", () => {
    expect(encodeEi({})).toStrictEqual({ repetitions: [], isNull: false });
    expect(encodeEip({})).toStrictEqual({ repetitions: [], isNull: false });
    expect(encodeCp({})).toStrictEqual({ repetitions: [], isNull: false });
    expect(encodeFc({})).toStrictEqual({ repetitions: [], isNull: false });
    // A nested composite that is present but empty is an empty component too.
    expect(encodeCp({ price: {}, rangeUnits: {} })).toStrictEqual({
      repetitions: [],
      isNull: false,
    });
  });

  it("emits a nested composite as one &-joined component, trailing empties trimmed", () => {
    expect(
      encodeEip({ placerAssignedIdentifier: { entityIdentifier: "PL-1", namespaceId: "C" } }),
    ).toStrictEqual({
      repetitions: [{ components: [{ subcomponents: ["PL-1", "C"] }] }],
      isNull: false,
    });
  });

  it("escapes a delimiter inside a nested part instead of forging a boundary", () => {
    const value = { quantity: "2", units: { identifier: "A&B", text: "x^y" } };
    expect(parseCq(roundTrip(encodeCq(value)), ENC)).toStrictEqual(value);
  });

  it("round-trips the header composites through a real message", () => {
    const vid = {
      versionId: "2.5.1",
      internationalizationCode: { identifier: "USA" },
      internationalVersionId: { identifier: "V1" },
      extraComponents: ["x4"],
    };
    expect(parseVid(roundTrip(encodeVid(vid)), ENC)).toStrictEqual(vid);
    const msgType = { messageCode: "ORU", triggerEvent: "R01", extraComponents: ["", "x5"] };
    expect(parseMsg(roundTrip(encodeMsg(msgType)), ENC)).toStrictEqual(msgType);
  });

  it("the HL7 namespace carries every new type", () => {
    const values: [
      HL7.EI,
      HL7.EIP,
      HL7.CNE,
      HL7.DR,
      HL7.MO,
      HL7.CP,
      HL7.CQ,
      HL7.VID,
      HL7.MSG,
      HL7.PT,
      HL7.FC,
    ] = [
      { entityIdentifier: "A" },
      {},
      { identifier: "Y" },
      {},
      { quantity: "1" },
      {},
      {},
      { versionId: "2.9" },
      { messageCode: "ACK" },
      { processingId: "P" },
      {},
    ];
    expect(values).toHaveLength(11);
  });
});
