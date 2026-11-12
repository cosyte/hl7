/**
 * The v2 XML encoding rules we checked against the public sources: segment groups, the `escape`
 * element for formatting escapes, character references for hex escapes, a composite that keeps its
 * component element, namespace prefixes, a root named for the message structure, and components
 * named for a segment. Each case follows the shape of the published example it names (the encoding
 * rules' sections 2.4.1, 2.6.2, 2.7.5 and 2.7.8), with our own synthetic values. Every value is
 * synthetic.
 */

import { describe, expect, it } from "vitest";

import {
  Hl7XmlError,
  XML_GROUP_TABLES,
  parseHL7,
  parseHL7Xml,
  toHl7Xml,
  type Hl7Message,
  type XmlMessageStructure,
  type XmlStructureItem,
} from "../src/index.js";

/** `CODE: message` of the `Hl7XmlError` `call` throws, or what it threw instead. */
function why(call: () => unknown): string {
  try {
    call();
  } catch (error) {
    if (error instanceof Hl7XmlError) return `${error.code}: ${error.message}`;
    return `not an Hl7XmlError: ${String(error)}`;
  }
  return "no refusal";
}

/** A v2.5 ORU^R01 header with the message structure in MSH-9.3. */
const ORU_MSH = "MSH|^~\\&|TESTLAB||||20260102101500||ORU^R01^ORU_R01|XMLG01|P|2.5";

/** A message of `ORU_MSH` and `segments`. */
function oru(...segments: string[]): Hl7Message {
  return parseHL7([ORU_MSH, ...segments].join("\r") + "\r");
}

/** The XML MSH element `ORU_MSH` is written as, with MSH.9 typed `MSG`. */
const ORU_MSH_XML =
  "<MSH><MSH.1>|</MSH.1><MSH.2>^~\\&amp;</MSH.2><MSH.3>TESTLAB</MSH.3><MSH.7>20260102101500</MSH.7>" +
  "<MSH.9><MSG.1>ORU</MSG.1><MSG.2>R01</MSG.2><MSG.3>ORU_R01</MSG.3></MSH.9><MSH.10>XMLG01</MSH.10>" +
  "<MSH.11>P</MSH.11><MSH.12>2.5</MSH.12></MSH>";

/** A v2.6 ADT^A01 header, a structure the tables do not cover. */
const ADT_MSH = "MSH|^~\\&|||||||ADT^A01|X1|P|2.6";

/** A message of `ADT_MSH` and `segments`. */
function adt(...segments: string[]): Hl7Message {
  return parseHL7([ADT_MSH, ...segments].join("\r") + "\r");
}

/** `toHl7Xml` with MSH.9 typed and segments written directly under the root. */
function flat(msg: Hl7Message, dataTypes: Readonly<Record<string, string>> = {}): string {
  return toHl7Xml(msg, { dataTypes: { "MSH.9": "MSG", ...dataTypes }, groups: "none" });
}

/** The ADT document of `body` in the v2.6 ADT header, for the reader. */
function adtDoc(body: string): string {
  return (
    "<ADT_A01><MSH><MSH.1>|</MSH.1><MSH.2>^~\\&amp;</MSH.2>" +
    "<MSH.9><MSG.1>ADT</MSG.1><MSG.2>A01</MSG.2></MSH.9><MSH.10>X1</MSH.10><MSH.11>P</MSH.11>" +
    `<MSH.12>2.6</MSH.12></MSH>${body}</ADT_A01>`
  );
}

