/**
 * The HL7 v2 XML encoding: `parseHL7Xml` reads a message into the model `parseHL7` builds for the
 * same message in the pipe-delimited encoding, `toHl7Xml` writes it back, and both refuse, with a
 * coded `Hl7XmlError`, a hostile document and every case whose encoding rule we have not
 * confirmed. Every fixture is synthetic (see `test/fixtures/xml/README.md`).
 */

import { Buffer } from "node:buffer";
import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import {
  Hl7Message,
  Hl7XmlError,
  XML_ERROR_CODES,
  parseHL7,
  parseHL7Xml,
  toHl7Xml,
  xmlDataTypes,
  type XmlErrorCode,
} from "../src/index.js";
import type { RawField } from "../src/index.js";
import { forbiddenCharacterAt } from "../src/xml/chars.js";

const FIXTURES = join(import.meta.dirname, "fixtures", "xml");

/** A fixture's text. */
function fixture(name: string): string {
  return readFileSync(join(FIXTURES, name), "utf8");
}

/** The code `call` throws as an `Hl7XmlError`; fails the test if it throws nothing or another error. */
function refusal(call: () => unknown): XmlErrorCode {
  try {
    call();
  } catch (error) {
    expect(error).toBeInstanceOf(Hl7XmlError);
    const e = error as Hl7XmlError;
    // Every refusal says why in words, apart from the path it may name.
    expect(e.path === undefined ? e.message : e.message.slice(0, -(e.path.length + 3))).toMatch(
      /^[A-Z][A-Za-z0-9.]* .+\.$/u,
    );
    expect(e.message.endsWith(e.path === undefined ? "." : ` (${e.path})`)).toBe(true);
    return e.code;
  }
  throw new Error("expected an Hl7XmlError, got none");
}

/** An MSH opening with the standard delimiters, for small documents. */
const MSH =
  "<MSH><MSH.1>|</MSH.1><MSH.2>^~\\&amp;</MSH.2><MSH.9><MSG.1>ADT</MSG.1><MSG.2>A01</MSG.2></MSH.9>" +
  "<MSH.10>X1</MSH.10><MSH.11>P</MSH.11><MSH.12>2.6</MSH.12></MSH>";

/** A one-message document: the MSH above, then `body`, in an `ADT_A01` root. */
function doc(body: string, root = "ADT_A01"): string {
  return `<${root}>${MSH}${body}</${root}>`;
}

/** The pipe text of `doc(body)`. */
const PIPE_MSH = "MSH|^~\\&|||||||ADT^A01|X1|P|2.6\r";

