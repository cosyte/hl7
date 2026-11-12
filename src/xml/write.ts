/**
 * The HL7 v2 XML encoding writer: a parsed or built `Hl7Message` written as a v2 XML document,
 * one segment element per line under the message structure's root element.
 */

import type { Hl7Message } from "../model/message.js";
import type {
  EncodingCharacters,
  RawComponent,
  RawField,
  RawRepetition,
  RawSegment,
} from "../parser/types.js";

import { forbiddenCharacterAt } from "./chars.js";
import { Hl7XmlError, XML_ERROR_CODES, safePath, type XmlErrorCode } from "./errors.js";
import { V2_XML_NAMESPACE } from "./read.js";

/**
 * Options for `toHl7Xml`.
 *
 * @example
 * ```ts
 * import type { ToHl7XmlOptions } from "@cosyte/hl7";
 * const options: ToHl7XmlOptions = {
 *   dataTypes: { "PID.5": "XPN", "XPN.1": "FN" },
 *   namespace: null,
 * };
 * ```
 */
export interface ToHl7XmlOptions {
  /**
   * The data type of each composite the message carries, which names its child elements: a
   * field key (`PID.5`) to its type (`XPN`), whose components are written `XPN.1`, `XPN.2`, and
   * a component key (`XPN.1`) to its type (`FN`), whose subcomponents are written `FN.1`, `FN.2`.
   * A map or a function from key to type. `xmlDataTypes` reads one from a sample document.
   *
   * A field or component with a type is written with child elements, even when it holds one
   * value. One without a type is written as text when it holds one value, and refused with
   * `DATA_TYPE_UNKNOWN` when it holds more, because its child elements cannot be named. List
   * composite types only: a primitive type given here would be written as a composite.
   */
  readonly dataTypes?: Readonly<Record<string, string>> | ((key: string) => string | undefined);
  /**
   * The root element's name, the message structure (`ORU_R01`). Defaults to MSH-9.3, else
   * MSH-9.1 and MSH-9.2 joined by `_`, else MSH-9.1.
   */
  readonly structure?: string;
  /**
   * The root element's default namespace: `urn:hl7-org:v2xml` by default, `null` for none (some
   * networks ask for none).
   */
  readonly namespace?: string | null;
}

/** Whether `name` is an XML name with no namespace prefix and no dot. */
function isXmlName(name: string): boolean {
  return /^[A-Za-z][A-Za-z0-9_]*$/u.test(name);
}

/** Refuse a message or an option. */
function fail(code: XmlErrorCode, message: string, path?: string): never {
  throw new Hl7XmlError(code, message, undefined, safePath(path));
}

/** Escape text for an element's content. */
function escapeText(text: string): string {
  return text
    .replace(/&/gu, "&amp;")
    .replace(/</gu, "&lt;")
    .replace(/>/gu, "&gt;")
    .replace(/\r/gu, "&#13;")
    .replace(/\n/gu, "&#10;");
}

/** Whether a component holds a non-empty subcomponent. */
function hasValue(component: RawComponent): boolean {
  return component.subcomponents.some((s) => s !== "");
}

/** Whether a subcomponent is non-empty. */
function isFilled(subcomponent: string): boolean {
  return subcomponent !== "";
}

/** One past the last index of `items` that `keep` holds for; 0 when none. */
function extent<T>(items: readonly T[], keep: (item: T) => boolean): number {
  return items.findLastIndex(keep) + 1;
}

/** Writes one message. */
class XmlWriter {
  private readonly enc: EncodingCharacters;
  private readonly lookup: (key: string) => string | undefined;

  public constructor(enc: EncodingCharacters, dataTypes: ToHl7XmlOptions["dataTypes"]) {
    this.enc = enc;
    this.lookup =
      typeof dataTypes === "function"
        ? dataTypes
        : (key: string): string | undefined =>
            dataTypes !== undefined && Object.hasOwn(dataTypes, key) ? dataTypes[key] : undefined;
  }

  /** The name of the segment being written, which no data type may take. */
  private segmentName: string | undefined;
  /** Whether the message's MSH has been written: one document holds one message. */
  private mshWritten = false;