describe("the writer places segments in the message structure's groups", () => {
  it("writes a v2.5 ORU_R01 in the groups of the v2.5 schema, nested and repeated", () => {
    const msg = oru(
      "PID|1||TESTID01",
      "OBR|1",
      "OBX|1|NM|TST-1||4.2",
      "NTE|1||Test note",
      "OBR|2",
      "OBX|1|NM|TST-2||7",
      "SPM|1",
      "OBX|1|ST|TST-3||Test",
    );
    const xml = toHl7Xml(msg, { dataTypes: { "MSH.9": "MSG" } });
    expect(xml).toBe(
      [
        '<?xml version="1.0" encoding="UTF-8"?>',
        '<ORU_R01 xmlns="urn:hl7-org:v2xml">',
        `  ${ORU_MSH_XML}`,
        "  <ORU_R01.PATIENT_RESULT>",
        "    <ORU_R01.PATIENT>",
        "      <PID><PID.1>1</PID.1><PID.3>TESTID01</PID.3></PID>",
        "    </ORU_R01.PATIENT>",
        "    <ORU_R01.ORDER_OBSERVATION>",
        "      <OBR><OBR.1>1</OBR.1></OBR>",
        "      <ORU_R01.OBSERVATION>",
        "        <OBX><OBX.1>1</OBX.1><OBX.2>NM</OBX.2><OBX.3>TST-1</OBX.3><OBX.5>4.2</OBX.5></OBX>",
        "        <NTE><NTE.1>1</NTE.1><NTE.3>Test note</NTE.3></NTE>",
        "      </ORU_R01.OBSERVATION>",
        "    </ORU_R01.ORDER_OBSERVATION>",
        "    <ORU_R01.ORDER_OBSERVATION>",
        "      <OBR><OBR.1>2</OBR.1></OBR>",
        "      <ORU_R01.OBSERVATION>",
        "        <OBX><OBX.1>1</OBX.1><OBX.2>NM</OBX.2><OBX.3>TST-2</OBX.3><OBX.5>7</OBX.5></OBX>",
        "      </ORU_R01.OBSERVATION>",
        "      <ORU_R01.SPECIMEN>",
        "        <SPM><SPM.1>1</SPM.1></SPM>",
        "        <OBX><OBX.1>1</OBX.1><OBX.2>ST</OBX.2><OBX.3>TST-3</OBX.3><OBX.5>Test</OBX.5></OBX>",
        "      </ORU_R01.SPECIMEN>",
        "    </ORU_R01.ORDER_OBSERVATION>",
        "  </ORU_R01.PATIENT_RESULT>",
        "</ORU_R01>",
        "",
      ].join("\n"),
    );
    expect(parseHL7Xml(xml).rawSegments).toEqual(msg.rawSegments);
  });

  it("starts a new patient result at a second PID, and a timing group at TQ1", () => {
    const msg = oru("PID|1", "PV1|1", "OBR|1", "TQ1|1", "TQ2|1", "PID|2", "OBR|2");
    const xml = toHl7Xml(msg, { dataTypes: { "MSH.9": "MSG" } });
    const opened = xml
      .split("\n")
      .map((line) => line.trim())
      .filter((line) => line.startsWith("<ORU_R01."));
    expect(opened).toEqual([
      "<ORU_R01.PATIENT_RESULT>",
      "<ORU_R01.PATIENT>",
      "<ORU_R01.VISIT>",
      "<ORU_R01.ORDER_OBSERVATION>",
      "<ORU_R01.TIMING_QTY>",
      "<ORU_R01.PATIENT_RESULT>",
      "<ORU_R01.PATIENT>",
      "<ORU_R01.ORDER_OBSERVATION>",
    ]);
  });

  it("lists the structures its tables cover: ORU_R01 in v2.5, the one it writes", () => {
    expect(Object.keys(XML_GROUP_TABLES)).toEqual(["2.5", "2.6"]);
    expect(Object.keys(XML_GROUP_TABLES["2.5"] ?? {})).toEqual(["ORU_R01"]);
    const table = XML_GROUP_TABLES["2.5"]?.["ORU_R01"] as XmlMessageStructure;
    expect(Object.isFrozen(table.items)).toBe(true);
    expect(Object.isFrozen(table.items[2])).toBe(true);
    const msg = oru(
      "PID|1",
      "PD1|1",
      "NK1|1",
      "PV1|1",
      "PV2|1",
      "ORC|1",
      "OBR|1",
      "CTD|1",
      "FT1|1",
    );
    const dataTypes = { "MSH.9": "MSG" };
    expect(toHl7Xml(msg, { dataTypes, groups: table })).toBe(toHl7Xml(msg, { dataTypes }));
  });

  it("places each optional segment at most once", () => {
    expect(
      why(() =>
        toHl7Xml(oru("PID|1", "PD1|1", "PD1|2", "OBR|1"), { dataTypes: { "MSH.9": "MSG" } }),
      ),
    ).toBe(
      "STRUCTURE_MISMATCH: The message lacks a segment or group the message structure requires.",
    );
  });

  it("refuses a structure the tables do not cover, by name, unless given its groups", () => {
    expect(why(() => toHl7Xml(adt("PID|1"), { dataTypes: { "MSH.9": "MSG" } }))).toBe(
      "GROUPS_UNKNOWN: No group table covers ADT_A01 in v2.6; pass `groups`.",
    );
    const v26 = parseHL7(`${ORU_MSH.replace("|2.5", "|2.6")}\rPID|1\rOBR|1\r`);
    expect(why(() => toHl7Xml(v26, { dataTypes: { "MSH.9": "MSG" } }))).toBe(
      "GROUPS_UNKNOWN: No group table covers ORU_R01 in v2.6; pass `groups`.",
    );
    for (const structure of ["Test_Root", "xADT_A01", "ADT_A01x", "constructor"]) {
      expect(why(() => toHl7Xml(adt(), { structure }))).toBe(
        "GROUPS_UNKNOWN: No group table covers this message structure in v2.6; pass `groups`.",
      );
    }
    expect(why(() => toHl7Xml(oru(), { structure: "constructor" }))).toBe(
      "GROUPS_UNKNOWN: No group table covers this message structure in v2.5; pass `groups`.",
    );
    expect(why(() => toHl7Xml(adt(), { structure: "M1M_T01" }))).toBe(
      "GROUPS_UNKNOWN: No group table covers M1M_T01 in v2.6; pass `groups`.",
    );
    for (const version of ["", "|not a version"]) {
      const msg = parseHL7(`MSH|^~\\&|||||||ADT^A01|1|P${version}\r`);
      expect(why(() => toHl7Xml(msg))).toBe(
        "GROUPS_UNKNOWN: No group table covers ADT_A01 in its version; pass `groups`.",
      );
    }
  });

  it("writes the groups of a structure the caller supplies, with no namespace", () => {
    // A made-up structure in the shape a partner's schema gives, not a published one.
    const structure: XmlMessageStructure = {
      structure: "TST_T01",
      items: [
        "MSH",
        {
          group: "SUBJECT+",
          items: [
            "PID",
            { group: "SAMPLE*", items: ["SPM", { group: "RESULT*", items: ["OBX"] }] },
          ],
        },
      ],
    };
    const msg = parseHL7(
      "MSH|^~\\&|||||||TST^T01|1|P|2.6\rPID|1\rSPM|1\rOBX|1\rOBX|2\rSPM|2\rPID|2\r",
    );
    const xml = toHl7Xml(msg, {
      dataTypes: { "MSH.9": "MSG" },
      groups: structure,
      namespace: null,
    });
    expect(xml.split("\n").slice(1, 4)).toEqual([
      "<TST_T01>",
      expect.stringMatching(/^ {2}<MSH>/u),
      "  <TST_T01.SUBJECT>",
    ]);
    expect(xml).toContain(
      [
        "    <TST_T01.SAMPLE>",
        "      <SPM><SPM.1>1</SPM.1></SPM>",
        "      <TST_T01.RESULT>",
        "        <OBX><OBX.1>1</OBX.1></OBX>",
        "      </TST_T01.RESULT>",
        "      <TST_T01.RESULT>",
        "        <OBX><OBX.1>2</OBX.1></OBX>",
        "      </TST_T01.RESULT>",
        "    </TST_T01.SAMPLE>",
        "    <TST_T01.SAMPLE>",
        "      <SPM><SPM.1>2</SPM.1></SPM>",
        "    </TST_T01.SAMPLE>",
        "  </TST_T01.SUBJECT>",
        "  <TST_T01.SUBJECT>",
        "    <PID><PID.1>2</PID.1></PID>",
        "  </TST_T01.SUBJECT>",
      ].join("\n"),
    );
    expect(parseHL7Xml(xml).rawSegments).toEqual(msg.rawSegments);
  });

  it("writes every segment under the root with groups none", () => {
    const xml = flat(adt("PID|1"));
    expect(xml.split("\n").slice(1, 5)).toEqual([
      '<ADT_A01 xmlns="urn:hl7-org:v2xml">',
      expect.stringMatching(/^ {2}<MSH>/u),
      "  <PID><PID.1>1</PID.1></PID>",
      "</ADT_A01>",
    ]);
  });

  it("starts a new order at a second OBR, and requires OBR in each order", () => {
    const msg = oru("PID|1", "OBR|1", "OBR|2");
    const xml = toHl7Xml(msg, { dataTypes: { "MSH.9": "MSG" } });
    expect(xml.split("<ORU_R01.ORDER_OBSERVATION>").length).toBe(3);
    expect(why(() => toHl7Xml(oru("PID|1", "ORC|1"), { dataTypes: { "MSH.9": "MSG" } }))).toBe(
      "STRUCTURE_MISMATCH: The message lacks a segment or group the message structure requires.",
    );
  });

  it("writes no element for a group that takes no segment", () => {
    const groups: XmlMessageStructure = {
      structure: "ADT_A01",
      items: [
        "MSH",
        { group: "ONCE?", items: ["NTE*"] },
        { group: "MANY*", items: ["NTE*"] },
        "PID",
      ],
    };
    const xml = toHl7Xml(adt("PID|1"), { dataTypes: { "MSH.9": "MSG" }, groups });
    expect(xml).not.toContain("ADT_A01.");
    expect(xml).toContain("  <PID><PID.1>1</PID.1></PID>\n</ADT_A01>");
  });

  it("refuses segments that do not fit the structure", () => {
    const write = (msg: Hl7Message): string =>
      why(() => toHl7Xml(msg, { dataTypes: { "MSH.9": "MSG" } }));
    expect(write(oru("PID|1"))).toBe(
      "STRUCTURE_MISMATCH: The message lacks a segment or group the message structure requires.",
    );
    expect(write(oru("PID|1", "OBR|1", "ZZZ|1"))).toBe(
      "STRUCTURE_MISMATCH: Segment 4 of the message has no place in the message structure.",
    );
    expect(write(oru("OBR|1", "PID|1"))).toBe(
      "STRUCTURE_MISMATCH: Segment 3 of the message has no place in the message structure.",
    );
  });

  it("refuses a malformed structure, or one that names another root", () => {
    const write = (groups: unknown, structure?: string): string =>
      why(() =>
        toHl7Xml(adt(), {
          dataTypes: { "MSH.9": "MSG" },
          groups: groups as XmlMessageStructure,
          ...(structure === undefined ? {} : { structure }),
        }),
      );
    const ok = { structure: "ADT_A01", items: ["MSH"] };
    expect(write(ok, "ADT_A02")).toBe(
      "INVALID_OPTIONS: The structure option names another root than `groups`.",
    );
    expect(write(ok, "ADT_A01")).toBe("no refusal");
    expect(write({ structure: "A B", items: ["MSH"] })).toBe(
      "INVALID_OPTIONS: The structure in `groups` is not an XML name.",
    );
    expect(write({ items: ["MSH"] })).toBe(
      "INVALID_OPTIONS: The structure in `groups` is not an XML name.",
    );
    for (const items of [[], "MSH", undefined]) {
      expect(write({ structure: "ADT_A01", items })).toBe(
        "INVALID_OPTIONS: A structure or group in `groups` has no items.",
      );
    }
    for (const segment of ["pid", "1PID", "PIDX", "PI"]) {
      expect(write({ structure: "ADT_A01", items: ["MSH", segment] })).toBe(
        "INVALID_OPTIONS: A segment in `groups` is not a segment id.",
      );
    }
    for (const item of [3, null]) {
      expect(write({ structure: "ADT_A01", items: ["MSH", item] })).toBe(
        "INVALID_OPTIONS: An item in `groups` is neither a segment id nor a group.",
      );
    }
    for (const group of [undefined, 5]) {
      expect(write({ structure: "ADT_A01", items: ["MSH", { group, items: ["PID"] }] })).toBe(
        "INVALID_OPTIONS: A group in `groups` has no name.",
      );
    }
    for (const group of ["a.b", "a.B", "A.b", "_A"]) {
      expect(write({ structure: "ADT_A01", items: ["MSH", { group, items: ["PID"] }] })).toBe(
        "INVALID_OPTIONS: A group name in `groups` is not uppercase letters, digits and underscores.",
      );
    }
    /** A structure of MSH and `levels` optional groups nested one in another. */
    const nested = (levels: number): XmlMessageStructure => {
      let deep: XmlStructureItem = "PID";
      for (let i = 0; i < levels; i++) deep = { group: "G?", items: [deep] };
      return { structure: "ADT_A01", items: ["MSH", deep] };
    };
    expect(write(nested(32))).toBe("no refusal");
    expect(write(nested(33))).toBe("INVALID_OPTIONS: The groups in `groups` nest too deep.");
  });
});