describe("parseHL7Xml reads the model parseHL7 builds", () => {
  const cases = [
    ["oru-r01-v25", "2.5"],
    ["oru-r01-v26-grouped", "2.6"],
    ["adt-a01-v27", "2.7"],
  ] as const;

  for (const [name, version] of cases) {
    it(`reads ${name} (v${version}) as its pipe-delimited twin`, () => {
      const pipe = fixture(`${name}.hl7`);
      const fromXml = parseHL7Xml(fixture(`${name}.xml`));
      const fromPipe = parseHL7(pipe);
      expect(fromXml.version).toBe(version);
      expect(fromXml.toString()).toBe(pipe);
      expect(fromXml.rawSegments).toEqual(fromPipe.rawSegments);
      expect(fromXml.encodingCharacters).toEqual(fromPipe.encodingCharacters);
      expect(fromXml.warnings).toEqual(fromPipe.warnings);
    });
  }

  it("keeps repetitions, the explicit null, delimiters in text and line breaks", () => {
    const msg = parseHL7Xml(fixture("oru-r01-v26-grouped.xml"));
    const pid = msg.part("PID");
    expect(pid?.field(3).repetitions.map((r) => r.components[0]?.subcomponents[0])).toEqual([
      "FAKE76704346",
      "SYN-0001",
    ]);
    expect(msg.rawSegments[1]?.fields[13]?.isNull).toBe(true);
    const notes = msg.segments("NTE").map((nte) => nte.field(3).value);
    expect(notes).toEqual([
      "Sample A|B ^ hemolysed & retested ~ see note <ok>",
      "Line one\nLine two",
    ]);
  });

  it("reads the truncation character a five-character MSH.2 declares", () => {
    const msg = parseHL7Xml(fixture("adt-a01-v27.xml"));
    expect(msg.encodingCharacters.truncation).toBe("#");
    expect(msg.part("NTE")?.field(3).value).toBe("Room #4 ok");
  });

  it("passes parseHL7's options through", () => {
    const xml = fixture("oru-r01-v25.xml");
    const eager = parseHL7Xml(xml, { lazy: false });
    expect(eager.rawSegments).toEqual(parseHL7Xml(xml).rawSegments);
    const seen: string[] = [];
    parseHL7Xml(doc("<ZZZ><ZZZ.1>a</ZZZ.1></ZZZ>"), { onWarning: (w) => seen.push(w.code) });
    expect(seen).toEqual(parseHL7(`${PIPE_MSH}ZZZ|a\r`).warnings.map((w) => w.code));
  });

  it("reads a document with no namespace, a BOM, an XML declaration and attributes", () => {
    const xml = `${String.fromCharCode(0xfeff)}<?xml version="1.0"?><ADT_A01 xmlns="" note='x'>${MSH}<EVN Type="x"><EVN.2>1</EVN.2></EVN></ADT_A01>`;
    expect(parseHL7Xml(xml).toString()).toBe(`${PIPE_MSH}EVN||1\r`);
  });

  it("writes an empty element as an empty position and keeps empty repetitions", () => {
    const xml = doc("<NTE/><NK1><NK1.2/><NK1.3>a</NK1.3><NK1.3/><NK1.3>b</NK1.3></NK1>");
    expect(parseHL7Xml(xml).toString()).toBe(`${PIPE_MSH}NTE\rNK1|||a~~b\r`);
  });

  it("reads a component written as text or as subcomponent elements", () => {
    const xml = doc(
      "<PID><PID.3><CX.1>1</CX.1><CX.4><HD.1>A</HD.1><HD.3>ISO</HD.3></CX.4></PID.3></PID>",
    );
    expect(parseHL7Xml(xml).toString()).toBe(`${PIPE_MSH}PID|||1^^^A&&ISO\r`);
  });

  it("reads literal carriage returns as XML does, and a character reference to one as itself", () => {
    const xml = doc("<NTE><NTE.3>a\r\nb\rc&#13;d</NTE.3></NTE>");
    expect(parseHL7Xml(xml).part("NTE")?.field(3).value).toBe("a\nb\nc\rd");
  });
});

describe("toHl7Xml writes v2 XML", () => {
  it("writes the 2.5 fixture byte for byte with the data types it names", () => {
    const xml = fixture("oru-r01-v25.xml");
    const dataTypes = xmlDataTypes(xml);
    expect(dataTypes["PID.5"]).toBe("XPN");
    expect(dataTypes["XPN.1"]).toBe("FN");
    expect(toHl7Xml(parseHL7(fixture("oru-r01-v25.hl7")), { dataTypes })).toBe(xml);
  });

  it("writes the grouped 2.6 fixture back to the same model, without groups", () => {
    const xml = fixture("oru-r01-v26-grouped.xml");
    const msg = parseHL7Xml(xml);
    const written = toHl7Xml(msg, { dataTypes: xmlDataTypes(xml) });
    expect(written).not.toContain("ORU_R01.PATIENT_RESULT");
    expect(written).toContain('<PID.13>""</PID.13>');
    expect(written).toContain("Line one&#10;Line two");
    expect(parseHL7Xml(written).rawSegments).toEqual(msg.rawSegments);
  });

  it("writes MSH.2 with the truncation character and a value holding it", () => {
    const xml = fixture("adt-a01-v27.xml");
    expect(toHl7Xml(parseHL7(fixture("adt-a01-v27.hl7")), { dataTypes: xmlDataTypes(xml) })).toBe(
      xml,
    );
  });

  it("names the root from MSH-9, or from the structure option, with or without a namespace", () => {
    const pipe = "MSH|^~\\&|||||||ACK^A01|1|P|2.6\rMSA|AA|1\r";
    const dataTypes = { "MSH.9": "MSG" };
    expect(toHl7Xml(parseHL7(pipe), { dataTypes })).toContain(
      '<ACK_A01 xmlns="urn:hl7-org:v2xml">',
    );
    expect(toHl7Xml(parseHL7("MSH|^~\\&|||||||ACK|1|P|2.6\r"))).toContain("<ACK xmlns=");
    const bare = toHl7Xml(parseHL7(pipe), { dataTypes, structure: "ACK", namespace: null });
    expect(bare).toContain("<ACK>\n");
    expect(bare.endsWith("</ACK>\n")).toBe(true);
    expect(parseHL7Xml(bare).toString()).toBe(pipe);
  });

  it("writes a field as text when it holds one value and no data type is given", () => {
    const msg = parseHL7(`${PIPE_MSH}PID|1||A~B||""\rNTE\r`);
    const xml = toHl7Xml(msg, { dataTypes: { "MSH.9": "MSG" } });
    expect(xml).toContain(
      '<PID><PID.1>1</PID.1><PID.3>A</PID.3><PID.3>B</PID.3><PID.5>""</PID.5></PID>',
    );
    expect(xml).toContain("<NTE/>");
  });

  it("takes the data types as a function", () => {
    const msg = parseHL7(`${PIPE_MSH}PID|||1^^^A&&ISO\r`);
    const xml = toHl7Xml(msg, {
      dataTypes: (key) => ({ "MSH.9": "MSG", "PID.3": "CX", "CX.4": "HD" })[key],
    });
    expect(xml).toContain(
      "<PID.3><CX.1>1</CX.1><CX.4><HD.1>A</HD.1><HD.3>ISO</HD.3></CX.4></PID.3>",
    );
  });

  it("escapes the XML characters and writes line breaks as character references", () => {
    const msg = parseHL7(`${PIPE_MSH}NTE|||a<b>\\T\\c\\.br\\d\\X0D\\e\r`);
    const xml = toHl7Xml(msg, { dataTypes: { "MSH.9": "MSG" } });
    expect(xml).toContain("<NTE.3>a&lt;b&gt;&amp;c&#10;d&#13;e</NTE.3>");
    expect(parseHL7Xml(xml).rawSegments).toEqual(msg.rawSegments);
  });
});

