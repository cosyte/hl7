/**
 * Each refusal of the v2 XML reader and writer, by its exact code and words, and the edges of
 * what each accepts: so a check that stops firing, or another that fires in its place, fails
 * here even when both would refuse with the same code. Every value is synthetic.
 */

import { describe, expect, it } from "vitest";

import {
  DEFAULT_XML_LIMITS,
  Hl7Message,
  Hl7ParseError,
  Hl7XmlError,
  V2_XML_NAMESPACE,
  parseHL7,
  parseHL7Xml,
  toHl7Xml,
  xmlDataTypes,
} from "../src/index.js";
import type { RawField, RawSegment } from "../src/index.js";
import { xmlToPipe } from "../src/xml/read.js";

/** An MSH opening with the standard delimiters: 10 elements, MSH.3 to MSH.8 empty. */
const MSH =
  "<MSH><MSH.1>|</MSH.1><MSH.2>^~\\&amp;</MSH.2><MSH.9><MSG.1>ADT</MSG.1><MSG.2>A01</MSG.2></MSH.9>" +
  "<MSH.10>X1</MSH.10><MSH.11>P</MSH.11><MSH.12>2.6</MSH.12></MSH>";

/** The pipe text of `MSH`. */
const PIPE_MSH = "MSH|^~\\&|||||||ADT^A01|X1|P|2.6\r";

/** A one-message document: `MSH`, then `body`, in an `ADT_A01` root. */
function doc(body: string): string {
  return `<ADT_A01>${MSH}${body}</ADT_A01>`;
}

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

/** What `parseHL7Xml(xml)` refuses with. */
function read(xml: string): string {
  return why(() => parseHL7Xml(xml));
}

/** The value of NTE-3 read from a document whose NTE.3 holds `text`. */
function nte3(text: string): string | undefined {
  return parseHL7Xml(doc(`<NTE><NTE.3>${text}</NTE.3></NTE>`))
    .part("NTE")
    ?.field(3).value;
}

/** A message parsed from `PIPE_MSH` and `body`, for the writer. */
function pipe(body: string): Hl7Message {
  return parseHL7(body === "" ? PIPE_MSH : `${PIPE_MSH}${body}\r`);
}

/** `toHl7Xml` with MSH.9 typed, so a test names only the types it is about. */
function write(msg: Hl7Message, dataTypes: Readonly<Record<string, string>> = {}): string {
  return toHl7Xml(msg, { dataTypes: { "MSH.9": "MSG", ...dataTypes } });
}

/** A message holding `MSH` and `segments`, built by hand. */
function handBuilt(segments: readonly RawSegment[]): Hl7Message {
  const base = pipe("");
  return new Hl7Message({
    segments: [...base.rawSegments, ...segments],
    encodingCharacters: base.encodingCharacters,
    version: "2.6",
    warnings: [],
  });
}

/** A field of one repetition holding `components`, each a list of subcomponents. */
function field(...components: (readonly string[])[]): RawField {
  return {
    isNull: false,
    repetitions: [{ components: components.map((subcomponents) => ({ subcomponents })) }],
  };
}

