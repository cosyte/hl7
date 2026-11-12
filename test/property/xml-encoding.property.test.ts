/**
 * Property tests for the HL7 v2 XML encoding: a message goes pipe to XML to pipe and XML to pipe
 * to XML with every field, component, repetition, escape and null kept, under any encoding
 * characters, the v2.7 truncation character included, and with trailing empty fields kept. A value
 * the writer cannot carry (one with the escape character, a formatting escape in a value not typed
 * TX or FT, a hex escape ASCII cannot decode, or a character set or vendor escape) is refused, and
 * refused only then. Segments are written under the root (`groups: "none"`): the messages are of
 * any segments, not of one structure.
 */

import fc from "fast-check";
import { describe, expect, it } from "vitest";

import { encodingCharacters, message, segment, value } from "../../src/arbitraries/index.js";
import {
  Hl7XmlError,
  parseHL7,
  parseHL7Xml,
  toHl7Xml,
  type EncodingCharacters,
  type Hl7Message,
  type RawSegment,
} from "../../src/index.js";
import { emitSegment } from "../../src/serialize/emit-field.js";
import { checkProperty } from "../_helpers/property.js";

/** Every field is a composite named `CMP`, and every component one named `SUB`. */
function dataTypes(key: string): string | undefined {
  if (/^[A-Z][A-Z0-9]{2}\.\d+$/u.test(key)) return "CMP";
  if (/^CMP\.\d+$/u.test(key)) return "SUB";
  return undefined;
}

/** The pipe text of a message with `enc`, a version and `body`'s segments. */
function pipeText(enc: EncodingCharacters, version: string, body: string[]): string {
  const f = enc.field;
  const msh2 =
    enc.component + enc.repetition + enc.escape + enc.subcomponent + (enc.truncation ?? "");
  const msh = `MSH${f}${msh2}${f}SND${f}FAC${f}RCV${f}FAC${f}20260101120000${f}${f}ORU${enc.component}R01${enc.component}ORU_R01${f}MSG1${f}P${f}${version}`;
  return [msh, ...body].join("\r") + "\r";
}

/**
 * A message whose values never hold its escape character: every one the writer can carry. Any
 * segment, MSH included, may end in up to three empty fields, which the writer keeps.
 */
const writable: fc.Arbitrary<Hl7Message> = encodingCharacters().chain((enc) =>
  fc
    .tuple(
      fc.constantFrom("2.5", "2.5.1", "2.6", "2.7", "2.7.1"),
      fc.nat({ max: 3 }),
      fc.array(
        fc.tuple(
          segment({ values: value().filter((v) => !v.includes(enc.escape)), maxFields: 6 }),
          fc.nat({ max: 3 }),
        ),
        { maxLength: 5 },
      ),
    )
    .map(([version, mshEmpties, segments]) =>
      parseHL7(
        pipeText(
          enc,
          version + enc.field.repeat(mshEmpties),
          segments.map(([s, empties]) => emitSegment(s, enc) + enc.field.repeat(empties)),
        ),
      ),
    ),
);

/**
 * `toHl7Xml` with the data types above, every segment under the root, and the root named
 * `ORU_R01`: a generated message's MSH-9 may name no structure.
 */
function write(msg: Hl7Message, namespace?: null): string {
  return toHl7Xml(msg, {
    dataTypes,
    groups: "none",
    structure: "ORU_R01",
    ...(namespace === null ? { namespace } : {}),
  });
}

/**
 * Whether one escape sequence's body is one the writer carries in a value typed neither TX nor
 * FT, with MSH-18 blank: a delimiter escape, a line break, or a hex escape of ASCII characters XML
 * allows. A hex escape of the escape character is caught by the decoded value holding it.
 */
function carried(body: string): boolean {
  if (["F", "S", "T", "R", "P", ".br"].includes(body)) return true;
  if (!/^X(?:[0-9A-Fa-f]{2})+$/u.test(body)) return false;
  return (body.slice(1).match(/../gu) as string[])
    .map((pair) => Number.parseInt(pair, 16))
    .every((b) => b < 0x80 && (b >= 0x20 || b === 0x09 || b === 0x0a || b === 0x0d));
}

/** Whether the pipe text of one value holds an escape the writer does not carry. */
function rawUnwritable(raw: string, esc: string): boolean {
  const parts = raw.split(esc);
  // An odd number of escape characters leaves one open.
  if (parts.length % 2 === 0) return true;
  return parts.some((part, i) => i % 2 === 1 && !carried(part));
}

/** Whether some value of `msg` is one the writer refuses. */
function holdsUnwritable(msg: Hl7Message): boolean {
  const esc = msg.encodingCharacters.escape;
  return msg.rawSegments.some((seg) =>
    seg.fields.some(
      (field, i) =>
        (seg.name !== "MSH" || i > 1) &&
        field.repetitions.some((rep) =>
          rep.components.some(
            (c) =>
              c.subcomponents.some((s) => s.includes(esc)) ||
              (c.rawSubcomponents?.some((r) => r !== undefined && rawUnwritable(r, esc)) ?? false),
          ),
        ),
    ),
  );
}

/** A message's segments with the pipe text of each value dropped: its decoded values only. */
function decoded(segments: readonly RawSegment[]): unknown {
  return JSON.parse(
    JSON.stringify(segments, (key, v: unknown) => (key === "rawSubcomponents" ? undefined : v)),
  );
}

describe("v2 XML round trips", () => {
  it("pipe to XML to pipe keeps every field, component, repetition, escape and null", () => {
    checkProperty(
      fc.property(writable, (msg) => {
        const xml = write(msg);
        const back = parseHL7Xml(xml);
        expect(back.toString()).toBe(msg.toString());
        expect(back.rawSegments).toEqual(msg.rawSegments);
        expect(back.encodingCharacters).toEqual(msg.encodingCharacters);
      }),
    );
  });

  it("XML to pipe to XML writes the same document", () => {
    checkProperty(
      fc.property(writable, (msg) => {
        const xml = write(msg);
        const pipe = parseHL7Xml(xml).toString();
        expect(write(parseHL7(pipe))).toBe(xml);
      }),
    );
  });

  it("reads the same message from the document indented and wrapped in a group", () => {
    checkProperty(
      fc.property(writable, (msg) => {
        const xml = write(msg, null);
        const indented = xml
          .replace(/></gu, ">\n    <")
          .replace(/(<\/MSH>)/u, "$1\n<ORU_R01.GROUP>")
          .replace(/\n<\/ORU_R01>/u, "\n</ORU_R01.GROUP></ORU_R01>");
        expect(parseHL7Xml(indented).rawSegments).toEqual(msg.rawSegments);
      }),
    );
  });

  it("refuses exactly when a value cannot be carried, and keeps every decoded value", () => {
    checkProperty(
      fc.property(message(), (msg) => {
        let xml: string | undefined;
        try {
          xml = write(msg);
        } catch (error) {
          expect(error).toBeInstanceOf(Hl7XmlError);
          expect(["ESCAPE_NOT_SUPPORTED", "FORBIDDEN_CHARACTER"]).toContain(
            (error as Hl7XmlError).code,
          );
        }
        expect(xml === undefined).toBe(holdsUnwritable(msg));
        // A hex escape is written as character references, so the value reads back decoded.
        if (xml !== undefined) {
          expect(decoded(parseHL7Xml(xml).rawSegments)).toEqual(decoded(msg.rawSegments));
        }
      }),
    );
  });
});