describe("the reader is hardened", () => {
  const cases: readonly (readonly [string, string, XmlErrorCode])[] = [
    ["a DOCTYPE", `<!DOCTYPE ADT_A01 [<!ENTITY x "y">]>${doc("")}`, "DTD_NOT_ALLOWED"],
    [
      "an ENTITY declaration",
      `<!ENTITY x SYSTEM "file:///etc/hosts">${doc("")}`,
      "DTD_NOT_ALLOWED",
    ],
    ["an entity reference", doc("<NTE><NTE.3>&xxe;</NTE.3></NTE>"), "ENTITY_NOT_ALLOWED"],
    ["a forbidden character", doc("<NTE><NTE.3>a\u0001</NTE.3></NTE>"), "FORBIDDEN_CHARACTER"],
    [
      "a reference to a forbidden character",
      doc("<NTE><NTE.3>&#1;</NTE.3></NTE>"),
      "FORBIDDEN_CHARACTER",
    ],
    ["an unpaired surrogate", doc("<NTE><NTE.3>\uD800</NTE.3></NTE>"), "FORBIDDEN_CHARACTER"],
    ["a bare ampersand", doc("<NTE><NTE.3>a & b</NTE.3></NTE>"), "NOT_WELL_FORMED"],
    ["a malformed reference", doc("<NTE><NTE.3>&#xZZ;</NTE.3></NTE>"), "NOT_WELL_FORMED"],
    ["a mismatched end tag", doc("<NTE><NTE.3>a</NTE.4></NTE>"), "NOT_WELL_FORMED"],
    ["an unclosed element", `<ADT_A01>${MSH}`, "NOT_WELL_FORMED"],
    ["two root elements", `${doc("")}<ADT_A01/>`, "NOT_WELL_FORMED"],
    ["text outside the root", `${doc("")}x`, "NOT_WELL_FORMED"],
    ["no root at all", "<!-- nothing -->", "NOT_WELL_FORMED"],
    ["an unterminated comment", `${doc("")}<!-- x`, "NOT_WELL_FORMED"],
    [
      "an unterminated CDATA section",
      doc("<NTE><NTE.3><![CDATA[a</NTE.3></NTE>"),
      "NOT_WELL_FORMED",
    ],
    ["an unterminated instruction", "<?xml version='1.0'", "NOT_WELL_FORMED"],
    ["another declaration", `<!ELEMENT x ANY>${doc("")}`, "NOT_WELL_FORMED"],
    ["an unquoted attribute", `<ADT_A01 a=b>${MSH}</ADT_A01>`, "NOT_WELL_FORMED"],
    ["an attribute with no value", `<ADT_A01 a>${MSH}</ADT_A01>`, "NOT_WELL_FORMED"],
    ["an unterminated attribute", `<ADT_A01 a="b>${MSH}</ADT_A01>`, "NOT_WELL_FORMED"],
    ["a '<' in an attribute", `<ADT_A01 a="<">${MSH}</ADT_A01>`, "NOT_WELL_FORMED"],
    ["attributes run together", `<ADT_A01 a="1"b="2">${MSH}</ADT_A01>`, "NOT_WELL_FORMED"],
    ["an unclosed end tag", `<ADT_A01>${MSH}</ADT_A01`, "NOT_WELL_FORMED"],
    ["a tag with no name", `<ADT_A01>${MSH}< /></ADT_A01>`, "NOT_WELL_FORMED"],
    [
      "a namespace prefix",
      `<v2:ADT_A01 xmlns:v2="urn:hl7-org:v2xml">${MSH}</v2:ADT_A01>`,
      "NAMESPACE_NOT_SUPPORTED",
    ],
    [
      "a foreign default namespace",
      `<ADT_A01 xmlns="urn:example">${MSH}</ADT_A01>`,
      "NAMESPACE_NOT_SUPPORTED",
    ],
  ];

  for (const [what, xml, code] of cases) {
    it(`refuses ${what} with ${code}`, () => {
      expect(refusal(() => parseHL7Xml(xml))).toBe(code);
    });
  }

  it("refuses the noncharacters U+FFFE and U+FFFF", () => {
    for (const code of [0xfffe, 0xffff]) {
      const xml = doc(`<NTE><NTE.3>a${String.fromCharCode(code)}</NTE.3></NTE>`);
      expect(refusal(() => parseHL7Xml(xml))).toBe("FORBIDDEN_CHARACTER");
      const msg = parseHL7(`${PIPE_MSH}NTE|||a${String.fromCharCode(code)}\r`);
      expect(refusal(() => toHl7Xml(msg, { dataTypes: { "MSH.9": "MSG" } }))).toBe(
        "FORBIDDEN_CHARACTER",
      );
    }
  });

  it("refuses a document over the size limit", () => {
    const xml = doc("");
    expect(refusal(() => parseHL7Xml(xml, { limits: { maxInputBytes: 10 } }))).toBe(
      "INPUT_TOO_LARGE",
    );
    expect(refusal(() => parseHL7Xml("é".repeat(40), { limits: { maxInputBytes: 70 } }))).toBe(
      "INPUT_TOO_LARGE",
    );
    expect(parseHL7Xml(xml, { limits: { maxInputBytes: xml.length } }).version).toBe("2.6");
  });

  it("refuses nesting past the depth limit", () => {
    const nested = `<ADT_A01>${MSH}${"<G.A>".repeat(70)}${"</G.A>".repeat(70)}</ADT_A01>`;
    expect(refusal(() => parseHL7Xml(nested))).toBe("DEPTH_LIMIT_EXCEEDED");
    expect(refusal(() => parseHL7Xml(doc(""), { limits: { maxDepth: 2 } }))).toBe(
      "DEPTH_LIMIT_EXCEEDED",
    );
    expect(parseHL7Xml(doc(""), { limits: { maxDepth: 4 } }).version).toBe("2.6");
  });

  it("refuses more elements than the limit, an empty position counted as one", () => {
    expect(refusal(() => parseHL7Xml(doc(""), { limits: { maxElements: 5 } }))).toBe(
      "ELEMENT_LIMIT_EXCEEDED",
    );
    const gap = doc("<NTE><NTE.999>a</NTE.999></NTE>");
    expect(refusal(() => parseHL7Xml(gap, { limits: { maxElements: 500 } }))).toBe(
      "ELEMENT_LIMIT_EXCEEDED",
    );
    const componentGap = doc("<NTE><NTE.1><X.999>a</X.999></NTE.1></NTE>");
    expect(refusal(() => parseHL7Xml(componentGap, { limits: { maxElements: 500 } }))).toBe(
      "ELEMENT_LIMIT_EXCEEDED",
    );
    expect(parseHL7Xml(gap).part("NTE")?.field(999).value).toBe("a");
  });

  it("keeps the document's text out of the error", () => {
    try {
      parseHL7Xml(doc("<NTE><NTE.3>Doe\\Jane</NTE.3></NTE>"));
      expect.unreachable();
    } catch (error) {
      const e = error as Hl7XmlError;
      expect(e.code).toBe("ESCAPE_NOT_SUPPORTED");
      expect(e.path).toBe("NTE.3");
      expect(typeof e.offset).toBe("number");
      expect(e.message).not.toContain("Doe");
    }
    try {
      parseHL7Xml(doc("<NTE><Jane.Doe>x</Jane.Doe></NTE>"));
      expect.unreachable();
    } catch (error) {
      expect((error as Hl7XmlError).path).toBeUndefined();
      expect((error as Hl7XmlError).message).not.toContain("Jane");
    }
  });
});

