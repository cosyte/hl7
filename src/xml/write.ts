/**
 * The HL7 v2 XML encoding writer: a parsed or built `Hl7Message` written as a v2 XML document,
 * its segments placed in the message structure's group elements, one segment element per line.
 */

import { decodeWindows1252, resolveCharset } from "../parser/charset.js";
import { findMessageStructureDefinition } from "../parser/message-structure.js";
import { WITHHELD } from "../parser/tokens.js";
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
import {
  groupTable,
  placeSegments,
  resolveStructure,
  type PlacedGroup,
  type XmlMessageStructure,
} from "./groups.js";
import { V2_XML_NAMESPACE, isFormattingEscape, isSegmentId } from "./read.js";

/**
 * Options for `toHl7Xml`.
 *
 * @example
 * ```ts
 * import type { ToHl7XmlOptions } from "@cosyte/hl7";
 * const options: ToHl7XmlOptions = {
 *   dataTypes: { "PID.5": "XPN", "XPN.1": "FN", "NTE.3": "FT" },
 *   namespace: null,
 *   groups: "none",
 * };
 * ```
 */
export interface ToHl7XmlOptions {
  /**
   * The data type of each field and component the message carries, which names its child
   * elements: a field key (`PID.5`) to its type (`XPN`), whose components are written `XPN.1`,
   * `XPN.2`, and a component key (`XPN.1`) to its type (`FN`), whose subcomponents are written
   * `FN.1`, `FN.2`. A map or a function from key to type. `xmlDataTypes` reads the composite
   * ones from a sample document.
   *
   * A field or component with a composite type is written with child elements, even when it
   * holds one value, as the encoding requires. One with a primitive type (`ST`, `TX`, `FT`, `NM`,
   * `ID`, `IS`, `SI`, `DT`, `DTM`, `TM`, `GTS`, `SNM`) or none is written as text when it holds
   * one value, and refused with `DATA_TYPE_UNKNOWN` when it holds more, because its child
   * elements cannot be named. Only a value typed `TX` or `FT` may carry formatting escapes.
   */
  readonly dataTypes?: Readonly<Record<string, string>> | ((key: string) => string | undefined);
  /**
   * The root element's name, the message structure (`ORU_R01`). Defaults to the structure in
   * `groups`, else MSH-9.3, else the structure our message structure registry gives MSH-9.1 and
   * MSH-9.2 (`ADT^A04` is `ADT_A01`).
   */
  readonly structure?: string;
  /**
   * The root element's default namespace: `urn:hl7-org:v2xml` by default, `null` for none (some
   * networks ask for none).
   */
  readonly namespace?: string | null;
  /**
   * The message structure whose groups the segments are placed in, for a structure
   * `XML_GROUP_TABLES` does not cover (a partner's schema gives it), or `"none"` to write every
   * segment directly under the root, for a structure with no groups or a receiver that asks for
   * none. By default the writer takes the structure from `XML_GROUP_TABLES` for the message's
   * version and refuses one it does not cover with `GROUPS_UNKNOWN`.
   */
  readonly groups?: XmlMessageStructure | "none";
}

/**
 * Whether `type` is a primitive data type: a value of one is text, never child elements. HL7 v2
 * chapter 2A lists them; `TS` and `TN` were primitives in early versions, so they are left out.
 */