describe("the reader names each refusal", () => {
  const cases: readonly (readonly [string, string])[] = [
    ["\u0001", "FORBIDDEN_CHARACTER: The document holds a character XML 1.0 does not allow."],
    [`${doc("")}<!-- x`, "NOT_WELL_FORMED: A comment or instruction does not end."],
    ["<?xml version='1.0'", "NOT_WELL_FORMED: A comment or instruction does not end."],
    [doc("<NTE><NTE.3><![CDATA[a</NTE.3></NTE>"), "NOT_WELL_FORMED: A CDATA section does not end."],
    ["<!DOCTYPE x><x/>", "DTD_NOT_ALLOWED: The document declares a DTD or an entity."],
    ['<!ENTITY x "y"><x/>', "DTD_NOT_ALLOWED: The document declares a DTD or an entity."],
    [
      "<!ELEMENT x ANY><x/>",
      "NOT_WELL_FORMED: The document holds a declaration XML does not allow here.",
    ],
    [`<ADT_A01>${MSH}</ADT_A01`, "NOT_WELL_FORMED: An end tag is not closed."],
    [`<ADT_A01>${MSH}</ADT_A01 x>`, "NOT_WELL_FORMED: An end tag is not closed."],
    [`<ADT_A01 a="1"b="2">${MSH}</ADT_A01>`, "NOT_WELL_FORMED: A start tag is malformed."],
    [doc('<EVN a="1"x>'), "NOT_WELL_FORMED: A start tag is malformed."],
    [doc("<EVN/ >"), "NOT_WELL_FORMED: A start tag is malformed."],
    [`<ADT_A01>${MSH}<EVN`, "NOT_WELL_FORMED: A start tag is malformed."],
    [doc("< />"), "NOT_WELL_FORMED: A tag has no name."],
    [`<ADT_A01>${MSH}<`, "NOT_WELL_FORMED: A tag has no name."],
    [`<ADT_A01 a>${MSH}</ADT_A01>`, "NOT_WELL_FORMED: An attribute has no value."],
    [`<ADT_A01 a=b>${MSH}</ADT_A01>`, "NOT_WELL_FORMED: An attribute value is not quoted."],
    [`<ADT_A01 a="b>${MSH}</ADT_A01>`, "NOT_WELL_FORMED: An attribute value does not end."],
    [`<ADT_A01 a="<">${MSH}</ADT_A01>`, "NOT_WELL_FORMED: An attribute value holds a '<'."],
    [
      `<ADT_A01 xmlns="urn:example">${MSH}</ADT_A01>`,
      "NAMESPACE_NOT_SUPPORTED: An element declares a default namespace other than the v2 XML one.",
    ],
    [doc("<NTE><NTE.3>a & b</NTE.3></NTE>"), "NOT_WELL_FORMED: An '&' starts no reference."],
    // No ';' anywhere after the '&': read as a reference cut one short, these would name an
    // entity or a forbidden character instead.
    [doc("<NTE><NTE.3>&name</NTE.3></NTE>"), "NOT_WELL_FORMED: An '&' starts no reference."],
    [doc("<NTE><NTE.3>a&#65</NTE.3></NTE>"), "NOT_WELL_FORMED: An '&' starts no reference."],
    [doc("<NTE><NTE.3>&#65x;</NTE.3></NTE>"), "NOT_WELL_FORMED: An '&' starts no reference."],
    [doc("<NTE><NTE.3>&x!;</NTE.3></NTE>"), "NOT_WELL_FORMED: An '&' starts no reference."],
    [doc("<NTE><NTE.3>&x#65;</NTE.3></NTE>"), "NOT_WELL_FORMED: An '&' starts no reference."],
    [doc("<NTE><NTE.3>&#x41g;</NTE.3></NTE>"), "NOT_WELL_FORMED: An '&' starts no reference."],
    [doc("<NTE><NTE.3>&x#x41;</NTE.3></NTE>"), "NOT_WELL_FORMED: An '&' starts no reference."],
    [doc("<NTE><NTE.3>&#X41;</NTE.3></NTE>"), "NOT_WELL_FORMED: An '&' starts no reference."],
    [
      doc("<NTE><NTE.3>&xxe;</NTE.3></NTE>"),
      "ENTITY_NOT_ALLOWED: The document references an entity.",
    ],
    [
      doc("<NTE><NTE.3>&a;</NTE.3></NTE>"),
      "ENTITY_NOT_ALLOWED: The document references an entity.",
    ],
    [
      doc("<NTE><NTE.3>&#1;</NTE.3></NTE>"),
      "FORBIDDEN_CHARACTER: A character reference names a character XML 1.0 does not allow.",
    ],
    [`${doc("")}x`, "NOT_WELL_FORMED: Text stands outside the root element."],
    [`x${doc("")}`, "NOT_WELL_FORMED: Text stands outside the root element."],
    [doc("x<EVN/>"), "MIXED_CONTENT: Text stands between segments or fields."],
    [doc("<EVN>x</EVN>"), "MIXED_CONTENT: Text stands between segments or fields."],
    [
      doc("<PID><PID.5>x<XPN.1>y</XPN.1></PID.5></PID>"),
      "MIXED_CONTENT: An element holds both text and elements. (PID.5)",
    ],
    [
      doc("<PID><PID.5><XPN.1>y</XPN.1>x</PID.5></PID>"),
      "MIXED_CONTENT: An element holds both text and elements. (PID.5)",
    ],
    [
      doc("<PID><PID.5><XPN.1><FN.1>y</FN.1>x</XPN.1></PID.5></PID>"),
      "MIXED_CONTENT: An element holds both text and elements. (XPN.1)",
    ],
    [
      `<v2:ADT_A01 xmlns:v2="urn:hl7-org:v2xml">${MSH}</v2:ADT_A01>`,
      "NAMESPACE_NOT_SUPPORTED: An element name carries a namespace prefix.",
    ],
    [`${doc("")}<ADT_A01/>`, "NOT_WELL_FORMED: The document has two root elements."],
    [
      doc('<PID><PID.5><XPN.1><FN.1><escape V="N"/></FN.1></XPN.1></PID.5></PID>'),
      "ESCAPE_NOT_SUPPORTED: The document uses an escape element. (FN.1)",
    ],
    [
      doc("<PID><PID.5><XPN.1><FN.1><X.1>x</X.1></FN.1></XPN.1></PID.5></PID>"),
      "UNEXPECTED_ELEMENT: An element nests below a subcomponent. (FN.1)",
    ],
    ["<ADT_A01><EVN/></ADT_A01>", "INVALID_ENCODING_CHARACTERS: The first segment is not MSH."],
    [
      doc("<Patient/>"),
      "UNEXPECTED_ELEMENT: An element in a message or group is not a segment or group.",
    ],
    [
      doc("<XEVN/>"),
      "UNEXPECTED_ELEMENT: An element in a message or group is not a segment or group.",
    ],
    [
      doc("<EVNX/>"),
      "UNEXPECTED_ELEMENT: An element in a message or group is not a segment or group.",
    ],
    [
      doc("<1A.B/>"),
      "UNEXPECTED_ELEMENT: An element in a message or group is not a segment or group.",
    ],
    [
      doc("<A.B-/>"),
      "UNEXPECTED_ELEMENT: An element in a message or group is not a segment or group.",
    ],
    [
      doc("<A.1/>"),
      "UNEXPECTED_ELEMENT: An element in a message or group is not a segment or group.",
    ],
    [
      doc("<PID><PV1.1>x</PV1.1></PID>"),
      "UNEXPECTED_ELEMENT: An element in a segment is not one of its fields. (PV1.1)",
    ],
    [
      doc("<PID><PID.5x>x</PID.5x></PID>"),
      "UNEXPECTED_ELEMENT: An element in a segment is not one of its fields.",
    ],
    [
      doc("<PID><xPID.5>x</xPID.5></PID>"),
      "UNEXPECTED_ELEMENT: An element in a segment is not one of its fields.",
    ],
    [
      doc("<PID><PID.13x>x</PID.13x></PID>"),
      "UNEXPECTED_ELEMENT: An element in a segment is not one of its fields.",
    ],
    [
      "<A><MSH><MSH.3>x</MSH.3></MSH></A>",
      "INVALID_ENCODING_CHARACTERS: MSH must open with MSH.1 and MSH.2, once each. (MSH.3)",
    ],
    [
      "<A><MSH><MSH.2>x</MSH.2></MSH></A>",
      "INVALID_ENCODING_CHARACTERS: MSH must open with MSH.1 and MSH.2, once each. (MSH.2)",
    ],
    [
      "<A><MSH><MSH.1>|</MSH.1><MSH.1>|</MSH.1></MSH></A>",
      "INVALID_ENCODING_CHARACTERS: MSH must open with MSH.1 and MSH.2, once each. (MSH.1)",
    ],
    [
      "<A><MSH><MSH.1>|</MSH.1><MSH.2>^~\\&amp;</MSH.2><MSH.2>^~\\&amp;</MSH.2></MSH></A>",
      "INVALID_ENCODING_CHARACTERS: MSH must open with MSH.1 and MSH.2, once each. (MSH.2)",
    ],
    [
      "<A><MSH><MSH.1>|</MSH.1><MSH.2>^~\\&amp;</MSH.2><MSH.1>|</MSH.1></MSH></A>",
      "INVALID_ENCODING_CHARACTERS: MSH must open with MSH.1 and MSH.2, once each. (MSH.1)",
    ],
    [
      doc("<PID><PID.5>a</PID.5><PID.3>b</PID.3></PID>"),
      "OUT_OF_ORDER: A field comes before one it should follow. (PID.3)",
    ],
    [
      doc('<NTE><NTE.3>a<escape V=".br"/>b</NTE.3></NTE>'),
      "ESCAPE_NOT_SUPPORTED: The document uses an escape element. (NTE.3)",
    ],
    [
      doc('<NTE><NTE.3><FT.1>a<escape V="H"/></FT.1></NTE.3></NTE>'),
      "ESCAPE_NOT_SUPPORTED: The document uses an escape element. (FT.1)",
    ],
    [
      "<A><MSH><MSH.1>|</MSH.1><MSH.2><X.1>^</X.1></MSH.2></MSH></A>",
      "INVALID_ENCODING_CHARACTERS: MSH.1 and MSH.2 hold text only. (MSH.2)",
    ],
    [
      "<A><MSH><MSH.1><X.1>|</X.1></MSH.1></MSH></A>",
      "INVALID_ENCODING_CHARACTERS: MSH.1 and MSH.2 hold text only. (MSH.1)",
    ],
    [
      doc("<PID><PID.5><family>x</family></PID.5></PID>"),
      "UNEXPECTED_ELEMENT: An element in a field is not a component. (PID.5)",
    ],
    [
      doc("<PID><PID.5><-X.1>x</-X.1></PID.5></PID>"),
      "UNEXPECTED_ELEMENT: An element in a field is not a component. (PID.5)",
    ],
    [
      doc("<PID><PID.5><X.1x>x</X.1x></PID.5></PID>"),
      "UNEXPECTED_ELEMENT: An element in a field is not a component. (PID.5)",
    ],
    [
      doc("<PID><PID.5><XPN.1><a>x</a></XPN.1></PID.5></PID>"),
      "UNEXPECTED_ELEMENT: An element in a component is not a subcomponent. (XPN.1)",
    ],
    [
      doc("<PID><PID.5><XPN.1>a</XPN.1><XPN.1>b</XPN.1></PID.5></PID>"),
      "OUT_OF_ORDER: A component or subcomponent repeats or comes out of order. (XPN.1)",
    ],
    [
      doc("<PID><PID.5><XPN.2>a</XPN.2><XPN.1>b</XPN.1></PID.5></PID>"),
      "OUT_OF_ORDER: A component or subcomponent repeats or comes out of order. (XPN.1)",
    ],
    [
      doc("<PID><PID.5><XPN.1><FN.2>a</FN.2><FN.2>b</FN.2></XPN.1></PID.5></PID>"),
      "OUT_OF_ORDER: A component or subcomponent repeats or comes out of order. (FN.2)",
    ],
    [
      doc("<NTE><NTE.3>a\\b</NTE.3></NTE>"),
      "ESCAPE_NOT_SUPPORTED: A value holds the message's escape character. (NTE.3)",
    ],
    [
      doc("<PID><PID.5><XPN.1>a\\b</XPN.1></PID.5></PID>"),
      "ESCAPE_NOT_SUPPORTED: A value holds the message's escape character. (XPN.1)",
    ],
    [
      doc("<PID><PID.5><XPN.1><FN.1>\\</FN.1></XPN.1></PID.5></PID>"),
      "ESCAPE_NOT_SUPPORTED: A value holds the message's escape character. (FN.1)",
    ],
    [
      doc("<NTE><NTE.3>a</NTE.4></NTE>"),
      "NOT_WELL_FORMED: An end tag does not match its start tag.",
    ],
    [`${doc("")}</ADT_A01>`, "NOT_WELL_FORMED: An end tag does not match its start tag."],
    [`<ADT_A01>${MSH}`, "NOT_WELL_FORMED: The document ends inside an element."],
    [`<ADT_A01>${MSH}<G.A></G.A>`, "NOT_WELL_FORMED: The document ends inside an element."],
    ["", "NOT_WELL_FORMED: The document has no root element."],
    [" <!-- nothing --> ", "NOT_WELL_FORMED: The document has no root element."],
    ["<ADT_A01/>", "INVALID_ENCODING_CHARACTERS: The document holds no MSH segment."],
    [
      "<A><MSH><MSH.1>||</MSH.1></MSH></A>",
      "INVALID_ENCODING_CHARACTERS: MSH.1 is not one character. (MSH.1)",
    ],
    [
      "<A><MSH><MSH.1/></MSH></A>",
      "INVALID_ENCODING_CHARACTERS: MSH.1 is not one character. (MSH.1)",
    ],
    [
      "<A><MSH><MSH.1>|</MSH.1><MSH.2>^~\\</MSH.2></MSH></A>",
      "INVALID_ENCODING_CHARACTERS: MSH.2 is not four or five characters. (MSH.2)",
    ],
    [
      "<A><MSH><MSH.1>|</MSH.1><MSH.2>^~\\&amp;#!</MSH.2></MSH></A>",
      "INVALID_ENCODING_CHARACTERS: MSH.2 is not four or five characters. (MSH.2)",
    ],
    [
      "<A><MSH><MSH.1>|</MSH.1></MSH></A>",
      "INVALID_ENCODING_CHARACTERS: MSH has no MSH.1 and MSH.2.",
    ],
    ["<A><MSH/></A>", "INVALID_ENCODING_CHARACTERS: MSH has no MSH.1 and MSH.2."],
  ];

  for (const [xml, expected] of cases) {
    it(`refuses ${JSON.stringify(xml.slice(0, 70))} with ${expected}`, () => {
      expect(read(xml)).toBe(expected);
    });
  }

  it("refuses past each limit with its own words", () => {
    const limited = (limits: Parameters<typeof parseHL7Xml>[1]): string =>
      why(() => parseHL7Xml(doc(""), limits));
    expect(limited({ limits: { maxInputBytes: 10 } })).toBe(
      "INPUT_TOO_LARGE: The document is larger than the limit.",
    );
    expect(limited({ limits: { maxDepth: 2 } })).toBe(
      "DEPTH_LIMIT_EXCEEDED: Elements nest deeper than the limit.",
    );
    expect(limited({ limits: { maxElements: 5 } })).toBe(
      "ELEMENT_LIMIT_EXCEEDED: The document has more elements than the limit.",
    );
  });

  it("reads an MSH of only its delimiters as parseHL7 reads one", () => {
    const xml = "<A><MSH><MSH.1>|</MSH.1><MSH.2>^~\\&amp;</MSH.2></MSH></A>";
    expect(xmlToPipe(xml)).toBe("MSH|^~\\&\r");
    expect(parseHL7Xml(xml).rawSegments).toEqual(parseHL7("MSH|^~\\&\r").rawSegments);
  });

  it("leaves delimiters the pipe parser refuses to the pipe parser's own error", () => {
    expect(() => parseHL7Xml("<A><MSH><MSH.1>|</MSH.1><MSH.2>^^\\&amp;</MSH.2></MSH></A>")).toThrow(
      Hl7ParseError,
    );
    expect(() => parseHL7Xml("<A><MSH><MSH.1> </MSH.1><MSH.2>^~\\&amp;</MSH.2></MSH></A>")).toThrow(
      Hl7ParseError,
    );
  });

  it("points at the attribute value or the text where a reference fails", () => {
    const attribute = '<ADT_A01 a="&x;">';
    try {
      parseHL7Xml(`${attribute}${MSH}</ADT_A01>`);
      expect.unreachable();
    } catch (error) {
      expect((error as Hl7XmlError).offset).toBe(attribute.indexOf("&"));
    }
    const head = `<ADT_A01>${MSH}<NTE><NTE.3>`;
    try {
      parseHL7Xml(`${head}ok &x; </NTE.3></NTE></ADT_A01>`);
      expect.unreachable();
    } catch (error) {
      expect((error as Hl7XmlError).offset).toBe(head.length);
      expect((error as Hl7XmlError).path).toBeUndefined();
    }
  });

  it("names a path only when it has the shape of an HL7 position", () => {
    const pathOf = (xml: string): string | undefined => {
      try {
        parseHL7Xml(xml);
      } catch (error) {
        return (error as Hl7XmlError).path;
      }
      return "none";
    };
    expect(pathOf(doc("<NTE><NTE.13>a\\</NTE.13></NTE>"))).toBe("NTE.13");
    expect(pathOf(doc("<NTE><NTE.999>a\\</NTE.999></NTE>"))).toBe("NTE.999");
    expect(pathOf(doc("<ZZZ><ZZZ.1><ABCDEF.1>\\</ABCDEF.1></ZZZ.1></ZZZ>"))).toBe("ABCDEF.1");
    expect(pathOf(doc("<ZZZ><ZZZ.1><ABCDEFG.1>\\</ABCDEFG.1></ZZZ.1></ZZZ>"))).toBeUndefined();
    expect(pathOf(doc("<ZZZ><ZZZ.1><Ab.1>\\</Ab.1></ZZZ.1></ZZZ>"))).toBeUndefined();
    expect(pathOf(doc("<NTE><xNTE.1>a</xNTE.1></NTE>"))).toBeUndefined();
    expect(pathOf(doc("<NTE><NTE.1x>a</NTE.1x></NTE>"))).toBeUndefined();
    expect(pathOf(doc("<NTE><NTE.0>a</NTE.0></NTE>"))).toBeUndefined();
  });
});