describe("the reader refuses what is not the v2 XML shape", () => {
  const cases: readonly (readonly [string, string, XmlErrorCode])[] = [
    ["a first segment other than MSH", "<ADT_A01><EVN/></ADT_A01>", "INVALID_ENCODING_CHARACTERS"],
    ["a root with no segment", "<ADT_A01/>", "INVALID_ENCODING_CHARACTERS"],
    ["an MSH with no MSH.2", "<A><MSH><MSH.1>|</MSH.1></MSH></A>", "INVALID_ENCODING_CHARACTERS"],
    [
      "an MSH that opens with MSH.3",
      "<A><MSH><MSH.3>x</MSH.3></MSH></A>",
      "INVALID_ENCODING_CHARACTERS",
    ],
    [
      "MSH.1 twice",
      "<A><MSH><MSH.1>|</MSH.1><MSH.1>|</MSH.1></MSH></A>",
      "INVALID_ENCODING_CHARACTERS",
    ],
    [
      "MSH.2 twice",
      "<A><MSH><MSH.1>|</MSH.1><MSH.2>^~\\&amp;</MSH.2><MSH.2>x</MSH.2></MSH></A>",
      "INVALID_ENCODING_CHARACTERS",
    ],
    [
      "an MSH.1 of two characters",
      "<A><MSH><MSH.1>||</MSH.1><MSH.2>^~\\&amp;</MSH.2></MSH></A>",
      "INVALID_ENCODING_CHARACTERS",
    ],
    [
      "an MSH.2 of three characters",
      "<A><MSH><MSH.1>|</MSH.1><MSH.2>^~\\</MSH.2></MSH></A>",
      "INVALID_ENCODING_CHARACTERS",
    ],
    [
      "an MSH.2 with components",
      "<A><MSH><MSH.1>|</MSH.1><MSH.2><X.1>^</X.1></MSH.2></MSH></A>",
      "INVALID_ENCODING_CHARACTERS",
    ],
    ["an element that is no segment or group", doc("<Patient/>"), "UNEXPECTED_ELEMENT"],
    ["a field of another segment", doc("<PID><PV1.1>x</PV1.1></PID>"), "UNEXPECTED_ELEMENT"],
    ["a field at position 0", doc("<PID><PID.0>x</PID.0></PID>"), "UNEXPECTED_ELEMENT"],
    ["a field past position 999", doc("<PID><PID.1000>x</PID.1000></PID>"), "UNEXPECTED_ELEMENT"],
    [
      "a component with no position",
      doc("<PID><PID.5><family>x</family></PID.5></PID>"),
      "UNEXPECTED_ELEMENT",
    ],
    [
      "a subcomponent with no position",
      doc("<PID><PID.5><XPN.1><a>x</a></XPN.1></PID.5></PID>"),
      "UNEXPECTED_ELEMENT",
    ],
    [
      "an element below a subcomponent",
      doc("<PID><PID.5><XPN.1><FN.1><X.1>x</X.1></FN.1></XPN.1></PID.5></PID>"),
      "UNEXPECTED_ELEMENT",
    ],
    ["text between segments", doc("x<EVN/>"), "MIXED_CONTENT"],
    ["text in a segment", doc("<EVN>x</EVN>"), "MIXED_CONTENT"],
    [
      "text before a component",
      doc("<PID><PID.5>x<XPN.1>y</XPN.1></PID.5></PID>"),
      "MIXED_CONTENT",
    ],
    ["text after a component", doc("<PID><PID.5><XPN.1>y</XPN.1>x</PID.5></PID>"), "MIXED_CONTENT"],
    [
      "text after a subcomponent",
      doc("<PID><PID.5><XPN.1><FN.1>y</FN.1>x</XPN.1></PID.5></PID>"),
      "MIXED_CONTENT",
    ],
    ["a field out of order", doc("<PID><PID.5>a</PID.5><PID.3>b</PID.3></PID>"), "OUT_OF_ORDER"],
    [
      "a repeated component",
      doc("<PID><PID.5><XPN.1>a</XPN.1><XPN.1>b</XPN.1></PID.5></PID>"),
      "OUT_OF_ORDER",
    ],
    [
      "a component out of order",
      doc("<PID><PID.5><XPN.2>a</XPN.2><XPN.1>b</XPN.1></PID.5></PID>"),
      "OUT_OF_ORDER",
    ],
  ];

  for (const [what, xml, code] of cases) {
    it(`refuses ${what} with ${code}`, () => {
      expect(refusal(() => parseHL7Xml(xml))).toBe(code);
    });
  }
});