describe("the v2.6 laboratory structures OPU_R25, OPL_O37 and OPR_O38", () => {
  // Each table as the three public copies of the v2.6 schema give it, read by hand from them.
  const OPU_R25: XmlMessageStructure = {
    structure: "OPU_R25",
    items: [
      "MSH",
      "SFT*",
      "UAC?",
      "NTE?",
      "PV1",
      "PV2?",
      "OBX*",
      "NTE*",
      "ROL+",
      {
        group: "ACCESSION_DETAIL+",
        items: [
          "NK1+",
          {
            group: "PATIENT?",
            items: ["PID", "PD1?", { group: "PATIENT_OBSERVATION*", items: ["OBX", "NTE*"] }],
          },
          {
            group: "SPECIMEN+",
            items: [
              "SPM",
              { group: "SPECIMEN_OBSERVATION*", items: ["OBX", "NTE*"] },
              { group: "CONTAINER*", items: ["SAC", "INV?"] },
              {
                group: "ORDER+",
                items: [
                  "OBR",
                  "ORC?",
                  "NTE*",
                  "ROL*",
                  { group: "TIMING_QTY*", items: ["TQ1", "TQ2*"] },
                  { group: "RESULT+", items: ["OBX", "NTE*"] },
                ],
              },
            ],
          },
        ],
      },
    ],
  };
  const OPL_O37: XmlMessageStructure = {
    structure: "OPL_O37",
    items: [
      "MSH",
      "SFT*",
      "UAC?",
      "NTE*",
      "ROL+",
      { group: "GUARANTOR?", items: ["GT1", "NTE*"] },
      {
        group: "ORDER+",
        items: [
          "NK1+",
          {
            group: "PATIENT?",
            items: [
              "PID",
              "PD1?",
              "OBX*",
              { group: "INSURANCE*", items: ["IN1", "IN2?", "IN3?"] },
              "AL1*",
            ],
          },
          {
            group: "SPECIMEN+",
            items: [
              "SPM",
              "OBX*",
              { group: "CONTAINER*", items: ["SAC", "OBX*"] },
              {
                group: "OBSERVATION_REQUEST+",
                items: [
                  "ORC",
                  "OBR",
                  "ROL*",
                  { group: "TIMING*", items: ["TQ1", "TQ2*"] },
                  "TCD?",
                  "DG1*",
                  "OBX*",
                ],
              },
            ],
          },
          {
            group: "PRIOR_RESULT?",
            items: [
              "NK1+",
              { group: "PATIENT_PRIOR?", items: ["PID", "PD1?"] },
              { group: "PATIENT_VISIT_PRIOR?", items: ["PV1", "PV2?"] },
              "AL1?",
              {
                group: "ORDER_PRIOR+",
                items: [
                  "OBR",
                  "ORC?",
                  "ROL*",
                  { group: "TIMING?", items: ["TQ1", "TQ2*"] },
                  "OBX+",
                ],
              },
            ],
          },
          "FT1*",
          "CTI*",
          "BLG?",
        ],
      },
    ],
  };
  const OPR_O38: XmlMessageStructure = {
    structure: "OPR_O38",
    items: [
      "MSH",
      "MSA",
      "ERR*",
      "SFT*",
      "UAC?",
      "NTE*",
      {
        group: "RESPONSE?",
        items: [
          {
            group: "ORDER+",
            items: [
              "NK1+",
              "PID?",
              {
                group: "SPECIMEN*",
                items: [
                  "SPM",
                  "OBX*",
                  "SAC*",
                  { group: "OBSERVATION_REQUEST*", items: ["ORC", "OBR", "ROL*"] },
                  { group: "TIMING*", items: ["TQ1", "TQ2*"] },
                ],
              },
            ],
          },
        ],
      },
    ],
  };

  /** A v2.6 message of type `type` (code, trigger and structure) and `segments`. */
  const lab = (type: string, ...segments: string[]): Hl7Message =>
    parseHL7([`MSH|^~\\&|TESTLAB||||20260102101500||${type}|XMLL01|P|2.6`, ...segments].join("\r"));

  /** The group elements `xml` opens, in order. */
  const opened = (xml: string, root: string): string[] =>
    xml
      .split("\n")
      .map((line) => line.trim())
      .filter((line) => line.startsWith(`<${root}.`));

  it("ships each table as the schema gives it, frozen", () => {
    expect(Object.keys(XML_GROUP_TABLES["2.6"] ?? {})).toEqual(["OPU_R25", "OPL_O37", "OPR_O38"]);
    expect(XML_GROUP_TABLES["2.6"]?.["OPU_R25"]).toEqual(OPU_R25);
    expect(XML_GROUP_TABLES["2.6"]?.["OPL_O37"]).toEqual(OPL_O37);
    expect(XML_GROUP_TABLES["2.6"]?.["OPR_O38"]).toEqual(OPR_O38);
    for (const table of Object.values(XML_GROUP_TABLES["2.6"] ?? {})) {
      expect(Object.isFrozen(table)).toBe(true);
      expect(Object.isFrozen(table.items)).toBe(true);
    }
  });

  it("writes a v2.6 OPU_R25 in its groups with no `groups` option, and reads it back", () => {
    const msg = lab(
      "OPU^R25^OPU_R25",
      "PV1|1",
      "ROL|1",
      "NK1|1",
      "PID|1||TESTPET01",
      "SPM|1",
      "OBX|1|ST|TST-1||Test",
      "SAC|1",
      "OBR|1",
      "TQ1|1",
      "OBX|1|NM|TST-2||4.2",
      "NTE|1||Test note",
      "OBX|2|NM|TST-3||7",
      "NK1|2",
      "SPM|2",
      "OBR|2",
      "OBX|1|NM|TST-4||1",
    );
    const dataTypes = { "MSH.9": "MSG" };
    const xml = toHl7Xml(msg, { dataTypes });
    expect(opened(xml, "OPU_R25")).toEqual([
      "<OPU_R25.ACCESSION_DETAIL>",
      "<OPU_R25.PATIENT>",
      "<OPU_R25.SPECIMEN>",
      "<OPU_R25.SPECIMEN_OBSERVATION>",
      "<OPU_R25.CONTAINER>",
      "<OPU_R25.ORDER>",
      "<OPU_R25.TIMING_QTY>",
      "<OPU_R25.RESULT>",
      "<OPU_R25.RESULT>",
      "<OPU_R25.ACCESSION_DETAIL>",
      "<OPU_R25.SPECIMEN>",
      "<OPU_R25.ORDER>",
      "<OPU_R25.RESULT>",
    ]);
    expect(xml).toBe(toHl7Xml(msg, { dataTypes, groups: OPU_R25 }));
    expect(parseHL7Xml(xml).rawSegments).toEqual(msg.rawSegments);
  });

  it("writes a v2.6 OPL_O37 and its OPR_O38 response in their groups", () => {
    const order = lab(
      "OPL^O37^OPL_O37",
      "ROL|1",
      "NK1|1",
      "PID|1||TESTPET02",
      "SPM|1",
      "ORC|NW",
      "OBR|1",
      "NK1|2",
      "PID|2",
      "PV1|1",
      "OBR|9",
      "OBX|1|ST|TST-5||Test",
    );
    expect(opened(toHl7Xml(order, { dataTypes: { "MSH.9": "MSG" } }), "OPL_O37")).toEqual([
      "<OPL_O37.ORDER>",
      "<OPL_O37.PATIENT>",
      "<OPL_O37.SPECIMEN>",
      "<OPL_O37.OBSERVATION_REQUEST>",
      "<OPL_O37.PRIOR_RESULT>",
      "<OPL_O37.PATIENT_PRIOR>",
      "<OPL_O37.PATIENT_VISIT_PRIOR>",
      "<OPL_O37.ORDER_PRIOR>",
    ]);
    const response = lab("OPR^O38^OPR_O38", "MSA|AA|XMLL01", "NK1|1", "SPM|1", "ORC|OK", "OBR|1");
    const xml = toHl7Xml(response, { dataTypes: { "MSH.9": "MSG" } });
    expect(opened(xml, "OPR_O38")).toEqual([
      "<OPR_O38.RESPONSE>",
      "<OPR_O38.ORDER>",
      "<OPR_O38.SPECIMEN>",
      "<OPR_O38.OBSERVATION_REQUEST>",
    ]);
    expect(parseHL7Xml(xml).rawSegments).toEqual(response.rawSegments);
  });

  it("refuses a lab message that does not fit, and the same structures in another version", () => {
    expect(
      why(() => toHl7Xml(lab("OPU^R25^OPU_R25", "PV1|1"), { dataTypes: { "MSH.9": "MSG" } })),
    ).toBe(
      "STRUCTURE_MISMATCH: The message lacks a segment or group the message structure requires.",
    );
    const v25 = parseHL7("MSH|^~\\&|||||||OPU^R25^OPU_R25|X1|P|2.5\rPV1|1\r");
    expect(why(() => toHl7Xml(v25))).toBe(
      "GROUPS_UNKNOWN: No group table covers OPU_R25 in v2.5; pass `groups`.",
    );
    for (const [version, structure] of [
      ["2.5.1", "OPU_R25"],
      ["2.7", "OPL_O37"],
      ["2.6.1", "OPR_O38"],
    ] as const) {
      const msg = parseHL7(
        `MSH|^~\\&|||||||${structure.replace("_", "^")}^${structure}|X1|P|${version}\r`,
      );
      expect(why(() => toHl7Xml(msg))).toBe(
        `GROUPS_UNKNOWN: No group table covers ${structure} in v${version}; pass \`groups\`.`,
      );
    }
    expect(why(() => toHl7Xml(lab("ORU^R01^ORU_R01", "PID|1", "OBR|1")))).toBe(
      "GROUPS_UNKNOWN: No group table covers ORU_R01 in v2.6; pass `groups`.",
    );
  });
});

