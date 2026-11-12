/**
 * The HL7 v2 XML encoding reader: one hardened pass over the document that writes the same
 * message in the pipe-delimited encoding, which `parseHL7` then reads. The message a caller gets
 * is the model the pipe-delimited parser builds, lazy by default, with the same warnings.
 *
 * The pass builds no DOM. It holds a stack of the open elements and the text of the segment it is
 * in, so the document is read once and only the pipe text outlives it.
 *
 * Hardening, the same rules our C-CDA reader applies: no DTD and no entity declarations, no entity
 * reference beyond the five XML predefines, characters XML 1.0 forbids refused, and caps on the
 * document's size, nesting depth and element count.
 */

import { Buffer } from "node:buffer";

import { readDelimiters } from "../parser/delimiters.js";
import { KNOWN_SEGMENTS } from "../parser/known-segments.js";
import { reescape } from "../parser/escapes.js";
import { parseHL7 } from "../parser/index.js";
import type { EncodingCharacters, ParseOptions } from "../parser/types.js";
import type { Hl7Message } from "../model/message.js";

import { forbiddenCharacterAt } from "./chars.js";
import { Hl7XmlError, XML_ERROR_CODES, safePath, type XmlErrorCode } from "./errors.js";

/**
 * Caps on what the XML reader accepts. Each is optional and falls back to
 * {@link DEFAULT_XML_LIMITS}. A cap that is given must be a number: NaN or a value of another
 * type is refused with `INVALID_OPTIONS`, and `Infinity` lifts the cap.
 *
 * @example
 * ```ts
 * import type { XmlLimits } from "@cosyte/hl7";
 * const limits: XmlLimits = { maxInputBytes: 5_000_000 };
 * ```
 */
export interface XmlLimits {
  /** The largest document, in UTF-8 bytes. */
  readonly maxInputBytes?: number;
  /** The deepest nesting of elements, the root counted as one. */
  readonly maxDepth?: number;
  /** The most elements, each empty position a skipped-over element names counted as one. */
  readonly maxElements?: number;
}

/**
 * The reader's default caps: 30,000,000 bytes, a depth of 64 and 1,000,000 elements. A v2 XML
 * message nests a root, its groups, a segment, a field, a component and a subcomponent, so a
 * depth of 64 leaves room for deep group nesting and still stops pathological input early.
 *
 * @example
 * ```ts
 * import { DEFAULT_XML_LIMITS } from "@cosyte/hl7";
 * console.log(DEFAULT_XML_LIMITS.maxDepth); // 64
 * ```
 */
// Stryker disable next-line all: a module constant, evaluated once when the test runner loads the module, so a mutant of it is never live; tests pin each default
export const DEFAULT_XML_LIMITS: Readonly<Required<XmlLimits>> = Object.freeze({
  maxInputBytes: 30_000_000,
  maxDepth: 64,
  maxElements: 1_000_000,
});

/**
 * Options for `parseHL7Xml`: every `parseHL7` option, applied to the message as it reads the
 * pipe-delimited form, plus the XML reader's caps.
 *
 * @example
 * ```ts
 * import type { ParseHl7XmlOptions } from "@cosyte/hl7";
 * const options: ParseHl7XmlOptions = { strict: true, limits: { maxDepth: 32 } };
 * ```
 */
export interface ParseHl7XmlOptions extends ParseOptions {
  /** Caps on the document; see {@link XmlLimits}. */
  readonly limits?: XmlLimits;
}

/**
 * Options for `xmlDataTypes`.
 *
 * @example
 * ```ts
 * import type { XmlDataTypesOptions } from "@cosyte/hl7";
 * const options: XmlDataTypesOptions = { limits: { maxElements: 10_000 } };
 * ```
 */
export interface XmlDataTypesOptions {
  /** Caps on the document; see {@link XmlLimits}. */
  readonly limits?: XmlLimits;
}

/**
 * The namespace HL7 gives the v2 XML encoding. The reader accepts it, as the default namespace or
 * through a prefix, or no namespace; the writer declares it as the default unless told not to.
 *
 * @example
 * ```ts
 * import { V2_XML_NAMESPACE } from "@cosyte/hl7";
 * console.log(V2_XML_NAMESPACE); // "urn:hl7-org:v2xml"
 * ```
 */
// Stryker disable next-line all: a module constant, evaluated once when the test runner loads the module, so a mutant of it is never live; a test pins the value
export const V2_XML_NAMESPACE = "urn:hl7-org:v2xml";

/** A root or group element: it holds segments and groups. */
interface ContainerFrame {
  readonly kind: "container";
  readonly name: string;
}

/**
 * A segment element. `parts` is its pipe text by field: the segment id first, then each field at
 * its position (MSH.2 and on one place earlier, since MSH.1 is the separator itself).
 */