describe("the reader's edges", () => {
  it("writes the pipe form with a CR after every segment", () => {
    expect(xmlToPipe(doc("<NTE/>"))).toBe(`${PIPE_MSH}NTE\r`);
  });

  it("reads every predefined entity and character references at each edge XML allows", () => {
    expect(nte3("&amp;&lt;&gt;&quot;&apos;")).toBe("&<>\"'");
    expect(nte3("a&#x20;b&#32;c")).toBe("a b c");
    for (const code of [0xd7ff, 0xe000, 0xfffd, 0x10000, 0x10ffff]) {
      expect(nte3(`a&#x${code.toString(16)};`)).toBe(`a${String.fromCodePoint(code)}`);
    }
    for (const ref of ["&#x1F;", "&#xD800;", "&#xDFFF;", "&#xFFFE;", "&#x110000;", "&#1114112;"]) {
      expect(read(doc(`<NTE><NTE.3>${ref}</NTE.3></NTE>`))).toBe(
        "FORBIDDEN_CHARACTER: A character reference names a character XML 1.0 does not allow.",
      );
    }
  });

  it("finds the end of a comment, instruction or CDATA after the markup opens, not before", () => {
    expect(nte3("a--><!-- c -->b")).toBe("a-->b");
    expect(nte3("a?><?pi x?>b")).toBe("a?>b");
    expect(nte3("x]]><![CDATA[y]]>z")).toBe("x]]>yz");
    expect(nte3("<![CDATA[d\re\r\nf]]>")).toBe("d\ne\nf");
  });

  it("accepts the empty and the v2 XML default namespace, and ignores prefixed declarations", () => {
    for (const attribute of ['xmlns=""', `xmlns="${V2_XML_NAMESPACE}"`, 'xmlns:v2="urn:example"']) {
      expect(parseHL7Xml(`<ADT_A01 ${attribute}>${MSH}</ADT_A01>`).version).toBe("2.6");
    }
    expect(V2_XML_NAMESPACE).toBe("urn:hl7-org:v2xml");
  });

  it("lets components stand in any field but MSH.1 and MSH.2", () => {
    const xml = doc(
      "<PID><PID.1><SI.1>1</SI.1></PID.1><PID.2><CX.1>a</CX.1><CX.2>b</CX.2></PID.2></PID>",
    );
    expect(xmlToPipe(xml)).toBe(`${PIPE_MSH}PID|1|a^b\r`);
  });

  it("leaves an absent first component or subcomponent empty", () => {
    const xml = doc(
      "<PID><PID.5><XPN.2>a</XPN.2></PID.5><PID.6><XPN.1><FN.2>b</FN.2></XPN.1></PID.6></PID>",
    );
    expect(xmlToPipe(xml)).toBe(`${PIPE_MSH}PID|||||^a|&b\r`);
  });

  it("counts skipped positions after a filled one exactly", () => {
    const fields = doc("<NTE><NTE.1>a</NTE.1><NTE.4>b</NTE.4></NTE>");
    // 16 for the MSH, then the NTE, two fields and the two positions skipped between them.
    expect(parseHL7Xml(fields, { limits: { maxElements: 21 } }).version).toBe("2.6");
    expect(why(() => parseHL7Xml(fields, { limits: { maxElements: 20 } }))).toContain(
      "ELEMENT_LIMIT_EXCEEDED",
    );
    const parts = doc("<NTE><NTE.1><X.1>a</X.1><X.4>b</X.4></NTE.1></NTE>");
    expect(parseHL7Xml(parts, { limits: { maxElements: 22 } }).version).toBe("2.6");
    expect(why(() => parseHL7Xml(parts, { limits: { maxElements: 21 } }))).toContain(
      "ELEMENT_LIMIT_EXCEEDED",
    );
  });

  it("holds the default limits", () => {
    expect(DEFAULT_XML_LIMITS).toEqual({
      maxInputBytes: 30_000_000,
      maxDepth: 64,
      maxElements: 1_000_000,
    });
    const nested = (depth: number): string =>
      `<ADT_A01>${MSH}${"<G.A>".repeat(depth)}${"</G.A>".repeat(depth)}</ADT_A01>`;
    expect(parseHL7Xml(nested(63)).version).toBe("2.6");
    expect(read(nested(64))).toBe("DEPTH_LIMIT_EXCEEDED: Elements nest deeper than the limit.");
    // 16 elements in the MSH and its root, then 1,000 per NTE: itself and NTE.999, which skips 998.
    const wide = (notes: number, extra: string): string =>
      doc(`${"<NTE><NTE.999>a</NTE.999></NTE>".repeat(notes)}${extra}`);
    expect(parseHL7Xml(wide(999, "<NTE><NTE.983>a</NTE.983></NTE>")).version).toBe("2.6");
    expect(read(wide(999, "<NTE><NTE.984>a</NTE.984></NTE>"))).toBe(
      "ELEMENT_LIMIT_EXCEEDED: The document has more elements than the limit.",
    );
    const big = doc(`<NTE><NTE.3>${"a".repeat(30_000_000)}</NTE.3></NTE>`);
    expect(read(big)).toBe("INPUT_TOO_LARGE: The document is larger than the limit.");
  });
});