  /**
   * The data type `dataTypes` gives `key`, refused when it is not an XML name or is the name of
   * the segment it stands in, which the reader would refuse.
   */
  private typeOf(key: string): string | undefined {
    const type = this.lookup(key);
    if (type?.match(/^[A-Za-z][A-Za-z0-9_]*$/u) === null) {
      fail(XML_ERROR_CODES.INVALID_OPTIONS, "A data type is not an XML name.", key);
    }
    if (type === this.segmentName) {
      fail(XML_ERROR_CODES.INVALID_OPTIONS, "A data type is named for its segment.", key);
    }
    return type;
  }

  /**
   * One segment element, self-closing when the segment has no field. A field past the last
   * filled one is written as one empty element at the last position, so the segment keeps its
   * field count: `PID|a||` is `<PID><PID.1>a</PID.1><PID.3/></PID>`.
   */
  public segment(seg: RawSegment): string {
    if (!/^[A-Z][A-Z0-9]{2}$/u.test(seg.name)) {
      fail(XML_ERROR_CODES.UNEXPECTED_ELEMENT, "A segment name is not three letters or digits.");
    }
    this.segmentName = seg.name;
    let body = "";
    // MSH-n sits at fields[n - 1] (MSH-1 is the separator itself); any other SEG-n at fields[n].
    const msh = seg.name === "MSH";
    if (msh) {
      if (this.mshWritten) {
        fail(XML_ERROR_CODES.UNEXPECTED_ELEMENT, "The message holds a second MSH segment.");
      }
      this.mshWritten = true;
      const enc = this.enc;
      const msh2 =
        enc.component + enc.repetition + enc.escape + enc.subcomponent + (enc.truncation ?? "");
      body += `<MSH.1>${escapeText(enc.field)}</MSH.1><MSH.2>${escapeText(msh2)}</MSH.2>`;
    }
    const first = msh ? 2 : 1;
    const fields = seg.fields.slice(first);
    for (const [i, field] of fields.entries()) {
      const key = `${seg.name}.${String(i + first + (msh ? 1 : 0))}`;
      const written = this.field(key, field);
      body +=
        written === "" && i === fields.length - 1 && field !== undefined ? `<${key}/>` : written;
    }
    return body === "" ? `<${seg.name}/>` : `<${seg.name}>${body}</${seg.name}>`;
  }

  /** A field's elements, one per repetition; empty when the field is. */
  private field(key: string, field: RawField | undefined): string {
    if (field === undefined) return "";
    if (field.isNull) return `<${key}>""</${key}>`;
    const reps = field.repetitions;
    if (reps.length === 1 && !(reps[0] as RawRepetition).components.some(hasValue)) return "";
    let out = "";
    for (const rep of reps) {
      const content = this.repetition(key, rep);
      out += content === "" ? `<${key}/>` : `<${key}>${content}</${key}>`;
    }
    return out;
  }

  /** A repetition's content: text, or component elements. */
  private repetition(key: string, rep: RawRepetition): string {
    const components = rep.components;
    const type = this.typeOf(key);
    if (type === undefined) {
      const count = extent(components, hasValue);
      if (count > 1) {
        fail(
          XML_ERROR_CODES.DATA_TYPE_UNKNOWN,
          "A composite field has no data type to name its components.",
          key,
        );
      }
      return count === 0 ? "" : this.component(key, components[0] as RawComponent);
    }
    let out = "";
    for (const [c, component] of components.entries()) {
      if (!hasValue(component)) continue;
      const name = `${type}.${String(c + 1)}`;
      out += `<${name}>${this.component(name, component)}</${name}>`;
    }
    return out;
  }

  /**
   * A component's content: text, or subcomponent elements. For the one value of an untyped field
   * `key` is the field's own, which has no type, so the value is written as text.
   */
  private component(key: string, component: RawComponent): string {
    const subs = component.subcomponents;
    const type = this.typeOf(key);
    if (type === undefined) {
      if (extent(subs, isFilled) > 1) {
        fail(
          XML_ERROR_CODES.DATA_TYPE_UNKNOWN,
          "A composite has no data type to name its subcomponents.",
          key,
        );
      }
      return this.value(component, 0, key);
    }
    let out = "";
    for (const [s, sub] of subs.entries()) {
      if (sub === "") continue;
      const name = `${type}.${String(s + 1)}`;
      out += `<${name}>${this.value(component, s, name)}</${name}>`;
    }
    return out;
  }