interface SegmentFrame {
  readonly kind: "segment";
  readonly name: string;
  readonly parts: string[];
  lastPos: number;
}

/**
 * A field element: text, or component elements gathered in `parts` from position 1. `pipe` is the
 * pipe text of what came before the last `escape` element, and `text` the text after it.
 */
interface FieldFrame {
  readonly kind: "field";
  readonly name: string;
  readonly segment: SegmentFrame;
  readonly pos: number;
  pipe: string;
  text: string;
  parts: string[] | undefined;
  lastPart: number;
  /** The data type its first component is named for; every later one must name the same. */
  partType: string | undefined;
}

/** A component element: text, or subcomponent elements gathered in `parts` from position 1. */
interface ComponentFrame {
  readonly kind: "component";
  readonly name: string;
  readonly field: FieldFrame;
  readonly pos: number;
  pipe: string;
  text: string;
  parts: string[] | undefined;
  lastPart: number;
  /** The data type its first subcomponent is named for; every later one must name the same. */
  partType: string | undefined;
}

/** A subcomponent element: text and `escape` elements only. */
interface SubcomponentFrame {
  readonly kind: "subcomponent";
  readonly name: string;
  readonly component: ComponentFrame;
  readonly pos: number;
  pipe: string;
  text: string;
  readonly parts?: undefined;
}

/** An `escape` element, already written to its value's pipe text: it holds nothing. */
interface EscapeFrame {
  readonly kind: "escape";
  readonly parts?: undefined;
}

type Frame =
  ContainerFrame | SegmentFrame | FieldFrame | ComponentFrame | SubcomponentFrame | EscapeFrame;

/** A value element, which may hold text and `escape` elements. */
type ValueFrame = FieldFrame | ComponentFrame | SubcomponentFrame;

/** Called with each data type the document names: `PID.5` to `XPN`, `XPN.1` to `FN`. */
type TypeSink = (key: string, type: string) => void;

/**
 * Whether `code` is the `V` of an `escape` element the reader accepts: a formatting escape, which
 * is highlighting (`H`, `N`) or a formatting command (`.br`, `.sp`, `.in+4`). The v2 XML encoding
 * writes these as `escape` elements; the delimiter escapes are plain characters there, and hex
 * escapes are character references.
 *
 * @internal
 */
export function isFormattingEscape(code: string): boolean {
  return /^(?:H|N|\.(?:br|sp|in|ti|sk|ce|fi|nf)(?:[+-]?[0-9]{1,3})?)$/u.test(code);
}

/** Whether `name` is a segment element: a three-character segment id. */
function isSegmentName(name: string): boolean {
  return /^[A-Z][A-Z0-9]{2}$/u.test(name);
}

/** Whether `name` is a group element: a structure name, a dot and a group name. */
function isGroupName(name: string): boolean {
  return /^[A-Za-z][A-Za-z0-9_]*\.[A-Za-z_][A-Za-z0-9_]*$/u.test(name);
}

/**
 * Whether a name is a segment id rather than a data type: a segment we know, or a Z-segment. No
 * HL7 data type shares a name with a segment.
 *
 * @internal
 */
export function isSegmentId(prefix: string): boolean {
  return KNOWN_SEGMENTS.has(prefix) || /^Z[A-Z0-9]{2}$/u.test(prefix);
}

/** A positional element's name split: a segment id or data type, and a position from 1 to 999. */
function positionOf(name: string): { readonly prefix: string; readonly pos: number } | undefined {
  const match = /^([A-Za-z][A-Za-z0-9_]*)\.([1-9][0-9]{0,2})$/u.exec(name);
  return match === null ? undefined : { prefix: match[1] as string, pos: Number(match[2]) };
}

/** Whether `text` is XML whitespace only. */
function isWhitespace(text: string): boolean {
  return /^[ \t\r\n]*$/u.test(text);
}

/** The text one of the five XML predefined entities stands for. */
function predefinedEntity(name: string): string | undefined {
  switch (name) {
    case "amp":
      return "&";
    case "lt":
      return "<";
    case "gt":
      return ">";
    case "quot":
      return '"';
    case "apos":
      return "'";
  }
  return undefined;
}

/** Whether `code` is a character XML 1.0 allows. */
function isXmlChar(code: number): boolean {
  return (
    code === 0x9 ||
    code === 0xa ||
    code === 0xd ||
    (code >= 0x20 && code <= 0xd7ff) ||
    (code >= 0xe000 && code <= 0xfffd) ||
    (code >= 0x10000 && code <= 0x10ffff)
  );
}

/**
 * One resolved cap: the default when `value` is absent. A value that is not a number, or is NaN,
 * is refused: every cap check is a comparison, and NaN would turn the cap off.
 */