describe("the root element is the message structure", () => {
  it("takes the structure our registry maps MSH-9.1 and MSH-9.2 to when MSH-9.3 is empty", () => {
    // ADT^A04 shares the ADT_A01 structure, so no schema declares an ADT_A04 root.
    const a04 = parseHL7("MSH|^~\\&|||||||ADT^A04|1|P|2.6\rEVN|A04\r");
    expect(flat(a04).split("\n")[1]).toBe('<ADT_A01 xmlns="urn:hl7-org:v2xml">');
    const ack = parseHL7("MSH|^~\\&|||||||ACK^A01|1|P|2.6\rMSA|AA|1\r");
    expect(flat(ack).split("\n")[1]).toBe('<ACK xmlns="urn:hl7-org:v2xml">');
  });

  it("refuses a code and trigger the registry does not map, rather than guess a root", () => {
    for (const header of ["ADT", "ZZZ^Z01", "ADT^A99", "^A01", "ORM^O01"]) {
      const msg = parseHL7(`MSH|^~\\&|||||||${header}|1|P|2.6\r`);
      expect(why(() => flat(msg))).toBe(
        "STRUCTURE_UNKNOWN: No message structure can be taken from MSH-9; pass `structure`.",
      );
    }
    const odd = parseHL7("MSH|^~\\&|||||||ADT^A01^A B|1|P|2.6\r");
    expect(why(() => flat(odd))).toBe(
      "STRUCTURE_UNKNOWN: MSH-9.3 is not an XML name; pass `structure`.",
    );
  });
});