describe("the writer names each refusal", () => {
  it("refuses each case with its own words", () => {
    expect(why(() => write(pipe("PID|||1^2"), { "PID.3": "C X" }))).toBe(
      "INVALID_OPTIONS: A data type is not an XML name. (PID.3)",
    );
    expect(why(() => write(handBuilt([{ name: "Z-1", fields: [] }])))).toBe(
      "UNEXPECTED_ELEMENT: A segment name is not three letters or digits.",
    );
    expect(why(() => write(pipe("PID|||1^2")))).toBe(
      "DATA_TYPE_UNKNOWN: A composite field has no data type to name its components. (PID.3)",
    );
    expect(why(() => write(pipe("PID|||1^^^A&&ISO"), { "PID.3": "CX" }))).toBe(
      "DATA_TYPE_UNKNOWN: A composite has no data type to name its subcomponents. (CX.4)",
    );
    expect(why(() => write(pipe("NTE|||a&b")))).toBe(
      "DATA_TYPE_UNKNOWN: A composite has no data type to name its subcomponents. (NTE.3)",
    );
    expect(why(() => write(pipe("NTE|||a\\H\\b")))).toBe(
      "ESCAPE_NOT_SUPPORTED: A value carries a formatting, hex or other escape sequence the XML writer cannot express. (NTE.3)",
    );
    expect(why(() => write(pipe("NTE|||a\\E\\b")))).toBe(
      "ESCAPE_NOT_SUPPORTED: A value holds the message's escape character. (NTE.3)",
    );
    expect(why(() => write(pipe("NTE|||a\u0001b")))).toBe(
      "FORBIDDEN_CHARACTER: A value holds a character XML 1.0 does not allow. (NTE.3)",
    );
    expect(why(() => toHl7Xml(pipe(""), { structure: "<x>" }))).toBe(
      "INVALID_OPTIONS: The structure name is not an XML name.",
    );
    expect(why(() => toHl7Xml(parseHL7("MSH|^~\\&|||||||||P|2.6\r")))).toBe(
      "STRUCTURE_UNKNOWN: No message structure name can be taken from MSH-9; pass `structure`.",
    );
  });

  it("checks names whole, not a part of them", () => {
    for (const type of ["1CX", "CX-1", "C.X", ""]) {
      expect(why(() => write(pipe("PID|||1^2"), { "PID.3": type }))).toContain("INVALID_OPTIONS");
    }
    for (const structure of ["1ABC", "ABC-1", "A.B", ""]) {
      expect(why(() => toHl7Xml(pipe(""), { structure }))).toContain("INVALID_OPTIONS");
    }
    for (const name of ["1ZZZ", "ZZZ1", "ZZ", "zzz"]) {
      expect(why(() => write(handBuilt([{ name, fields: [] }])))).toContain("UNEXPECTED_ELEMENT");
    }
  });
});