describe("the cases whose encoding rule we have not confirmed are refused", () => {
  const reads: readonly (readonly [string, string])[] = [
    ["an escape element in a field", doc('<NTE><NTE.3>a<escape V=".br"/>b</NTE.3></NTE>')],
    [
      "an escape element in a component",
      doc('<NTE><NTE.3><FT.1>a<escape V="H"/></FT.1></NTE.3></NTE>'),
    ],
    [
      "an escape element in a subcomponent",
      doc('<PID><PID.5><XPN.1><FN.1><escape V="N"/></FN.1></XPN.1></PID.5></PID>'),
    ],
    ["the escape character in a field", doc("<NTE><NTE.3>a\\.br\\b</NTE.3></NTE>")],
    [
      "the escape character in a component",
      doc("<PID><PID.5><XPN.1>a\\F\\b</XPN.1></PID.5></PID>"),
    ],
    [
      "the escape character in a subcomponent",
      doc("<PID><PID.5><XPN.1><FN.1>\\</FN.1></XPN.1></PID.5></PID>"),
    ],
  ];

  for (const [what, xml] of reads) {
    it(`reading refuses ${what}`, () => {
      expect(refusal(() => parseHL7Xml(xml))).toBe("ESCAPE_NOT_SUPPORTED");
    });
  }

  const writes: readonly (readonly [string, string])[] = [
    ["a literal escape character", "NTE|||a\\E\\b"],
    ["a highlighting escape", "NTE|||a\\H\\b\\N\\"],
    ["a hex escape", "NTE|||a\\X41\\"],
    ["a formatting escape other than a line break", "NTE|||a\\.sp\\b"],
  ];

  for (const [what, segment] of writes) {
    it(`writing refuses ${what}`, () => {
      const msg = parseHL7(`${PIPE_MSH}${segment}\r`);
      expect(refusal(() => toHl7Xml(msg, { dataTypes: { "MSH.9": "MSG" } }))).toBe(
        "ESCAPE_NOT_SUPPORTED",
      );
    });
  }

  it("writing refuses a composite field or component whose data type it was not given", () => {
    const msg = parseHL7(`${PIPE_MSH}PID|||1^^^A&&ISO\r`);
    expect(refusal(() => toHl7Xml(msg))).toBe("DATA_TYPE_UNKNOWN");
    expect(refusal(() => toHl7Xml(msg, { dataTypes: { "MSH.9": "MSG" } }))).toBe(
      "DATA_TYPE_UNKNOWN",
    );
    expect(refusal(() => toHl7Xml(msg, { dataTypes: { "MSH.9": "MSG", "PID.3": "CX" } }))).toBe(
      "DATA_TYPE_UNKNOWN",
    );
    const second = parseHL7(`${PIPE_MSH}PID|||^b\r`);
    expect(refusal(() => toHl7Xml(second, { dataTypes: { "MSH.9": "MSG" } }))).toBe(
      "DATA_TYPE_UNKNOWN",
    );
  });
});