function resolveLimit(key: keyof XmlLimits, value: unknown): number {
  if (value === undefined) return DEFAULT_XML_LIMITS[key];
  if (typeof value !== "number" || Number.isNaN(value)) {
    throw new Hl7XmlError(XML_ERROR_CODES.INVALID_OPTIONS, `The limit ${key} is not a number.`);
  }
  return value;
}

/** The resolved caps. */
function resolveLimits(limits: XmlLimits | undefined): Required<XmlLimits> {
  return {
    maxInputBytes: resolveLimit("maxInputBytes", limits?.maxInputBytes),
    maxDepth: resolveLimit("maxDepth", limits?.maxDepth),
    maxElements: resolveLimit("maxElements", limits?.maxElements),
  };
}

/**
 * One pass over a v2 XML document, writing its pipe-delimited form. Construct, call `run`, read
 * the result.
 */
class XmlToPipe {
  private readonly src: string;
  private readonly limits: Required<XmlLimits>;
  private readonly onType: TypeSink | undefined;
  private readonly stack: Frame[] = [];
  /** The name each open element was written with, prefix included, to match its end tag. */
  private readonly tags: string[] = [];
  /** The namespace prefixes in scope at each open element. */
  private readonly scopes: ReadonlyMap<string, string>[] = [];
  private readonly segments: string[] = [];
  private pos = 0;
  private elements = 0;
  private rootSeen = false;
  private enc: EncodingCharacters | undefined;
  // Set when MSH.1 closes, which `openField` makes the first field of MSH, so MSH.2 always
  // finds it set.
  private msh1!: string;

  public constructor(src: string, limits: Required<XmlLimits>, onType: TypeSink | undefined) {
    this.src = src;
    this.limits = limits;
    this.onType = onType;
  }

  /** Refuse at the current offset. */
  private fail(code: XmlErrorCode, message: string, path?: string, at = this.pos): never {
    throw new Hl7XmlError(code, message, at, safePath(path));
  }

  /** Read the whole document and return its pipe-delimited form. */
  public run(): string {
    const src = this.src;
    if (Buffer.byteLength(src) > this.limits.maxInputBytes) {
      this.fail(XML_ERROR_CODES.INPUT_TOO_LARGE, "The document is larger than the limit.");
    }
    const forbidden = forbiddenCharacterAt(src);
    if (forbidden !== -1) {
      this.fail(
        XML_ERROR_CODES.FORBIDDEN_CHARACTER,
        "The document holds a character XML 1.0 does not allow.",
        undefined,
        forbidden,
      );
    }
    this.pos = src.startsWith(String.fromCharCode(0xfeff)) ? 1 : 0;
    for (;;) {
      const lt = src.indexOf("<", this.pos);
      const end = lt === -1 ? src.length : lt;
      this.text(src.slice(this.pos, end), true);
      if (lt === -1) break;
      this.pos = lt;
      this.markup();
    }
    if (this.tags.length > 0) {
      this.fail(XML_ERROR_CODES.NOT_WELL_FORMED, "The document ends inside an element.");
    }
    if (!this.rootSeen) {
      this.fail(XML_ERROR_CODES.NOT_WELL_FORMED, "The document has no root element.");
    }
    if (this.segments.length === 0) {
      this.fail(XML_ERROR_CODES.INVALID_ENCODING_CHARACTERS, "The document holds no MSH segment.");
    }
    return this.segments.join("\r") + "\r";
  }

  /** Read the markup at `this.pos`, which is a `<`. */
  private markup(): void {
    const src = this.src;
    const at = this.pos;
    if (src.startsWith("<!--", at)) {
      this.pos = this.after("-->", at + 4);
      return;
    }
    if (src.startsWith("<![CDATA[", at)) {
      const close = src.indexOf("]]>", at + 9);
      if (close === -1) this.fail(XML_ERROR_CODES.NOT_WELL_FORMED, "A CDATA section does not end.");
      this.text(src.slice(at + 9, close), false);
      this.pos = close + 3;
      return;
    }
    if (src.startsWith("<!", at)) {
      if (src.startsWith("<!DOCTYPE", at) || src.startsWith("<!ENTITY", at)) {
        this.fail(XML_ERROR_CODES.DTD_NOT_ALLOWED, "The document declares a DTD or an entity.");
      }
      this.fail(
        XML_ERROR_CODES.NOT_WELL_FORMED,
        "The document holds a declaration XML does not allow here.",
      );
    }
    if (src.startsWith("<?", at)) {
      this.pos = this.after("?>", at + 2);
      return;
    }
    if (src.startsWith("</", at)) {
      this.pos = at + 2;
      const name = this.name();
      this.skipSpace();
      if (src.charAt(this.pos) !== ">") {
        this.fail(XML_ERROR_CODES.NOT_WELL_FORMED, "An end tag is not closed.");
      }
      this.pos++;
      this.endElement(name, at);
      return;
    }
    this.pos = at + 1;
    const name = this.name();
    const attributes = new Map<string, string>();
    for (;;) {
      const hadSpace = this.skipSpace();
      if (src.startsWith(">", this.pos)) {
        this.pos++;
        this.startElement(name, at, attributes);
        return;
      }
      if (src.startsWith("/>", this.pos)) {
        this.pos += 2;
        this.startElement(name, at, attributes);
        this.endElement(name, at);
        return;
      }
      if (!hadSpace) this.fail(XML_ERROR_CODES.NOT_WELL_FORMED, "A start tag is malformed.");
      this.attribute(attributes);
    }
  }