function isPrimitive(type: string): boolean {
  return ["DT", "DTM", "FT", "GTS", "ID", "IS", "NM", "SI", "SNM", "ST", "TM", "TX"].includes(type);
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

/**
 * A hex escape's bytes decoded in character set `charset`, a canonical MSH-18 code, or
 * `undefined` when the set is not one we decode or the bytes are not text in it.
 */
function decodeBytes(bytes: Uint8Array, charset: string, key: string): string | undefined {
  if (charset === "8859/1") return String.fromCharCode(...bytes);
  if (charset === "ASCII") {
    return bytes.every((b) => b < 0x80) ? String.fromCharCode(...bytes) : undefined;
  }
  if (charset === "WINDOWS-1252") return decodeWindows1252(bytes);
  if (charset !== "UTF-8") return undefined;
  try {
    return new TextDecoder("utf-8", { fatal: true }).decode(bytes);
  } catch {
    fail(XML_ERROR_CODES.ESCAPE_NOT_SUPPORTED, "A hex escape's bytes are not UTF-8.", key);
  }
}

/** Writes one message. */
class XmlWriter {
  private readonly enc: EncodingCharacters;
  private readonly lookup: (key: string) => string | undefined;
  /** MSH-18, the character set a hex escape's bytes are decoded in. */
  private readonly charset: string | undefined;

  public constructor(
    enc: EncodingCharacters,
    dataTypes: ToHl7XmlOptions["dataTypes"],
    charset: string | undefined,
  ) {
    this.enc = enc;
    this.charset = charset;
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
   * a segment, which the reader would refuse.
   */
  private typeOf(key: string): string | undefined {
    const type = this.lookup(key);
    if (type !== undefined) {
      if (type.match(/^[A-Za-z][A-Za-z0-9_]*$/u) === null) {
        fail(XML_ERROR_CODES.INVALID_OPTIONS, "A data type is not an XML name.", key);
      }
      if (type === this.segmentName || isSegmentId(type)) {
        fail(XML_ERROR_CODES.INVALID_OPTIONS, "A data type is named for a segment.", key);
      }
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
    if (type === undefined || isPrimitive(type)) {
      const count = extent(components, hasValue);
      if (count > 1) {
        fail(
          XML_ERROR_CODES.DATA_TYPE_UNKNOWN,
          type === undefined
            ? "A composite field has no data type to name its components."
            : "A field given a primitive data type holds components.",
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
   * A component's content: text, or subcomponent elements. For the one value of a field with no
   * composite type `key` is the field's own, so the value is written as text.
   */
  private component(key: string, component: RawComponent): string {
    const subs = component.subcomponents;
    const type = this.typeOf(key);
    if (type === undefined || isPrimitive(type)) {
      if (extent(subs, isFilled) > 1) {
        fail(
          XML_ERROR_CODES.DATA_TYPE_UNKNOWN,
          type === undefined
            ? "A composite has no data type to name its subcomponents."
            : "A component given a primitive data type holds subcomponents.",
          key,
        );
      }
      return this.value(component, 0, key, type);
    }
    let out = "";
    for (const [s, sub] of subs.entries()) {
      if (sub === "") continue;
      const name = `${type}.${String(s + 1)}`;
      out += `<${name}>${this.value(component, s, name, this.typeOf(name))}</${name}>`;
    }
    return out;
  }

  /**
   * One subcomponent's content. Its pipe text, where the model kept it, is read sequence by
   * sequence; otherwise its decoded text is written. `type` says whether formatting escapes may
   * stand in it as `escape` elements: only in `TX` and `FT`.
   */
  private value(
    component: RawComponent,
    index: number,
    key: string,
    type: string | undefined,
  ): string {
    const formatted = type === "TX" || type === "FT";
    const raw = component.rawSubcomponents?.[index];
    if (raw === undefined)
      return this.text(component.subcomponents[index] as string, key, formatted);
    const esc = this.enc.escape;
    let out = "";
    let from = 0;
    let open = raw.indexOf(esc);
    while (open !== -1) {
      const close = raw.indexOf(esc, open + 1);
      if (close === -1) {
        fail(
          XML_ERROR_CODES.ESCAPE_NOT_SUPPORTED,
          "A value holds the message's escape character.",
          key,
        );
      }
      out += this.text(raw.slice(from, open), key, formatted);
      out += this.sequence(raw.slice(open + 1, close), key, formatted);
      from = close + 1;
      open = raw.indexOf(esc, from);
    }
    return out + this.text(raw.slice(from), key, formatted);
  }

  /** One escape sequence of a value's pipe text, as the v2 XML encoding writes it. */
  private sequence(seq: string, key: string, formatted: boolean): string {
    const enc = this.enc;
    // The delimiter escapes are not needed in XML: the delimiter is written as itself.
    const delimiter =
      seq === "F"
        ? enc.field
        : seq === "S"
          ? enc.component
          : seq === "T"
            ? enc.subcomponent
            : seq === "R"
              ? enc.repetition
              : seq === "P"
                ? (enc.truncation ?? "#")
                : undefined;
    if (delimiter !== undefined) return escapeText(delimiter);
    if (seq === "E") {
      fail(
        XML_ERROR_CODES.ESCAPE_NOT_SUPPORTED,
        "A value holds the message's escape character.",
        key,
      );
    }
    if (isFormattingEscape(seq)) {
      if (formatted) return `<escape V="${seq}"/>`;
      if (seq === ".br") return "&#10;";
      fail(
        XML_ERROR_CODES.ESCAPE_NOT_SUPPORTED,
        "A formatting escape stands in a value whose data type is not TX or FT.",
        key,
      );
    }
    if (/^X(?:[0-9A-Fa-f]{2})+$/u.test(seq)) return this.hex(seq.slice(1), key);
    fail(
      XML_ERROR_CODES.ESCAPE_NOT_SUPPORTED,
      "A value carries a character set, vendor or unknown escape sequence.",
      key,
    );
  }

  /**
   * A hex escape's bytes as character references, decoded in the message's character set (MSH-18,
   * ASCII when blank): the v2 XML encoding writes a character reference where the pipe form has a
   * hex escape.
   */
  private hex(digits: string, key: string): string {
    const bytes = Uint8Array.from(digits.match(/../gu) as string[], (pair) =>
      Number.parseInt(pair, 16),
    );
    const text = decodeBytes(bytes, resolveCharset(this.charset).canonical, key);
    if (text === undefined) {
      fail(
        XML_ERROR_CODES.ESCAPE_NOT_SUPPORTED,
        "A hex escape's bytes are not text in the message's character set.",
        key,
      );
    }
    // The escape character, which the reader would refuse, and characters XML forbids.
    this.check(text, key);
    let out = "";
    for (const ch of text) out += `&#x${(ch.codePointAt(0) as number).toString(16)};`;
    return out;
  }

  /** Decoded text, refused when it holds the escape character or a character XML forbids. */
  private text(text: string, key: string, formatted: boolean): string {
    this.check(text, key);
    return formatted
      ? text.split("\n").map(escapeText).join('<escape V=".br"/>')
      : escapeText(text);
  }

  /** Refuse decoded text holding the escape character or a character XML forbids. */
  private check(text: string, key: string): void {
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
  }
}

/** The structure name to echo in an error: a message structure id's shape, or nothing. */
function safeStructure(name: string): string | undefined {
  return /^[A-Z][A-Z0-9]{2}_[A-Z0-9]{3}$/u.exec(name)?.[0];
}

/**
 * The root element's name: the `structure` option, else the structure `groups` gives, else
 * MSH-9.3, else the structure our registry maps MSH-9.1 and MSH-9.2 to.
 */
function structureName(message: Hl7Message, options: ToHl7XmlOptions): string {
  const groups = typeof options.groups === "object" ? resolveStructure(options.groups) : undefined;
  const option = options.structure;
  if (option !== undefined) {
    if (!isXmlName(option)) {
      fail(XML_ERROR_CODES.INVALID_OPTIONS, "The structure name is not an XML name.");
    }
    if (groups !== undefined && groups.root !== option) {
      fail(
        XML_ERROR_CODES.INVALID_OPTIONS,
        "The structure option names another root than `groups`.",
      );
    }
    return option;
  }
  if (groups !== undefined) return groups.root;
  const structure = message.get("MSH.9.3") ?? "";
  if (structure !== "") {
    if (!isXmlName(structure)) {
      fail(XML_ERROR_CODES.STRUCTURE_UNKNOWN, "MSH-9.3 is not an XML name; pass `structure`.");
    }
    return structure;
  }
  // Stryker disable next-line StringLiteral: with no MSH-9.1 no definition matches the empty code or the mutant's text, so the refusal is the same
  const code = message.get("MSH.9.1") ?? "";
  const trigger = message.get("MSH.9.2") ?? "";
  const known = findMessageStructureDefinition(code, trigger)?.structureId ?? "";
  if (known === "") {
    fail(
      XML_ERROR_CODES.STRUCTURE_UNKNOWN,
      "No message structure can be taken from MSH-9; pass `structure`.",
    );
  }
  return known;
}

/** The segments, placed in the groups the options or the tables give. */
function placed(
  message: Hl7Message,
  root: string,
  groups: ToHl7XmlOptions["groups"],
): readonly (RawSegment | PlacedGroup)[] {
  if (groups === "none") return message.rawSegments;
  if (groups !== undefined)
    return placeSegments(resolveStructure(groups).items, message.rawSegments);
  const version = message.version;
  const table = groupTable(version, root);
  if (table === undefined) {
    const name = safeStructure(root) ?? "this message structure";
    const label = version === "" || version === WITHHELD ? "its version" : `v${version}`;
    fail(
      XML_ERROR_CODES.GROUPS_UNKNOWN,
      `No group table covers ${name} in ${label}; pass \`groups\`.`,
    );
  }
  return placeSegments(resolveStructure(table).items, message.rawSegments);
}

/**
 * Write a message in the HL7 v2 XML encoding: a root element named for the message structure,
 * an element for each segment group (`ORU_R01.PATIENT_RESULT`), one element per segment, `SEG.n`
 * for each field (repeated once per repetition), and each composite's components and
 * subcomponents named for its data type (`XPN.1`, `FN.1`). MSH.1 and MSH.2 carry the message's
 * delimiters; a field that is the explicit null is written `""`. Values are written decoded: a
 * `|` in a value is a `|` in the text, a line break is `&#10;`.
 *
 * Groups: the segments are placed in the groups of the message structure, taken from
 * `XML_GROUP_TABLES` for the message's version or from `options.groups`, and refused with
 * `STRUCTURE_MISMATCH` when they do not fit it. A structure the tables do not cover is refused
 * with `GROUPS_UNKNOWN`; `groups: "none"` writes the segments directly under the root.
 *
 * Data types come from `options.dataTypes`, because the model does not carry them; a composite
 * with no type there is refused with `DATA_TYPE_UNKNOWN`. In a value typed `TX` or `FT`, a
 * formatting escape (`\H\`, `\.br\`, `\.in+4\`) is written as an `escape` element
 * (`<escape V="H"/>`); in any other it is refused with `ESCAPE_NOT_SUPPORTED`, except a line break.
 * A hex escape is written as character references, its bytes decoded in MSH-18's character set
 * (ASCII, UTF-8, 8859/1 or Windows-1252). The escape character itself in a value, and a character
 * set or vendor escape, are refused with `ESCAPE_NOT_SUPPORTED`. An empty field is left out,
 * except that a segment ending in empty fields gets one empty element at its last position
 * (`<PID.3/>`), so it reads back with the same field count. A message holding a second MSH is
 * refused, since one document is one message.
 *
 * `parseHL7Xml` reads the result back to the same model.
 *
 * @param message The message.
 * @param options The data types, the root element's name, its namespace and the groups.
 * @returns The document, with an XML declaration, UTF-8, and a trailing line break.
 * @throws {Hl7XmlError} When the message cannot be written without guessing.
 * @example
 * ```ts
 * import { parseHL7, toHl7Xml } from "@cosyte/hl7";
 * const msg = parseHL7("MSH|^~\\&|LAB||||20260101||ACK^R01^ACK|1|P|2.6\rMSA|AA|1\r");
 * toHl7Xml(msg, {
 *   dataTypes: { "MSH.9": "MSG", "MSH.11": "PT", "MSH.12": "VID" },
 *   groups: "none",
 * });
 * ```
 */
export function toHl7Xml(message: Hl7Message, options: ToHl7XmlOptions = {}): string {
  const root = structureName(message, options);
  const segments = placed(message, root, options.groups);
  const namespace = options.namespace === undefined ? V2_XML_NAMESPACE : options.namespace;
  const writer = new XmlWriter(
    message.encodingCharacters,
    options.dataTypes,
    message.get("MSH.18"),
  );
  let out = '<?xml version="1.0" encoding="UTF-8"?>\n';
  out +=
    namespace === null
      ? `<${root}>\n`
      : `<${root} xmlns="${escapeText(namespace).replace(/"/gu, "&quot;")}">\n`;
  const write = (items: readonly (RawSegment | PlacedGroup)[], indent: string): void => {
    for (const item of items) {
      if ("children" in item) {
        out += `${indent}<${item.name}>\n`;
        write(item.children, `${indent}  `);
        out += `${indent}</${item.name}>\n`;
      } else {
        out += `${indent}${writer.segment(item)}\n`;
      }
    }
  };
  write(segments, "  ");
  return `${out}</${root}>\n`;
}