  /** One subcomponent's text, refused when the XML encoding cannot carry it as we know it. */
  private value(component: RawComponent, index: number, key: string): string {
    if (component.rawSubcomponents?.[index] !== undefined) {
      fail(
        XML_ERROR_CODES.ESCAPE_NOT_SUPPORTED,
        "A value carries a formatting, hex or other escape sequence the XML writer cannot express.",
        key,
      );
    }
    const text = component.subcomponents[index] as string;
    if (text.includes(this.enc.escape)) {
      fail(
        XML_ERROR_CODES.ESCAPE_NOT_SUPPORTED,
        "A value holds the message's escape character.",
        key,
      );
    }
    if (forbiddenCharacterAt(text) !== -1) {
      fail(
        XML_ERROR_CODES.FORBIDDEN_CHARACTER,
        "A value holds a character XML 1.0 does not allow.",
        key,
      );
    }
    return escapeText(text);
  }
}

/** The root element's name: the `structure` option, else what MSH-9 gives. */
function structureName(message: Hl7Message, option: string | undefined): string {
  if (option !== undefined) {
    if (!isXmlName(option)) {
      fail(XML_ERROR_CODES.INVALID_OPTIONS, "The structure name is not an XML name.");
    }
    return option;
  }
  const structure = message.get("MSH.9.3") ?? "";
  const code =
    message.get("MSH.9.1") ??
    // Stryker disable next-line StringLiteral: with no MSH-9.1 the name is empty or starts with "_", and the mutant's text holds a space, so isXmlName refuses either way with the same error
    "";
  const trigger = message.get("MSH.9.2") ?? "";
  const name = structure !== "" ? structure : trigger !== "" ? `${code}_${trigger}` : code;
  if (!isXmlName(name)) {
    fail(
      XML_ERROR_CODES.STRUCTURE_UNKNOWN,
      "No message structure name can be taken from MSH-9; pass `structure`.",
    );
  }
  return name;
}

/**
 * Write a message in the HL7 v2 XML encoding: a root element named for the message structure,
 * one element per segment, `SEG.n` for each field (repeated once per repetition), and each
 * composite's components and subcomponents named for its data type (`XPN.1`, `FN.1`). MSH.1 and
 * MSH.2 carry the message's delimiters; a field that is the explicit null is written `""`. Values
 * are written decoded: a `|` in a value is a `|` in the text, a line break is `&#10;`.
 *
 * The data types come from `options.dataTypes`, because the model does not carry them; a
 * composite with no type there is refused with `DATA_TYPE_UNKNOWN`. Segments are written in
 * order directly under the root: group elements are not written, so a receiver that validates
 * against a schema with groups will not accept the document as it stands. A value holding the
 * escape character, or carrying a formatting or hex escape sequence, is refused with
 * `ESCAPE_NOT_SUPPORTED`, since we have not confirmed how the XML encoding writes those. An empty
 * field is left out, except that a segment ending in empty fields gets one empty element at its
 * last position (`<PID.3/>`), so it reads back with the same field count. A message holding a
 * second MSH is refused, since one document is one message.
 *
 * `parseHL7Xml` reads the result back to the same model.
 *
 * @param message The message.
 * @param options The data types, the root element's name and its namespace.
 * @returns The document, with an XML declaration, UTF-8, and a trailing line break.
 * @throws {Hl7XmlError} When the message cannot be written without guessing.
 * @example
 * ```ts
 * import { parseHL7, toHl7Xml } from "@cosyte/hl7";
 * const msg = parseHL7("MSH|^~\\&|LAB||||20260101||ACK^R01^ACK|1|P|2.6\rMSA|AA|1\r");
 * toHl7Xml(msg, { dataTypes: { "MSH.9": "MSG", "MSH.11": "PT", "MSH.12": "VID" } });
 * ```
 */
export function toHl7Xml(message: Hl7Message, options: ToHl7XmlOptions = {}): string {
  const root = structureName(message, options.structure);
  const namespace = options.namespace === undefined ? V2_XML_NAMESPACE : options.namespace;
  const writer = new XmlWriter(message.encodingCharacters, options.dataTypes);
  let out = '<?xml version="1.0" encoding="UTF-8"?>\n';
  out +=
    namespace === null
      ? `<${root}>\n`
      : `<${root} xmlns="${escapeText(namespace).replace(/"/gu, "&quot;")}">\n`;
  for (const seg of message.rawSegments) out += `  ${writer.segment(seg)}\n`;
  return `${out}</${root}>\n`;
}