  /** The offset just past the next `terminator` at or after `from`. */
  private after(terminator: string, from: number): number {
    const close = this.src.indexOf(terminator, from);
    if (close === -1) {
      this.fail(XML_ERROR_CODES.NOT_WELL_FORMED, "A comment or instruction does not end.");
    }
    return close + terminator.length;
  }

  /** Skip XML whitespace; whether any was skipped. */
  private skipSpace(): boolean {
    const start = this.pos;
    const space = /[ \t\r\n]*/uy;
    space.lastIndex = start;
    space.test(this.src);
    this.pos = space.lastIndex;
    return this.pos > start;
  }

  /** Read a name: everything up to whitespace, `/`, `>`, `=`, `<` or the end. */
  private name(): string {
    const start = this.pos;
    const name = /[^ \t\r\n/>=<]*/uy;
    name.lastIndex = start;
    name.test(this.src);
    this.pos = name.lastIndex;
    if (this.pos === start) this.fail(XML_ERROR_CODES.NOT_WELL_FORMED, "A tag has no name.");
    return this.src.slice(start, this.pos);
  }

  /**
   * Read one attribute into `attributes`, refusing a name the element already has: XML allows an
   * attribute once per element, so a repeat is not well-formed, and keeping either value would be
   * a guess.
   */
  private attribute(attributes: Map<string, string>): void {
    const src = this.src;
    const start = this.pos;
    const name = this.name();
    if (attributes.has(name)) {
      this.fail(
        XML_ERROR_CODES.NOT_WELL_FORMED,
        "An element repeats an attribute.",
        undefined,
        start,
      );
    }
    this.skipSpace();
    if (src.charAt(this.pos) !== "=") {
      this.fail(XML_ERROR_CODES.NOT_WELL_FORMED, "An attribute has no value.");
    }
    this.pos++;
    this.skipSpace();
    const quote = src.charAt(this.pos);
    if (quote !== '"' && quote !== "'") {
      this.fail(XML_ERROR_CODES.NOT_WELL_FORMED, "An attribute value is not quoted.");
    }
    const close = src.indexOf(quote, this.pos + 1);
    if (close === -1) {
      this.fail(XML_ERROR_CODES.NOT_WELL_FORMED, "An attribute value does not end.");
    }
    const raw = src.slice(this.pos + 1, close);
    if (raw.includes("<")) {
      this.fail(XML_ERROR_CODES.NOT_WELL_FORMED, "An attribute value holds a '<'.");
    }
    const value = this.decode(raw, this.pos + 1);
    this.pos = close + 1;
    attributes.set(name, value);
  }

  /**
   * The local name of element `name`, after its namespace declarations in `attributes` are taken
   * into scope: refused when it is in a namespace other than the v2 XML one or none.
   */
  private localName(name: string, attributes: ReadonlyMap<string, string>, at: number): string {
    let scope = this.scopes.at(-1) ?? new Map<string, string>();
    for (const [attribute, value] of attributes) {
      if (attribute === "xmlns" && value !== "" && value !== V2_XML_NAMESPACE) {
        this.fail(
          XML_ERROR_CODES.NAMESPACE_NOT_SUPPORTED,
          "An element declares a default namespace other than the v2 XML one.",
          name,
          at,
        );
      }
      if (attribute.startsWith("xmlns:")) {
        scope = new Map(scope).set(attribute.slice(6), value);
      }
    }
    this.scopes.push(scope);
    this.tags.push(name);
    const colon = name.indexOf(":");
    if (colon === -1) return name;
    const local = name.slice(colon + 1);
    if (scope.get(name.slice(0, colon)) !== V2_XML_NAMESPACE || local.includes(":")) {
      this.fail(
        XML_ERROR_CODES.NAMESPACE_NOT_SUPPORTED,
        "An element's namespace prefix is not bound to the v2 XML namespace.",
        undefined,
        at,
      );
    }
    return local;
  }

  /**
   * Decode character data: line ends as XML reads them, then entity and character references.
   * `at` is the offset of `raw` in the document, for errors.
   */
  private decode(raw: string, at: number): string {
    const text = raw.replace(/\r\n?/gu, "\n");
    let out = "";
    let from = 0;
    for (;;) {
      const amp = text.indexOf("&", from);
      if (amp === -1) return out + text.slice(from);
      const semi = text.indexOf(";", amp);
      if (semi === -1) {
        this.fail(XML_ERROR_CODES.NOT_WELL_FORMED, "An '&' starts no reference.", undefined, at);
      }
      out += text.slice(from, amp) + this.reference(text.slice(amp + 1, semi), at);
      from = semi + 1;
    }
  }