describe("formatting escapes are escape elements, in TX and FT values", () => {
  // Section 2.7.8.0's example: highlighting written as escape elements around a word.
  const highlighted = 'A <escape V="H"/>test<escape V="N"/> word';

  it("reads escape elements as the formatting escapes they stand for", () => {
    const msg = parseHL7Xml(adtDoc(`<NTE><NTE.3>${highlighted}</NTE.3></NTE>`));
    expect(msg.toString().split("\r")[1]).toBe("NTE|||A \\H\\test\\N\\ word");
    const nested = parseHL7Xml(
      adtDoc(
        '<OBX><OBX.5><FT.1>a<escape V=".br"/>b</FT.1><FT.2><ST.1>c<escape V=".in+4"/></ST.1></FT.2></OBX.5></OBX>',
      ),
    );
    expect(nested.toString().split("\r")[1]).toBe("OBX|||||a\\.br\\b^c\\.in+4\\");
  });

  it("reads escape elements in any field but MSH.1 and MSH.2", () => {
    const msh =
      '<MSH><MSH.1>|</MSH.1><MSH.2>^~\\&amp;</MSH.2><MSH.3>a<escape V="H"/></MSH.3>' +
      "<MSH.9><MSG.1>ADT</MSG.1><MSG.2>A01</MSG.2></MSH.9><MSH.12>2.6</MSH.12></MSH>";
    const msg = parseHL7Xml(
      `<ADT_A01>${msh}<NTE><NTE.1>b<escape V="N"/></NTE.1><NTE.2><escape V=".sp"/>c</NTE.2></NTE></ADT_A01>`,
    );
    expect(msg.toString()).toBe("MSH|^~\\&|a\\H\\||||||ADT^A01|||2.6\rNTE|b\\N\\|\\.sp\\c\r");
  });

  it("writes formatting escapes in an FT or TX value as escape elements, and reads them back", () => {
    const msg = adt("NTE|||A \\H\\test\\N\\ word", "OBX|||||one\\.br\\two\\.sp\\three|||a\\.ce\\b");
    const xml = flat(msg, { "NTE.3": "FT", "OBX.5": "TX", "OBX.8": "TX" });
    expect(xml).toContain(`<NTE><NTE.3>${highlighted}</NTE.3></NTE>`);
    expect(xml).toContain(
      '<OBX.5>one<escape V=".br"/>two<escape V=".sp"/>three</OBX.5><OBX.8>a<escape V=".ce"/>b</OBX.8>',
    );
    expect(parseHL7Xml(xml).rawSegments).toEqual(msg.rawSegments);
  });

  it("writes a line break in an FT value as the .br escape element", () => {
    const msg = adt("NTE|||one\\.br\\two");
    expect(flat(msg, { "NTE.3": "FT" })).toContain(
      '<NTE><NTE.3>one<escape V=".br"/>two</NTE.3></NTE>',
    );
    expect(flat(msg)).toContain("<NTE><NTE.3>one&#10;two</NTE.3></NTE>");
  });

  it("writes formatting escapes in a TX subcomponent or component it is told of", () => {
    const msg = adt("NTE|||a&b\\H\\c^d\\N\\");
    const xml = flat(msg, { "NTE.3": "XTST", "XTST.1": "YTST", "YTST.2": "TX", "XTST.2": "FT" });
    expect(xml).toContain(
      '<NTE.3><XTST.1><YTST.1>a</YTST.1><YTST.2>b<escape V="H"/>c</YTST.2></XTST.1><XTST.2>d<escape V="N"/></XTST.2></NTE.3>',
    );
  });

  it("writes every primitive data type as text, and refuses components in one", () => {
    const primitives = ["DT", "DTM", "FT", "GTS", "ID", "IS", "NM", "SI", "SNM", "ST", "TM", "TX"];
    for (const type of primitives) {
      expect(why(() => flat(adt("NTE|||a^b"), { "NTE.3": type }))).toBe(
        "DATA_TYPE_UNKNOWN: A field given a primitive data type holds components. (NTE.3)",
      );
    }
    expect(flat(adt("NTE|||a^b"), { "NTE.3": "TS" })).toContain(
      "<NTE.3><TS.1>a</TS.1><TS.2>b</TS.2></NTE.3>",
    );
  });

  it("writes a primitive data type as text, not a component element", () => {
    expect(flat(adt("NTE|||plain"), { "NTE.3": "FT" })).toContain("<NTE.3>plain</NTE.3>");
    expect(why(() => flat(adt("NTE|||a^b"), { "NTE.3": "ST" }))).toBe(
      "DATA_TYPE_UNKNOWN: A field given a primitive data type holds components. (NTE.3)",
    );
    expect(why(() => flat(adt("NTE|||a&b"), { "NTE.3": "XTST", "XTST.1": "ST" }))).toBe(
      "DATA_TYPE_UNKNOWN: A component given a primitive data type holds subcomponents. (XTST.1)",
    );
  });

  it("refuses a formatting escape in a value that is not TX or FT", () => {
    expect(why(() => flat(adt("NTE|||a\\H\\b")))).toBe(
      "ESCAPE_NOT_SUPPORTED: A formatting escape stands in a value whose data type is not TX or FT. (NTE.3)",
    );
    expect(why(() => flat(adt("NTE|||a\\.sp\\b"), { "NTE.3": "ST" }))).toBe(
      "ESCAPE_NOT_SUPPORTED: A formatting escape stands in a value whose data type is not TX or FT. (NTE.3)",
    );
  });

  it("reads every formatting escape the rules name, with a signed or unsigned number", () => {
    const read = (v: string): string =>
      why(() => parseHL7Xml(adtDoc(`<NTE><NTE.3>a<escape V="${v}"/></NTE.3></NTE>`)));
    for (const v of ["H", "N", ".br", ".sp", ".in", ".ti", ".sk", ".ce", ".fi", ".nf"]) {
      expect(read(v)).toBe("no refusal");
    }
    for (const v of [".sp2", ".ti-12", ".in+4", ".sk999"]) expect(read(v)).toBe("no refusal");
    for (const v of ["xH", "Hx", "HN", ".in+1234", ".in+", ".in4x", "x.br", ".brx", ".sp--2"]) {
      expect(read(v)).toBe(
        "ESCAPE_NOT_SUPPORTED: An escape element's V is not a formatting escape. (NTE.3)",
      );
    }
  });

  it("refuses an escape element that is not a formatting escape, or holds anything", () => {
    const read = (inner: string): string =>
      why(() => parseHL7Xml(adtDoc(`<NTE><NTE.3>${inner}</NTE.3></NTE>`)));
    for (const v of ["X41", "F", "E", "Zabc", ".xx", "", "H\\"]) {
      expect(read(`a<escape V="${v}"/>`)).toBe(
        "ESCAPE_NOT_SUPPORTED: An escape element's V is not a formatting escape. (NTE.3)",
      );
    }
    expect(read("a<escape/>")).toBe(
      "ESCAPE_NOT_SUPPORTED: An escape element's V is not a formatting escape. (NTE.3)",
    );
    expect(read('<escape V="H">x</escape>')).toBe(
      "ESCAPE_NOT_SUPPORTED: An escape element holds text.",
    );
    expect(read('<escape V="H"> </escape>b')).toBe("no refusal");
    expect(read('<escape V="H"><b/></escape>')).toBe(
      "ESCAPE_NOT_SUPPORTED: An escape element holds an element.",
    );
    expect(read('<escape V="H"/><FT.1>a</FT.1>')).toBe(
      "MIXED_CONTENT: An element holds both text and elements. (NTE.3)",
    );
    expect(read('<FT.1>a</FT.1><escape V="H"/>')).toBe(
      "MIXED_CONTENT: An element holds both text and elements. (NTE.3)",
    );
    expect(
      why(() =>
        parseHL7Xml(
          '<ACK><MSH><MSH.1>|</MSH.1><MSH.2>^~\\&amp;<escape V="H"/></MSH.2></MSH></ACK>',
        ),
      ),
    ).toBe("INVALID_ENCODING_CHARACTERS: MSH.1 and MSH.2 hold text only. (MSH.2)");
  });

  it("still refuses the escape character in text, which no published rule covers", () => {
    expect(why(() => parseHL7Xml(adtDoc("<NTE><NTE.3>a\\b</NTE.3></NTE>")))).toBe(
      "ESCAPE_NOT_SUPPORTED: A value holds the message's escape character. (NTE.3)",
    );
    expect(why(() => flat(adt("NTE|||a\\E\\b"), { "NTE.3": "FT" }))).toBe(
      "ESCAPE_NOT_SUPPORTED: A value holds the message's escape character. (NTE.3)",
    );
  });
});