describe("the writer's other refusals", () => {
  it("refuses a message with no structure to name the root", () => {
    expect(refusal(() => toHl7Xml(parseHL7("MSH|^~\\&|||||||||P|2.6\r")))).toBe(
      "STRUCTURE_UNKNOWN",
    );
  });

  it("refuses a data type or structure that is not an XML name", () => {
    const msg = parseHL7(`${PIPE_MSH}PID|||1^2\r`);
    expect(refusal(() => toHl7Xml(msg, { dataTypes: { "MSH.9": "MSG", "PID.3": "C X" } }))).toBe(
      "INVALID_OPTIONS",
    );
    expect(refusal(() => toHl7Xml(msg, { structure: "<x>" }))).toBe("INVALID_OPTIONS");
  });

  it("refuses a character XML cannot carry and a segment name that is not an element name", () => {
    const control = parseHL7(`${PIPE_MSH}NTE|||a\u0001b\r`);
    expect(refusal(() => toHl7Xml(control, { dataTypes: { "MSH.9": "MSG" } }))).toBe(
      "FORBIDDEN_CHARACTER",
    );
    const base = parseHL7(PIPE_MSH);
    const odd = new Hl7Message({
      segments: [...base.rawSegments, { name: "Z-1", fields: [] }],
      encodingCharacters: base.encodingCharacters,
      version: "2.6",
      warnings: [],
    });
    expect(refusal(() => toHl7Xml(odd, { dataTypes: { "MSH.9": "MSG" } }))).toBe(
      "UNEXPECTED_ELEMENT",
    );
  });
});