  /** The text one reference stands for: a predefined entity or a character reference. */
  private reference(body: string, at: number): string {
    const predefined = predefinedEntity(body);
    if (predefined !== undefined) return predefined;
    let code: number;
    if (/^#[0-9]{1,7}$/u.test(body)) code = Number.parseInt(body.slice(1), 10);
    else if (/^#x[0-9A-Fa-f]{1,6}$/u.test(body)) code = Number.parseInt(body.slice(2), 16);
    else if (/^[A-Za-z_][A-Za-z0-9._-]*$/u.test(body)) {
      this.fail(
        XML_ERROR_CODES.ENTITY_NOT_ALLOWED,
        "The document references an entity.",
        undefined,
        at,
      );
    } else {
      this.fail(XML_ERROR_CODES.NOT_WELL_FORMED, "An '&' starts no reference.", undefined, at);
    }
    if (!isXmlChar(code)) {
      this.fail(
        XML_ERROR_CODES.FORBIDDEN_CHARACTER,
        "A character reference names a character XML 1.0 does not allow.",
        undefined,
        at,
      );
    }
    return String.fromCodePoint(code);
  }

  /** Character data at the current offset; `decode` is false for a CDATA section. */
  private text(raw: string, decode: boolean): void {
    const at = this.pos;
    const top = this.stack.at(-1);
    if (top === undefined || top.kind === "container" || top.kind === "segment") {
      if (isWhitespace(raw)) return;
      if (top === undefined) {
        this.fail(
          XML_ERROR_CODES.NOT_WELL_FORMED,
          "Text stands outside the root element.",
          undefined,
          at,
        );
      }
      this.fail(
        XML_ERROR_CODES.MIXED_CONTENT,
        "Text stands between segments or fields.",
        top.name,
        at,
      );
    }
    if (top.kind === "escape") {
      if (isWhitespace(raw)) return;
      this.fail(
        XML_ERROR_CODES.ESCAPE_NOT_SUPPORTED,
        "An escape element holds text.",
        undefined,
        at,
      );
    }
    if (top.parts !== undefined) {
      if (isWhitespace(raw)) return;
      this.fail(
        XML_ERROR_CODES.MIXED_CONTENT,
        "An element holds both text and elements.",
        top.name,
        at,
      );
    }
    top.text += decode ? this.decode(raw, at) : raw.replace(/\r\n?/gu, "\n");
  }

  /** Count `count` elements or empty positions against the cap. */
  private count(count: number, at: number): void {
    this.elements += count;
    if (this.elements > this.limits.maxElements) {
      this.fail(
        XML_ERROR_CODES.ELEMENT_LIMIT_EXCEEDED,
        "The document has more elements than the limit.",
        undefined,
        at,
      );
    }
  }

  /** An element opens. */
  private startElement(
    qualified: string,
    at: number,
    attributes: ReadonlyMap<string, string>,
  ): void {
    if (this.stack.length >= this.limits.maxDepth) {
      this.fail(
        XML_ERROR_CODES.DEPTH_LIMIT_EXCEEDED,
        "Elements nest deeper than the limit.",
        undefined,
        at,
      );
    }
    this.count(1, at);
    const name = this.localName(qualified, attributes, at);
    const top = this.stack.at(-1);
    if (top === undefined) {
      if (this.rootSeen) {
        this.fail(
          XML_ERROR_CODES.NOT_WELL_FORMED,
          "The document has two root elements.",
          undefined,
          at,
        );
      }
      this.rootSeen = true;
      this.stack.push({ kind: "container", name });
      return;
    }
    if (top.kind === "container") {
      this.openInContainer(name, at);
    } else if (top.kind === "segment") {
      this.openField(top, name, at);
    } else if (top.kind === "escape") {
      this.fail(
        XML_ERROR_CODES.ESCAPE_NOT_SUPPORTED,
        "An escape element holds an element.",
        undefined,
        at,
      );
    } else if (name === "escape") {
      this.openEscape(top, attributes, at);
    } else if (top.kind === "subcomponent") {
      this.fail(
        XML_ERROR_CODES.UNEXPECTED_ELEMENT,
        "An element nests below a subcomponent.",
        top.name,
        at,
      );
    } else {
      this.openPart(top, name, at);
    }
  }

  /**
   * An `escape` element opens in a value: its `V`, a formatting escape, joins the value's pipe
   * text between the message's escape characters, as `<escape V="H"/>` is `\H\`.
   */
  private openEscape(
    parent: ValueFrame,
    attributes: ReadonlyMap<string, string>,
    at: number,
  ): void {
    if (parent.kind === "field" && parent.segment.name === "MSH" && parent.pos <= 2) {
      this.fail(
        XML_ERROR_CODES.INVALID_ENCODING_CHARACTERS,
        "MSH.1 and MSH.2 hold text only.",
        parent.name,
        at,
      );
    }
    if (parent.parts !== undefined) {
      this.fail(
        XML_ERROR_CODES.MIXED_CONTENT,
        "An element holds both text and elements.",
        parent.name,
        at,
      );
    }
    // An absent V reads as "undefined", which is no formatting escape.
    const code = String(attributes.get("V"));
    if (!isFormattingEscape(code)) {
      this.fail(
        XML_ERROR_CODES.ESCAPE_NOT_SUPPORTED,
        "An escape element's V is not a formatting escape.",
        parent.name,
        at,
      );
    }
    const esc = (this.enc as EncodingCharacters).escape;
    parent.pipe += this.leaf(parent.text, parent.name, at) + esc + code + esc;
    parent.text = "";
    this.stack.push({ kind: "escape" });
  }

  /** A segment or group opens in the root or a group. */
  private openInContainer(name: string, at: number): void {
    if (isSegmentName(name)) {
      if (this.segments.length === 0 && name !== "MSH") {
        this.fail(
          XML_ERROR_CODES.INVALID_ENCODING_CHARACTERS,
          "The first segment is not MSH.",
          undefined,
          at,
        );
      }
      // One document is one message. A second MSH would set new delimiters for the segments
      // after it, which `parseHL7` reads with the first MSH's, so their values would be split
      // wrong without an error.
      if (this.segments.length > 0 && name === "MSH") {
        this.fail(
          XML_ERROR_CODES.UNEXPECTED_ELEMENT,
          "The document holds a second MSH segment.",
          undefined,
          at,
        );
      }
      this.stack.push({ kind: "segment", name, parts: [name], lastPos: 0 });
      return;
    }
    if (isGroupName(name)) {
      this.stack.push({ kind: "container", name });
      return;
    }
    this.fail(
      XML_ERROR_CODES.UNEXPECTED_ELEMENT,
      "An element in a message or group is not a segment or group.",
      undefined,
      at,
    );
  }

  /** A field opens in a segment. */
  private openField(segment: SegmentFrame, name: string, at: number): void {
    const position = positionOf(name);
    if (position?.prefix !== segment.name) {
      this.fail(
        XML_ERROR_CODES.UNEXPECTED_ELEMENT,
        "An element in a segment is not one of its fields.",
        name,
        at,
      );
    }
    const pos = position.pos;
    if (segment.name === "MSH") {
      const wanted = segment.lastPos < 2 ? segment.lastPos + 1 : undefined;
      if (wanted === undefined ? pos < 3 : pos !== wanted) {
        this.fail(
          XML_ERROR_CODES.INVALID_ENCODING_CHARACTERS,
          "MSH must open with MSH.1 and MSH.2, once each.",
          name,
          at,
        );
      }
    }
    if (pos < segment.lastPos) {
      this.fail(
        XML_ERROR_CODES.OUT_OF_ORDER,
        "A field comes before one it should follow.",
        name,
        at,
      );
    }
    this.count(Math.max(0, pos - segment.lastPos - 1), at);
    this.stack.push({
      kind: "field",
      name,
      segment,
      pos,
      pipe: "",
      text: "",
      parts: undefined,
      lastPart: 0,
      partType: undefined,
    });
  }

  /** A component opens in a field, or a subcomponent in a component. */
  private openPart(parent: FieldFrame | ComponentFrame, name: string, at: number): void {
    if (parent.kind === "field" && parent.segment.name === "MSH" && parent.pos <= 2) {
      this.fail(
        XML_ERROR_CODES.INVALID_ENCODING_CHARACTERS,
        "MSH.1 and MSH.2 hold text only.",
        parent.name,
        at,
      );
    }
    const position = positionOf(name);
    if (position === undefined) {
      this.fail(
        XML_ERROR_CODES.UNEXPECTED_ELEMENT,
        parent.kind === "field"
          ? "An element in a field is not a component."
          : "An element in a component is not a subcomponent.",
        parent.name,
        at,
      );
    }
    if (parent.parts === undefined) {
      if (!isWhitespace(parent.text) || parent.pipe !== "") {
        this.fail(
          XML_ERROR_CODES.MIXED_CONTENT,
          "An element holds both text and elements.",
          parent.name,
          at,
        );
      }
      parent.parts = [];
    }
    const segment = parent.kind === "field" ? parent.segment : parent.field.segment;
    if (position.prefix === segment.name || isSegmentId(position.prefix)) {
      this.fail(
        XML_ERROR_CODES.UNEXPECTED_ELEMENT,
        "A component or subcomponent is named for a segment, not a data type.",
        name,
        at,
      );
    }
    if (parent.partType !== undefined && parent.partType !== position.prefix) {
      this.fail(
        XML_ERROR_CODES.UNEXPECTED_ELEMENT,
        "The components or subcomponents of one value name two data types.",
        name,
        at,
      );
    }
    parent.partType = position.prefix;
    const pos = position.pos;
    if (pos <= parent.lastPart) {
      this.fail(
        XML_ERROR_CODES.OUT_OF_ORDER,
        "A component or subcomponent repeats or comes out of order.",
        name,
        at,
      );
    }
    this.count(pos - parent.lastPart - 1, at);
    parent.lastPart = pos;
    this.onType?.(parent.name, position.prefix);
    if (parent.kind === "field") {
      this.stack.push({
        kind: "component",
        name,
        field: parent,
        pos,
        pipe: "",
        text: "",
        parts: undefined,
        lastPart: 0,
        partType: undefined,
      });
    } else {
      this.stack.push({ kind: "subcomponent", name, component: parent, pos, pipe: "", text: "" });
    }
  }

  /** The pipe text of a leaf value: refused if it holds the escape character, else escaped. */
  private leaf(text: string, path: string, at: number): string {
    const enc = this.enc as EncodingCharacters;
    if (text.includes(enc.escape)) {
      this.fail(
        XML_ERROR_CODES.ESCAPE_NOT_SUPPORTED,
        "A value holds the message's escape character.",
        path,
        at,
      );
    }
    return reescape(text, enc);
  }

  /** An element closes. */
  private endElement(name: string, at: number): void {
    if (this.tags.pop() !== name) {
      this.fail(
        XML_ERROR_CODES.NOT_WELL_FORMED,
        "An end tag does not match its start tag.",
        undefined,
        at,
      );
    }
    this.scopes.pop();
    // `tags` and `stack` grow and shrink together, so a matched tag has its frame.
    const top = this.stack.pop() as Frame;
    // A container (the root or a group) and an escape have nothing to close, so they match none.
    if (top.kind === "segment") this.closeSegment(top, at);
    else if (top.kind === "field") this.closeField(top, at);
    else if (top.kind === "component") {
      (top.field.parts as string[])[top.pos - 1] =
        top.parts === undefined
          ? top.pipe + this.leaf(top.text, top.name, at)
          : top.parts.join((this.enc as EncodingCharacters).subcomponent);
    } else if (top.kind === "subcomponent") {
      (top.component.parts as string[])[top.pos - 1] = top.pipe + this.leaf(top.text, top.name, at);
    }
  }

  /** A field closes: its repetition joins the segment's text for that position. */
  private closeField(field: FieldFrame, at: number): void {
    const segment = field.segment;
    if (segment.name === "MSH" && field.pos <= 2) {
      this.closeDelimiters(field, at);
      return;
    }
    // MSH.1 and MSH.2 close before any other field can open (`openField` and
    // `openInContainer` see to it), so the delimiters are known here.
    const enc = this.enc as EncodingCharacters;
    const text =
      field.parts === undefined
        ? field.pipe + this.leaf(field.text, field.name, at)
        : field.parts.join(enc.component);
    const index = segment.name === "MSH" ? field.pos - 1 : field.pos;
    segment.parts[index] =
      field.pos === segment.lastPos
        ? `${segment.parts[index] as string}${enc.repetition}${text}`
        : text;
    segment.lastPos = field.pos;
  }

  /** MSH.1 or MSH.2 closes: the delimiters the rest of the message is written with. */
  private closeDelimiters(field: FieldFrame, at: number): void {
    const text = field.text;
    field.segment.lastPos = field.pos;
    if (field.pos === 1) {
      if (text.length !== 1) {
        this.fail(
          XML_ERROR_CODES.INVALID_ENCODING_CHARACTERS,
          "MSH.1 is not one character.",
          field.name,
          at,
        );
      }
      this.msh1 = text;
      return;
    }
    if (text.length !== 4 && text.length !== 5) {
      this.fail(
        XML_ERROR_CODES.INVALID_ENCODING_CHARACTERS,
        "MSH.2 is not four or five characters.",
        field.name,
        at,
      );
    }
    field.segment.parts[1] = text;
    // The pipe parser's own reading of MSH-1 and MSH-2, which refuses duplicated or blank
    // delimiters with its own error, as it would in the pipe form.
    this.enc = readDelimiters(`MSH${this.msh1}${text}`);
  }

  /** A segment closes: its pipe text joins the message. */
  private closeSegment(segment: SegmentFrame, at: number): void {
    if (segment.name === "MSH" && segment.lastPos < 2) {
      this.fail(
        XML_ERROR_CODES.INVALID_ENCODING_CHARACTERS,
        "MSH has no MSH.1 and MSH.2.",
        undefined,
        at,
      );
    }
    this.segments.push(segment.parts.join((this.enc as EncodingCharacters).field));
  }
}

/**
 * Write a v2 XML document's pipe-delimited form, refusing what the reader refuses.
 *
 * @internal
 */
export function xmlToPipe(xml: string, limits?: XmlLimits, onType?: TypeSink): string {
  return new XmlToPipe(xml, resolveLimits(limits), onType).run();
}

/**
 * Parse a message in the HL7 v2 XML encoding into the same `Hl7Message` the pipe-delimited parser
 * builds for that message: the same segments, fields, repetitions, components, subcomponents,
 * escapes and nulls, the same warnings, lazy by default.
 *
 * Element names are read by position: `PID.5` is the fifth field of PID, and inside it `XPN.1`
 * (or any data type name ending in `.1`) is its first component, so no data type table is needed
 * to read. The components of one value must all name the same data type, and none may be named
 * for a segment (`PID.3` or `OBX.1` inside `PID.5`). Group elements (`ORU_R01.RESULT`) are
 * walked through; segments are read in document order. One document is one message: a second
 * MSH is refused. Text is the decoded value: a `|` or `^` in text is that character, written to
 * the model as the pipe parser would read `\F\` or `\S\`. A field whose text is `""` is the
 * explicit null. An `escape` element is the formatting escape its `V` names: `<escape V="H"/>` is
 * `\H\`. Elements may be in the `urn:hl7-org:v2xml` namespace, as the default or through a
 * prefix, or in none.
 *
 * The reader is hardened: it refuses a DTD or entity declaration, any entity beyond the five XML
 * predefines, a character XML 1.0 forbids, and a document past the size, depth or element caps
 * of `limits` (a limit that is not a number, NaN included, is refused with `INVALID_OPTIONS`;
 * `Infinity` lifts a cap). It refuses, rather than guess, what the published rules leave open:
 * the message's escape character (MSH.2's third character) in text, and an `escape` element
 * whose `V` is not a formatting escape. Every refusal is an {@link Hl7XmlError} with a code from
 * `XML_ERROR_CODES`; errors from reading the pipe form are `parseHL7`'s own.
 *
 * @param xml The document, as text.
 * @param options `parseHL7`'s options and the reader's caps.
 * @returns The parsed message.
 * @throws {Hl7XmlError} When the document is refused.
 * @example
 * ```ts
 * import { parseHL7Xml } from "@cosyte/hl7";
 * const msg = parseHL7Xml(
 *   '<ACK><MSH><MSH.1>|</MSH.1><MSH.2>^~\\&amp;</MSH.2><MSH.9><MSG.1>ACK</MSG.1></MSH.9>' +
 *     "<MSH.10>1</MSH.10><MSH.11><PT.1>P</PT.1></MSH.11><MSH.12><VID.1>2.6</VID.1></MSH.12></MSH>" +
 *     "<MSA><MSA.1>AA</MSA.1><MSA.2>1</MSA.2></MSA></ACK>",
 * );
 * msg.get("MSA.1"); // "AA"
 * msg.toString(); // the same message, pipe-delimited
 * ```
 */
export function parseHL7Xml(xml: string, options: ParseHl7XmlOptions = {}): Hl7Message {
  const { limits, ...parseOptions } = options;
  return parseHL7(xmlToPipe(xml, limits), parseOptions);
}

/**
 * The data types a v2 XML document names, as the map `toHl7Xml` takes: each field that has
 * component elements to the data type they are named for (`PID.5` to `XPN`), and each component
 * that has subcomponent elements to theirs (`XPN.1` to `FN`). Read one message from a partner and
 * write back in its names. A key the document names two ways (OBX.5, whose type follows OBX-2) is
 * left out, so the writer refuses it rather than guess. The keys come in sorted order.
 *
 * @param xml The document, as text.
 * @param options The reader's caps.
 * @returns The data type map.
 * @throws {Hl7XmlError} When the document is refused, as `parseHL7Xml` refuses it.
 * @example
 * ```ts
 * import { parseHL7Xml, toHl7Xml, xmlDataTypes } from "@cosyte/hl7";
 * declare const sample: string;
 * const dataTypes = xmlDataTypes(sample); // { "PID.5": "XPN", "XPN.1": "FN", ... }
 * const xml = toHl7Xml(parseHL7Xml(sample), { dataTypes });
 * ```
 */
export function xmlDataTypes(
  xml: string,
  options: XmlDataTypesOptions = {},
): Record<string, string> {
  const seen = new Map<string, string | null>();
  xmlToPipe(xml, options.limits, (key, type) => {
    seen.set(key, seen.has(key) && seen.get(key) !== type ? null : type);
  });
  const out: Record<string, string> = {};
  for (const key of [...seen.keys()].sort()) {
    const type = seen.get(key);
    if (typeof type === "string") out[key] = type;
  }
  return out;
}