describe("hex escapes are character references", () => {
  /** A message whose MSH-18 is `charset` and whose NTE-3 is `value`. */
  const withCharset = (charset: string, value: string): Hl7Message =>
    parseHL7(`MSH|^~\\&|||||||ADT^A01|X1|P|2.6||||||${charset}\rNTE|||${value}\r`);

  it("writes section 2.7.8.2's example shape as a character reference, in 8859/1", () => {
    const msg = withCharset("8859/1", "\\Xc9\\ditions Test");
    const xml = flat(msg);
    expect(xml).toContain("<NTE.3>&#xc9;ditions Test</NTE.3>");
    expect(parseHL7Xml(xml).get("NTE.3")).toBe("Éditions Test");
  });

  it("decodes the bytes in the message's character set", () => {
    expect(flat(withCharset("UNICODE UTF-8", "\\XC3A9\\"))).toContain("<NTE.3>&#xe9;</NTE.3>");
    expect(flat(withCharset("", "\\X41\\B"))).toContain("<NTE.3>&#x41;B</NTE.3>");
    expect(flat(withCharset("WINDOWS-1252", "\\X80\\"))).toContain("<NTE.3>&#x20ac;</NTE.3>");
    expect(flat(withCharset("UNICODE UTF-8", "\\XF09F9880\\"))).toContain(
      "<NTE.3>&#x1f600;</NTE.3>",
    );
  });

  it("refuses bytes the character set cannot decode, and characters XML forbids", () => {
    const refusal =
      "ESCAPE_NOT_SUPPORTED: A hex escape's bytes are not text in the message's character set. (NTE.3)";
    expect(why(() => flat(withCharset("", "\\XC9\\")))).toBe(refusal);
    expect(why(() => flat(withCharset("UNICODE UTF-8", "\\XC9\\")))).toBe(
      "ESCAPE_NOT_SUPPORTED: A hex escape's bytes are not UTF-8. (NTE.3)",
    );
    expect(why(() => flat(withCharset("", "\\X80\\")))).toBe(refusal);
    expect(why(() => flat(withCharset("", "\\X41C9\\")))).toBe(refusal);
    expect(flat(withCharset("", "\\X7F\\"))).toContain("<NTE.3>&#x7f;</NTE.3>");
    expect(why(() => flat(withCharset("ISO IR87", "\\X41\\")))).toBe(refusal);
    expect(why(() => flat(withCharset("8859/1", "\\X00\\")))).toBe(
      "FORBIDDEN_CHARACTER: A value holds a character XML 1.0 does not allow. (NTE.3)",
    );
    // A backslash, the escape character, which the reader refuses in text.
    expect(why(() => flat(withCharset("8859/1", "\\X5C\\")))).toBe(
      "ESCAPE_NOT_SUPPORTED: A value holds the message's escape character. (NTE.3)",
    );
  });

  it("refuses the five bytes Windows-1252 leaves undefined, rather than write a C1 control", () => {
    const refusal =
      "ESCAPE_NOT_SUPPORTED: A hex escape's bytes are not text in the message's character set. (NTE.3)";
    for (const byte of ["81", "8D", "8F", "90", "9D"]) {
      expect(why(() => flat(withCharset("WINDOWS-1252", `\\X${byte}\\`)))).toBe(refusal);
      expect(why(() => flat(withCharset("WINDOWS-1252", `\\X41${byte}42\\`)))).toBe(refusal);
    }
    // Their neighbours are defined, and stay character references.
    expect(flat(withCharset("WINDOWS-1252", "\\X8E9E9F\\"))).toContain(
      "<NTE.3>&#x17d;&#x17e;&#x178;</NTE.3>",
    );
    // In 8859/1 the same byte is a C1 control the set defines, and is still written.
    expect(flat(withCharset("8859/1", "\\X81\\"))).toContain("<NTE.3>&#x81;</NTE.3>");
  });

  it("refuses character set and vendor escapes, which v2 XML does not carry", () => {
    for (const seq of ["\\C2842\\", "\\M2442\\", "\\Zvendor\\", "\\X4\\", "\\ZX41\\", "\\X41Z\\"]) {
      expect(why(() => flat(adt(`NTE|||a${seq}b`), { "NTE.3": "FT" }))).toBe(
        "ESCAPE_NOT_SUPPORTED: A value carries a character set, vendor or unknown escape sequence. (NTE.3)",
      );
    }
  });

  it("writes a line break as a character reference in an untyped value beside a hex escape", () => {
    expect(flat(adt("NTE|||a\\.br\\b\\X41\\"))).toContain("<NTE.3>a&#10;b&#x41;</NTE.3>");
  });

  it("writes the truncation escape as the truncation character MSH-2 declares, else #", () => {
    const v27 = parseHL7("MSH|^~\\&!|||||||ADT^A01|X1|P|2.7\rNTE|||a\\P\\b\\H\\\r");
    expect(flat(v27, { "NTE.3": "FT" })).toContain('<NTE.3>a!b<escape V="H"/></NTE.3>');
    expect(flat(adt("NTE|||a\\P\\b\\H\\"), { "NTE.3": "FT" })).toContain(
      '<NTE.3>a#b<escape V="H"/></NTE.3>',
    );
  });

  it("refuses the escape character beside another escape", () => {
    expect(why(() => flat(adt("NTE|||a\\E\\b\\H\\"), { "NTE.3": "FT" }))).toBe(
      "ESCAPE_NOT_SUPPORTED: A value holds the message's escape character. (NTE.3)",
    );
  });

  it("refuses an escape the value leaves open", () => {
    expect(why(() => flat(adt("NTE|||a\\H\\b\\"), { "NTE.3": "FT" }))).toBe(
      "ESCAPE_NOT_SUPPORTED: A value holds the message's escape character. (NTE.3)",
    );
  });

  it("writes the delimiter escapes as the delimiters, beside another escape", () => {
    const msg = adt("NTE|||a\\F\\b\\S\\c\\T\\d\\R\\e\\H\\");
    expect(flat(msg, { "NTE.3": "FT" })).toContain('<NTE.3>a|b^c&amp;d~e<escape V="H"/></NTE.3>');
  });
});

