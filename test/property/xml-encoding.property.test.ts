/**
 * Property tests for the HL7 v2 XML encoding: a message goes pipe to XML to pipe and XML to pipe
 * to XML with every field, component, repetition, escape and null kept, under any encoding
 * characters, the v2.7 truncation character included, and with trailing empty fields kept. A value the writer cannot carry (one with
 * the escape character, or a formatting or hex escape) is refused, and refused only then.
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
              (c.rawSubcomponents?.some((r) => r !== undefined) ?? false),
          ),
        ),
    ),
  );
}

describe("v2 XML round trips", () => {
  it("pipe to XML to pipe keeps every field, component, repetition, escape and null", () => {
    checkProperty(
      fc.property(writable, (msg) => {
        const xml = toHl7Xml(msg, { dataTypes });
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
        const xml = toHl7Xml(msg, { dataTypes });
        const pipe = parseHL7Xml(xml).toString();
        expect(toHl7Xml(parseHL7(pipe), { dataTypes })).toBe(xml);
      }),
    );
  });

  it("reads the same message from the document indented and wrapped in a group", () => {
    checkProperty(
      fc.property(writable, (msg) => {
        const xml = toHl7Xml(msg, { dataTypes, namespace: null });
        const indented = xml
          .replace(/></gu, ">\n    <")
          .replace(/(<\/MSH>)/u, "$1\n<ORU_R01.GROUP>")
          .replace(/\n<\/ORU_R01>/u, "\n</ORU_R01.GROUP></ORU_R01>");
        expect(parseHL7Xml(indented).rawSegments).toEqual(msg.rawSegments);
      }),
    );
  });

  it("refuses with ESCAPE_NOT_SUPPORTED exactly when a value cannot be carried", () => {
    checkProperty(
      fc.property(message(), (msg) => {
        let xml: string | undefined;
        try {
          xml = toHl7Xml(msg, { dataTypes });
        } catch (error) {
          expect(error).toBeInstanceOf(Hl7XmlError);
          expect((error as Hl7XmlError).code).toBe("ESCAPE_NOT_SUPPORTED");
        }
        expect(xml === undefined).toBe(holdsUnwritable(msg));
        if (xml !== undefined) expect(parseHL7Xml(xml).rawSegments).toEqual(msg.rawSegments);
      }),
    );
  });
});