describe("the edges of the reader and writer", () => {
  it("finds the first forbidden character, whichever kind comes first", () => {
    const nonCharacter = String.fromCharCode(0xfffe);
    expect(forbiddenCharacterAt(`ab\u0001c${nonCharacter}`)).toBe(2);
    expect(forbiddenCharacterAt(`a${nonCharacter}b\u0001`)).toBe(1);
    expect(forbiddenCharacterAt("plain text")).toBe(-1);
  });

  it("reads character references across the ranges XML allows, and refuses the rest", () => {
    const read = (ref: string): string | undefined =>
      parseHL7Xml(doc(`<NTE><NTE.3>${ref}</NTE.3></NTE>`))
        .part("NTE")
        ?.field(3).value;
    expect(read("&#x41;&#9;&#66;")).toBe("A\tB");
    expect(read("&#xE000;")).toBe(String.fromCharCode(0xe000));
    expect(read("&#x1F600;")).toBe(String.fromCodePoint(0x1f600));
    for (const ref of ["&#xFFFE;", "&#xD800;", "&#x110000;", "&#0;"]) {
      expect(refusal(() => read(ref))).toBe("FORBIDDEN_CHARACTER");
    }
  });

  it("writes nothing for a field the tree leaves out or holds only empty components", () => {
    const base = parseHL7(`${PIPE_MSH}PID|||^\r`);
    expect(toHl7Xml(base, { dataTypes: { "MSH.9": "MSG" } })).toContain("<PID/>");
    const value: RawField = {
      isNull: false,
      repetitions: [{ components: [{ subcomponents: ["a"] }] }],
    };
    const sparse = new Hl7Message({
      segments: [
        ...base.rawSegments.slice(0, 1),
        { name: "NTE", fields: [value, undefined, value] as unknown as RawField[] },
      ],
      encodingCharacters: base.encodingCharacters,
      version: "2.6",
      warnings: [],
    });
    expect(toHl7Xml(sparse, { dataTypes: { "MSH.9": "MSG" } })).toContain(
      "<NTE><NTE.2>a</NTE.2></NTE>",
    );
  });

  it("writes an empty repetition between two values, typed or not", () => {
    const msg = parseHL7(`${PIPE_MSH}NK1|||a~~b^c\r`);
    const xml = toHl7Xml(msg, { dataTypes: { "MSH.9": "MSG", "NK1.3": "XPN" } });
    expect(xml).toContain(
      "<NK1.3><XPN.1>a</XPN.1></NK1.3><NK1.3/><NK1.3><XPN.1>b</XPN.1><XPN.2>c</XPN.2></NK1.3>",
    );
    const plain = parseHL7(`${PIPE_MSH}NK1|||a~~b\r`);
    const untyped = toHl7Xml(plain, { dataTypes: { "MSH.9": "MSG" } });
    expect(untyped).toContain("<NK1.3>a</NK1.3><NK1.3/><NK1.3>b</NK1.3>");
    expect(parseHL7Xml(untyped).rawSegments).toEqual(plain.rawSegments);
  });

  it("refuses to name the root of a message that does not open with MSH", () => {
    const base = parseHL7(PIPE_MSH);
    const headless = new Hl7Message({
      segments: [],
      encodingCharacters: base.encodingCharacters,
      version: "2.6",
      warnings: [],
    });
    expect(refusal(() => toHl7Xml(headless))).toBe("STRUCTURE_UNKNOWN");
    expect(toHl7Xml(headless, { structure: "ADT_A01" })).toBe(
      '<?xml version="1.0" encoding="UTF-8"?>\n<ADT_A01 xmlns="urn:hl7-org:v2xml">\n</ADT_A01>\n',
    );
  });
});