describe("a composite keeps its component element", () => {
  it("writes section 2.6.2's one-component composite with its component element", () => {
    const msg = adt("OBX|1|ST|TST-11380");
    expect(flat(msg, { "OBX.3": "CWE" })).toContain(
      "<OBX><OBX.1>1</OBX.1><OBX.2>ST</OBX.2><OBX.3><CWE.1>TST-11380</CWE.1></OBX.3></OBX>",
    );
  });
});

describe("components are not named for a segment", () => {
  it("reads a component named for another segment as a refusal", () => {
    for (const name of ["OBX.1", "MSH.1", "ZPI.1", "ZP1.1"]) {
      expect(why(() => parseHL7Xml(adtDoc(`<PID><PID.5><${name}>a</${name}></PID.5></PID>`)))).toBe(
        `UNEXPECTED_ELEMENT: A component or subcomponent is named for a segment, not a data type. (${name})`,
      );
    }
    expect(
      why(() => parseHL7Xml(adtDoc("<PID><PID.5><XPN.1><NK1.1>a</NK1.1></XPN.1></PID.5></PID>"))),
    ).toBe(
      "UNEXPECTED_ELEMENT: A component or subcomponent is named for a segment, not a data type. (NK1.1)",
    );
  });

  it("refuses a component named for its own segment, a segment we do not know", () => {
    expect(why(() => parseHL7Xml(adtDoc("<QQQ><QQQ.1><QQQ.1>a</QQQ.1></QQQ.1></QQQ>")))).toBe(
      "UNEXPECTED_ELEMENT: A component or subcomponent is named for a segment, not a data type. (QQQ.1)",
    );
    expect(why(() => flat(adt("QQQ|a^b"), { "QQQ.1": "QQQ" }))).toBe(
      "INVALID_OPTIONS: A data type is named for a segment. (QQQ.1)",
    );
  });

  it("reads a data type whose name holds a Z-segment's shape but is not one", () => {
    const msg = parseHL7Xml(
      adtDoc("<PID><PID.5><XZAB.1>a</XZAB.1></PID.5><PID.6><ZABX.1>b</ZABX.1></PID.6></PID>"),
    );
    expect(msg.toString().split("\r")[1]).toBe("PID|||||a|b");
    expect(flat(adt("PID|||||a^b"), { "PID.5": "XZAB" })).toContain(
      "<PID.5><XZAB.1>a</XZAB.1><XZAB.2>b</XZAB.2></PID.5>",
    );
  });

  it("writes no data type named for another segment", () => {
    expect(why(() => flat(adt("PID|||a^b"), { "PID.3": "OBX" }))).toBe(
      "INVALID_OPTIONS: A data type is named for a segment. (PID.3)",
    );
    expect(why(() => flat(adt("PID|||a&b^c"), { "PID.3": "CX", "CX.1": "ZPI" }))).toBe(
      "INVALID_OPTIONS: A data type is named for a segment. (CX.1)",
    );
  });
});