describe("the writer's edges", () => {
  it("names the root for the structure MSH-9.3 gives over the code and trigger", () => {
    const xml = toHl7Xml(parseHL7("MSH|^~\\&|||||||ACK^R01^ACK|1|P|2.6\r"), {
      dataTypes: { "MSH.9": "MSG" },
    });
    expect(xml.split("\n")[1]).toBe('<ACK xmlns="urn:hl7-org:v2xml">');
    expect(toHl7Xml(parseHL7("MSH|^~\\&|||||||ADT|1|P|2.6\r")).split("\n")[1]).toBe(
      '<ADT xmlns="urn:hl7-org:v2xml">',
    );
  });

  it("escapes a quote in the namespace it declares", () => {
    const xml = toHl7Xml(pipe(""), { dataTypes: { "MSH.9": "MSG" }, namespace: 'urn:"x"&<>' });
    expect(xml.split("\n")[1]).toBe('<ADT_A01 xmlns="urn:&quot;x&quot;&amp;&lt;&gt;">');
  });

  it("writes an empty first repetition as an empty element", () => {
    expect(write(pipe("NK1|||~b"))).toContain("<NK1><NK1.3/><NK1.3>b</NK1.3></NK1>");
  });

  it("writes a repetition with no components as an empty element", () => {
    const fieldOf = (reps: RawField["repetitions"]): RawField => ({
      isNull: false,
      repetitions: reps,
    });
    const msg = handBuilt([
      {
        name: "NK1",
        fields: [
          field(["NK1"]),
          fieldOf([
            { components: [{ subcomponents: ["a"] }] },
            { components: [] },
            { components: [{ subcomponents: ["b"] }] },
          ]),
        ],
      },
    ]);
    expect(write(msg)).toContain("<NK1><NK1.1>a</NK1.1><NK1.1/><NK1.1>b</NK1.1></NK1>");
  });

  it("writes a value with empty subcomponents after it as text, typed field or not", () => {
    const msg = handBuilt([
      { name: "NTE", fields: [field(["NTE"]), field(["a", ""]), field(["b", ""], ["c"])] },
    ]);
    expect(write(msg, { "NTE.2": "CX" })).toContain(
      "<NTE><NTE.1>a</NTE.1><NTE.2><CX.1>b</CX.1><CX.2>c</CX.2></NTE.2></NTE>",
    );
  });

  it("writes typed subcomponents, skipping empty ones", () => {
    const msg = handBuilt([
      { name: "PID", fields: [field(["PID"]), field(["", "x", "", "y", ""])] },
    ]);
    expect(write(msg, { "PID.1": "CX", "CX.1": "HD" })).toContain(
      "<PID><PID.1><CX.1><HD.2>x</HD.2><HD.4>y</HD.4></CX.1></PID.1></PID>",
    );
  });

  it("takes data types from the map's own keys only", () => {
    const own = Object.assign(Object.create({ "PID.3": "XX" }) as Record<string, string>, {
      "MSH.9": "MSG",
    });
    expect(why(() => toHl7Xml(pipe("PID|||1^2"), { dataTypes: own }))).toContain(
      "DATA_TYPE_UNKNOWN",
    );
  });
});

describe("xmlDataTypes", () => {
  it("lists its keys in sorted order", () => {
    const xml = doc(
      "<PID><PID.5><XPN.1><FN.1>a</FN.1></XPN.1></PID.5></PID><EVN><EVN.2><TS.1>1</TS.1></EVN.2></EVN>",
    );
    expect(Object.keys(xmlDataTypes(xml))).toEqual(["EVN.2", "MSH.9", "PID.5", "XPN.1"]);
  });

  it("keeps a key the document names the same way twice, and drops one it names two ways", () => {
    const twice = doc(
      "<OBX><OBX.5><CWE.1>a</CWE.1></OBX.5></OBX><OBX><OBX.5><CWE.1>b</CWE.1></OBX.5></OBX>",
    );
    expect(xmlDataTypes(twice)["OBX.5"]).toBe("CWE");
    const twoWays = doc(
      "<OBX><OBX.5><CWE.1>a</CWE.1></OBX.5></OBX><OBX><OBX.5><SN.1>b</SN.1></OBX.5></OBX><OBX><OBX.5><SN.1>c</SN.1></OBX.5></OBX>",
    );
    expect(xmlDataTypes(twoWays)).toEqual({ "MSH.9": "MSG" });
  });
});