describe("the reader's counts and tokens, exactly", () => {
  // `doc("")` holds 10 elements (the root, MSH and its eight fields and components) and leaves
  // MSH.3 to MSH.8 empty: 16 counted in all.
  it("counts every element and every empty position a later one skips", () => {
    const limit = (xml: string, maxElements: number): unknown =>
      parseHL7Xml(xml, { limits: { maxElements } }).version;
    expect(limit(doc(""), 16)).toBe("2.6");
    expect(refusal(() => limit(doc(""), 15))).toBe("ELEMENT_LIMIT_EXCEEDED");
    const field = doc("<NTE><NTE.5>a</NTE.5></NTE>");
    expect(limit(field, 22)).toBe("2.6");
    expect(refusal(() => limit(field, 21))).toBe("ELEMENT_LIMIT_EXCEEDED");
    const component = doc("<NTE><NTE.1><X.3>a</X.3></NTE.1></NTE>");
    expect(limit(component, 21)).toBe("2.6");
    expect(refusal(() => limit(component, 20))).toBe("ELEMENT_LIMIT_EXCEEDED");
    const repeated = doc("<NTE><NTE.1>a</NTE.1><NTE.1>b</NTE.1></NTE>");
    expect(limit(repeated, 19)).toBe("2.6");
    expect(refusal(() => limit(repeated, 18))).toBe("ELEMENT_LIMIT_EXCEEDED");
  });

  it("allows exactly maxDepth levels and the byte limit exactly", () => {
    const deep = doc("<PID><PID.5><XPN.1><FN.1>a</FN.1></XPN.1></PID.5></PID>");
    expect(parseHL7Xml(deep, { limits: { maxDepth: 5 } }).version).toBe("2.6");
    expect(refusal(() => parseHL7Xml(deep, { limits: { maxDepth: 4 } }))).toBe(
      "DEPTH_LIMIT_EXCEEDED",
    );
    const bytes = Buffer.byteLength(deep, "utf8");
    expect(parseHL7Xml(deep, { limits: { maxInputBytes: bytes } }).version).toBe("2.6");
    expect(refusal(() => parseHL7Xml(deep, { limits: { maxInputBytes: bytes - 1 } }))).toBe(
      "INPUT_TOO_LARGE",
    );
  });

  it("reads tags spread over whitespace of every kind, and quotes of either kind", () => {
    const xml = `<ADT_A01\n\txmlns = 'urn:hl7-org:v2xml'\r\n>${MSH}<EVN\ta="1"\rb='2'\n/><NTE\n><NTE.3\t>x</NTE.3\r\n></NTE ></ADT_A01\n>`;
    expect(parseHL7Xml(xml).toString()).toBe(`${PIPE_MSH}EVN\rNTE|||x\r`);
  });

  it("refuses a tag the document ends inside", () => {
    for (const tail of ["<EVN", "<EVN a", "<EVN a=", '<EVN a="1"', "</EVN", "<"]) {
      expect(refusal(() => parseHL7Xml(`<ADT_A01>${MSH}${tail}`))).toBe("NOT_WELL_FORMED");
    }
  });

  it("refuses a name that runs into another tag", () => {
    expect(refusal(() => parseHL7Xml(`<ADT_A01>${MSH}<EVN<NTE/></ADT_A01>`))).toBe(
      "NOT_WELL_FORMED",
    );
  });

  it("joins text split by comments, instructions and CDATA within one value", () => {
    const xml = doc("<NTE><NTE.3>a<!-- note -->b<?pi x?>c<![CDATA[d\r\ne]]>f</NTE.3></NTE>");
    expect(parseHL7Xml(xml).part("NTE")?.field(3).value).toBe("abcd\nef");
  });

  it("keeps whitespace that is a value, and drops whitespace between elements", () => {
    const xml = doc("<NTE>\n  <NTE.3> </NTE.3>\n  <NTE.4>\n    <X.1>a</X.1>\n  </NTE.4>\n</NTE>");
    expect(parseHL7Xml(xml).toString()).toBe(`${PIPE_MSH}NTE||| |a\r`);
  });
});

describe("xmlDataTypes", () => {
  it("leaves out a key the document names two ways", () => {
    const xml = doc(
      "<OBX><OBX.5><CWE.1>a</CWE.1></OBX.5></OBX><OBX><OBX.5><SN.1>&gt;</SN.1><SN.2>5</SN.2></OBX.5></OBX><OBX><OBX.5><CWE.1>b</CWE.1></OBX.5></OBX>",
    );
    expect(xmlDataTypes(xml)).toEqual({ "MSH.9": "MSG" });
  });

  it("refuses what parseHL7Xml refuses", () => {
    expect(refusal(() => xmlDataTypes("<!DOCTYPE x><x/>"))).toBe("DTD_NOT_ALLOWED");
    expect(refusal(() => xmlDataTypes(doc(""), { limits: { maxElements: 3 } }))).toBe(
      "ELEMENT_LIMIT_EXCEEDED",
    );
  });
});

describe("the error registry", () => {
  it("names each code by itself", () => {
    for (const [key, value] of Object.entries(XML_ERROR_CODES)) expect(key).toBe(value);
  });

  it("names its error Hl7XmlError, as a log or a stack trace shows it", () => {
    let caught: unknown;
    try {
      parseHL7Xml("<!DOCTYPE x><x/>");
    } catch (error) {
      caught = error;
    }
    expect(caught).toBeInstanceOf(Hl7XmlError);
    expect((caught as Hl7XmlError).name).toBe("Hl7XmlError");
    expect(String(caught)).toMatch(/^Hl7XmlError: /u);
  });
});