describe("namespace prefixes", () => {
  it("reads elements whose prefix is bound to the v2 XML namespace", () => {
    const xml =
      '<v2:ADT_A01 xmlns:v2="urn:hl7-org:v2xml"><v2:MSH><v2:MSH.1>|</v2:MSH.1>' +
      "<v2:MSH.2>^~\\&amp;</v2:MSH.2><v2:MSH.9><v2:MSG.1>ADT</v2:MSG.1><v2:MSG.2>A01</v2:MSG.2>" +
      "</v2:MSH.9><v2:MSH.12>2.6</v2:MSH.12></v2:MSH>" +
      '<v2:ADT_A01.GROUP><v2:NTE><v2:NTE.3>a<v2:escape V="H"/></v2:NTE.3></v2:NTE></v2:ADT_A01.GROUP>' +
      '<NTE xmlns=""><NTE.3>b</NTE.3></NTE></v2:ADT_A01>';
    expect(parseHL7Xml(xml).toString()).toBe(
      "MSH|^~\\&|||||||ADT^A01|||2.6\rNTE|||a\\H\\\rNTE|||b\r",
    );
  });

  it("refuses a prefix bound to another namespace or to none", () => {
    const refused =
      "NAMESPACE_NOT_SUPPORTED: An element's namespace prefix is not bound to the v2 XML namespace.";
    expect(why(() => parseHL7Xml('<x:ACK xmlns:x="urn:other"/>'))).toBe(refused);
    expect(why(() => parseHL7Xml("<x:ACK/>"))).toBe(refused);
    expect(why(() => parseHL7Xml('<x:y:ACK xmlns:x="urn:hl7-org:v2xml"/>'))).toBe(refused);
    // A binding holds only inside the element that declares it.
    expect(
      why(() =>
        parseHL7Xml(
          '<ADT_A01><MSH xmlns:x="urn:hl7-org:v2xml"><MSH.1>|</MSH.1><MSH.2>^~\\&amp;</MSH.2></MSH><x:NTE/></ADT_A01>',
        ),
      ),
    ).toBe(refused);
  });

  it("reads a prefix where it is declared, at any depth, and only from xmlns attributes", () => {
    const msh = (inner: string, attribute = ""): string =>
      `<ADT_A01${attribute}><MSH><MSH.1>|</MSH.1><MSH.2>^~\\&amp;</MSH.2>${inner}</MSH></ADT_A01>`;
    expect(
      parseHL7Xml(
        msh('<MSH.9 xmlns:x="urn:hl7-org:v2xml"><x:MSG.1>ADT</x:MSG.1><MSG.2>A01</MSG.2></MSH.9>'),
      ).toString(),
    ).toBe("MSH|^~\\&|||||||ADT^A01\r");
    expect(why(() => parseHL7Xml(msh("<x:MSH.9/>", ' foobarx="urn:hl7-org:v2xml"')))).toBe(
      "NAMESPACE_NOT_SUPPORTED: An element's namespace prefix is not bound to the v2 XML namespace.",
    );
  });

  it("refuses an end tag whose prefix differs from its start tag", () => {
    expect(why(() => parseHL7Xml('<v2:ACK xmlns:v2="urn:hl7-org:v2xml"></ACK>'))).toBe(
      "NOT_WELL_FORMED: An end tag does not match its start tag.",
    );
  });
});
