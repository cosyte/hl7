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

import { reescape } from "../parser/escapes.js";
import { parseHL7 } from "../parser/index.js";
import type { EncodingCharacters, ParseOptions } from "../parser/types.js";
import type { Hl7Message } from "../model/message.js";

import { forbiddenCharacterAt } from "./chars.js";
import { Hl7XmlError, XML_ERROR_CODES, safePath, type XmlErrorCode } from "./errors.js";

/**
 * Caps on what the XML reader accepts. Each is optional and falls back to
 * {@link DEFAULT_XML_LIMITS}.
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

/** The namespace HL7 gives the v2 XML encoding; a document may also use none. */
export const V2_XML_NAMESPACE = "urn:hl7-org:v2xml";

/** A segment element: a three-character segment id. */
const SEGMENT_RE = /^[A-Z][A-Z0-9]{2}$/u;
/** A group element: the structure name, a dot, and the group name (`ORU_R01.PATIENT_RESULT`). */
const GROUP_RE = /^[A-Za-z][A-Za-z0-9_]*\.[A-Za-z_][A-Za-z0-9_]*$/u;
/** A positional element: a segment id or data type name, a dot and a position from 1 to 999. */
const POSITION_RE = /^([A-Za-z][A-Za-z0-9_]*)\.([1-9][0-9]{0,2})$/u;
/** Whitespace as XML defines it. */
const WHITESPACE_RE = /^[ \t\r\n]*$/u;
/** An entity name, told apart from text that is not a reference at all. */
const ENTITY_NAME_RE = /^[A-Za-z_][A-Za-z0-9._-]*$/u;

/** The five XML predefined entities. */
const PREDEFINED: Readonly<Record<string, string>> = {
  amp: "&",
  lt: "<",
  gt: ">",
  quot: '"',
  apos: "'",
};

/** A root or group element: it holds segments and groups. */
interface ContainerFrame {
  readonly kind: "container";
  readonly name: string;
  readonly root: boolean;
}

/** A segment element: it holds field elements, gathered as pipe text by position. */
interface SegmentFrame {
  readonly kind: "segment";
  readonly name: string;
  readonly fields: string[];
  lastPos: number;
}

/** A field element: text, or component elements. */
interface FieldFrame {
  readonly kind: "field";
  readonly name: string;
  readonly segment: SegmentFrame;
  readonly pos: number;
  text: string;
  parts: string[] | undefined;
  lastPart: number;
}

/** A component element: text, or subcomponent elements. */
interface ComponentFrame {
  readonly kind: "component";
  readonly name: string;
  readonly field: FieldFrame;
  readonly pos: number;
  text: string;
  parts: string[] | undefined;
  lastPart: number;
}

/** A subcomponent element: text only. */
interface SubcomponentFrame {
  readonly kind: "subcomponent";
  readonly name: string;
  readonly component: ComponentFrame;
  readonly pos: number;
  text: string;
}

type Frame = ContainerFrame | SegmentFrame | FieldFrame | ComponentFrame | SubcomponentFrame;

/** Called with each data type the document names: `PID.5` to `XPN`, `XPN.1` to `FN`. */
type TypeSink = (key: string, type: string) => void;

/** Whether `text` is XML whitespace only. */
function isWhitespace(text: string): boolean {
  return WHITESPACE_RE.test(text);
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

/** Join positional parts 1..last with `separator`, an absent position written empty. */
function joinParts(parts: readonly (string | undefined)[], separator: string): string {
  let out = "";
  for (let p = 1; p < parts.length; p++) {
    if (p > 1) out += separator;
    out += parts[p] ?? "";
  }
  return out;
}

/** The resolved caps. */
function resolveLimits(limits: XmlLimits | undefined): Required<XmlLimits> {
  return {
    maxInputBytes: limits?.maxInputBytes ?? DEFAULT_XML_LIMITS.maxInputBytes,
    maxDepth: limits?.maxDepth ?? DEFAULT_XML_LIMITS.maxDepth,
    maxElements: limits?.maxElements ?? DEFAULT_XML_LIMITS.maxElements,
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
  private readonly segments: string[] = [];
  private pos = 0;
  private elements = 0;
  private rootDone = false;
  private enc: EncodingCharacters | undefined;
  private msh1: string | undefined;

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
    if (src.length * 3 > this.limits.maxInputBytes) {
      if (Buffer.byteLength(src, "utf8") > this.limits.maxInputBytes) {
        this.fail(
          XML_ERROR_CODES.INPUT_TOO_LARGE,
          "The document is larger than the limit.",
          undefined,
          0,
        );
      }
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
    if (src.charCodeAt(0) === 0xfeff) this.pos = 1;
    const n = src.length;
    while (this.pos < n) {
      const lt = src.indexOf("<", this.pos);
      const end = lt === -1 ? n : lt;
      if (end > this.pos) this.text(src.slice(this.pos, end), true);
      if (lt === -1) break;
      this.pos = lt;
      this.markup();
    }
    if (this.stack.length > 0 || !this.rootDone) {
      this.fail(
        XML_ERROR_CODES.NOT_WELL_FORMED,
        "The document ends inside an element or has no root.",
      );
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
      if (src.charCodeAt(this.pos) !== 0x3e) {
        this.fail(XML_ERROR_CODES.NOT_WELL_FORMED, "An end tag is not closed.");
      }
      this.pos++;
      this.endElement(name, at);
      return;
    }
    this.pos = at + 1;
    const name = this.name();
    let selfClosing = false;
    for (;;) {
      const hadSpace = this.skipSpace();
      const c = src.charCodeAt(this.pos);
      if (c === 0x3e) {
        this.pos++;
        break;
      }
      if (c === 0x2f && src.charCodeAt(this.pos + 1) === 0x3e) {
        this.pos += 2;
        selfClosing = true;
        break;
      }
      if (!hadSpace) this.fail(XML_ERROR_CODES.NOT_WELL_FORMED, "A start tag is malformed.");
      this.attribute(name);
    }
    this.startElement(name, at);
    if (selfClosing) this.endElement(name, at);
  }

  /** The offset just past the next `terminator` at or after `from`. */
  private after(terminator: string, from: number): number {
    const close = this.src.indexOf(terminator, from);
    if (close === -1)
      this.fail(XML_ERROR_CODES.NOT_WELL_FORMED, "A comment or instruction does not end.");
    return close + terminator.length;
  }

  /** Skip XML whitespace; whether any was skipped. */
  private skipSpace(): boolean {
    const start = this.pos;
    const src = this.src;
    for (;;) {
      const c = src.charCodeAt(this.pos);
      if (c === 0x20 || c === 0x09 || c === 0x0a || c === 0x0d) this.pos++;
      else return this.pos > start;
    }
  }

  /** Read a name: everything up to whitespace, `/`, `>`, `=` or the end. */
  private name(): string {
    const src = this.src;
    const start = this.pos;
    for (;;) {
      const c = src.charCodeAt(this.pos);
      if (
        Number.isNaN(c) ||
        c === 0x20 ||
        c === 0x09 ||
        c === 0x0a ||
        c === 0x0d ||
        c === 0x2f ||
        c === 0x3e ||
        c === 0x3d ||
        c === 0x3c
      ) {
        break;
      }
      this.pos++;
    }
    if (this.pos === start) this.fail(XML_ERROR_CODES.NOT_WELL_FORMED, "A tag has no name.");
    return src.slice(start, this.pos);
  }

  /** Read one attribute of element `element`; only a default namespace declaration matters. */
  private attribute(element: string): void {
    const src = this.src;
    const name = this.name();
    this.skipSpace();
    if (src.charCodeAt(this.pos) !== 0x3d)
      this.fail(XML_ERROR_CODES.NOT_WELL_FORMED, "An attribute has no value.");
    this.pos++;
    this.skipSpace();
    const quote = src.charAt(this.pos);
    if (quote !== '"' && quote !== "'") {
      this.fail(XML_ERROR_CODES.NOT_WELL_FORMED, "An attribute value is not quoted.");
    }
    const close = src.indexOf(quote, this.pos + 1);
    if (close === -1)
      this.fail(XML_ERROR_CODES.NOT_WELL_FORMED, "An attribute value does not end.");
    const raw = src.slice(this.pos + 1, close);
    if (raw.includes("<"))
      this.fail(XML_ERROR_CODES.NOT_WELL_FORMED, "An attribute value holds a '<'.");
    const value = this.decode(raw, this.pos + 1);
    this.pos = close + 1;
    if (name === "xmlns" && value !== "" && value !== V2_XML_NAMESPACE) {
      this.fail(
        XML_ERROR_CODES.NAMESPACE_NOT_SUPPORTED,
        "An element declares a default namespace other than the v2 XML one.",
        element,
      );
    }
  }

  /**
   * Decode character data: line ends as XML reads them, then entity and character references.
   * `at` is the offset of `raw` in the document, for errors.
   */
  private decode(raw: string, at: number): string {
    const text = raw.includes("\r") ? raw.replace(/\r\n?/gu, "\n") : raw;
    if (!text.includes("&")) return text;
    let out = "";
    let from = 0;
    for (;;) {
      const amp = text.indexOf("&", from);
      if (amp === -1) return out + text.slice(from);
      const semi = text.indexOf(";", amp + 1);
      if (semi === -1) {
        this.fail(XML_ERROR_CODES.NOT_WELL_FORMED, "An '&' starts no reference.", undefined, at);
      }
      out += text.slice(from, amp) + this.reference(text.slice(amp + 1, semi), at);
      from = semi + 1;
    }
  }

  /** The text one reference stands for: a predefined entity or a character reference. */
  private reference(body: string, at: number): string {
    const predefined = PREDEFINED[body];
    if (predefined !== undefined) return predefined;
    let code = Number.NaN;
    if (/^#[0-9]{1,7}$/u.test(body)) code = Number.parseInt(body.slice(1), 10);
    else if (/^#x[0-9A-Fa-f]{1,6}$/u.test(body)) code = Number.parseInt(body.slice(2), 16);
    else if (ENTITY_NAME_RE.test(body)) {
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
    if (top.kind !== "subcomponent" && top.parts !== undefined) {
      if (isWhitespace(raw)) return;
      this.fail(
        XML_ERROR_CODES.MIXED_CONTENT,
        "An element holds both text and elements.",
        top.name,
        at,
      );
    }
    const text = decode ? this.decode(raw, at) : raw.replace(/\r\n?/gu, "\n");
    top.text += text;
  }

  /** Count one element, or `count` empty positions, against the cap. */
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
  private startElement(name: string, at: number): void {
    if (this.stack.length + 1 > this.limits.maxDepth) {
      this.fail(
        XML_ERROR_CODES.DEPTH_LIMIT_EXCEEDED,
        "Elements nest deeper than the limit.",
        undefined,
        at,
      );
    }
    this.count(1, at);
    if (name.includes(":")) {
      this.fail(
        XML_ERROR_CODES.NAMESPACE_NOT_SUPPORTED,
        "An element name carries a namespace prefix.",
        undefined,
        at,
      );
    }
    const top = this.stack.at(-1);
    if (top === undefined) {
      if (this.rootDone)
        this.fail(
          XML_ERROR_CODES.NOT_WELL_FORMED,
          "The document has two root elements.",
          undefined,
          at,
        );
      this.stack.push({ kind: "container", name, root: true });
      return;
    }
    switch (top.kind) {
      case "container":
        this.openInContainer(name, at);
        return;
      case "segment":
        this.openField(top, name, at);
        return;
      case "field":
      case "component":
        this.openPart(top, name, at);
        return;
      case "subcomponent":
        this.refuseChild(top.name, name, at);
    }
  }

  /** Refuse a child of a subcomponent: an `escape` element or one nested too deep. */
  private refuseChild(parent: string, name: string, at: number): never {
    if (name === "escape") {
      this.fail(
        XML_ERROR_CODES.ESCAPE_NOT_SUPPORTED,
        "The document uses an escape element.",
        parent,
        at,
      );
    }
    this.fail(
      XML_ERROR_CODES.UNEXPECTED_ELEMENT,
      "An element nests below a subcomponent.",
      parent,
      at,
    );
  }

  /** A segment or group opens in the root or a group. */
  private openInContainer(name: string, at: number): void {
    if (SEGMENT_RE.test(name)) {
      if (this.segments.length === 0 && name !== "MSH" && this.enc === undefined) {
        this.fail(
          XML_ERROR_CODES.INVALID_ENCODING_CHARACTERS,
          "The first segment is not MSH.",
          undefined,
          at,
        );
      }
      this.stack.push({ kind: "segment", name, fields: [], lastPos: 0 });
      return;
    }
    if (GROUP_RE.test(name)) {
      this.stack.push({ kind: "container", name, root: false });
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
    const match = POSITION_RE.exec(name);
    if (match?.[1] !== segment.name) {
      this.fail(
        XML_ERROR_CODES.UNEXPECTED_ELEMENT,
        "An element in a segment is not one of its fields.",
        name,
        at,
      );
    }
    const pos = Number(match[2]);
    if (segment.name === "MSH") {
      const wanted = segment.lastPos === 0 ? 1 : segment.lastPos === 1 ? 2 : undefined;
      if (wanted !== undefined ? pos !== wanted : pos < 3) {
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
    if (pos > segment.lastPos + 1) this.count(pos - segment.lastPos - 1, at);
    this.stack.push({ kind: "field", name, segment, pos, text: "", parts: undefined, lastPart: 0 });
  }

  /** A component opens in a field, or a subcomponent in a component. */
  private openPart(parent: FieldFrame | ComponentFrame, name: string, at: number): void {
    if (name === "escape") {
      this.fail(
        XML_ERROR_CODES.ESCAPE_NOT_SUPPORTED,
        "The document uses an escape element.",
        parent.name,
        at,
      );
    }
    if (parent.kind === "field" && parent.segment.name === "MSH" && parent.pos <= 2) {
      this.fail(
        XML_ERROR_CODES.INVALID_ENCODING_CHARACTERS,
        "MSH.1 and MSH.2 hold text only.",
        parent.name,
        at,
      );
    }
    const match = POSITION_RE.exec(name);
    if (match === null) {
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
      if (!isWhitespace(parent.text)) {
        this.fail(
          XML_ERROR_CODES.MIXED_CONTENT,
          "An element holds both text and elements.",
          parent.name,
          at,
        );
      }
      parent.text = "";
      parent.parts = [];
    }
    const pos = Number(match[2]);
    if (pos <= parent.lastPart) {
      this.fail(
        XML_ERROR_CODES.OUT_OF_ORDER,
        "A component or subcomponent repeats or comes out of order.",
        name,
        at,
      );
    }
    if (pos > parent.lastPart + 1) this.count(pos - parent.lastPart - 1, at);
    parent.lastPart = pos;
    this.onType?.(parent.name, match[1] as string);
    if (parent.kind === "field") {
      this.stack.push({
        kind: "component",
        name,
        field: parent,
        pos,
        text: "",
        parts: undefined,
        lastPart: 0,
      });
    } else {
      this.stack.push({ kind: "subcomponent", name, component: parent, pos, text: "" });
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
    const top = this.stack.pop();
    if (top?.name !== name) {
      this.fail(
        XML_ERROR_CODES.NOT_WELL_FORMED,
        "An end tag does not match its start tag.",
        undefined,
        at,
      );
    }
    switch (top.kind) {
      case "container":
        if (top.root) this.rootDone = true;
        return;
      case "segment":
        this.closeSegment(top, at);
        return;
      case "field":
        this.closeField(top, at);
        return;
      case "component": {
        const enc = this.enc as EncodingCharacters;
        const text =
          top.parts === undefined
            ? this.leaf(top.text, top.name, at)
            : joinParts(top.parts, enc.subcomponent);
        (top.field.parts as string[])[top.pos] = text;
        return;
      }
      case "subcomponent":
        (top.component.parts as string[])[top.pos] = this.leaf(top.text, top.name, at);
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
        ? this.leaf(field.text, field.name, at)
        : joinParts(field.parts, enc.component);
    if (field.pos === segment.lastPos) {
      segment.fields[field.pos] = (segment.fields[field.pos] as string) + enc.repetition + text;
    } else {
      segment.fields[field.pos] = text;
      segment.lastPos = field.pos;
    }
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
      field.segment.fields[1] = text;
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
    field.segment.fields[2] = text;
    const [component, repetition, escape, subcomponent, truncation] = [...text] as string[];
    this.enc = {
      field: this.msh1 as string,
      component: component as string,
      repetition: repetition as string,
      escape: escape as string,
      subcomponent: subcomponent as string,
      ...(truncation === undefined ? {} : { truncation }),
    };
  }

  /** A segment closes: its pipe text joins the message. */
  private closeSegment(segment: SegmentFrame, at: number): void {
    if (segment.name === "MSH") {
      if (segment.lastPos < 2) {
        this.fail(
          XML_ERROR_CODES.INVALID_ENCODING_CHARACTERS,
          "MSH has no MSH.1 and MSH.2.",
          undefined,
          at,
        );
      }
      const sep = segment.fields[1] as string;
      let out = "MSH" + sep + (segment.fields[2] as string);
      for (let p = 3; p <= segment.lastPos; p++) out += sep + (segment.fields[p] ?? "");
      this.segments.push(out);
      return;
    }
    const enc = this.enc as EncodingCharacters;
    let out = segment.name;
    for (let p = 1; p <= segment.lastPos; p++) out += enc.field + (segment.fields[p] ?? "");
    this.segments.push(out);
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
 * (or any name ending in `.1`) is its first component, so no data type table is needed to read.
 * Group elements (`ORU_R01.PATIENT_RESULT`) are walked through; segments are read in document
 * order. Text is the decoded value: a `|` or `^` in text is that character, written to the model
 * as the pipe parser would read `\F\` or `\S\`. A field whose text is `""` is the explicit null.
 *
 * The reader is hardened: it refuses a DTD or entity declaration, any entity beyond the five XML
 * predefines, a character XML 1.0 forbids, and a document past the size, depth or element caps
 * of `limits`. It refuses, rather than guess, the cases whose encoding rule we have not
 * confirmed: an `escape` element, and the message's escape character (MSH.2's third character)
 * in text. Every refusal is an {@link Hl7XmlError} with a code from `XML_ERROR_CODES`; errors
 * from reading the pipe form are `parseHL7`'s own.
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
 * left out, so the writer refuses it rather than guess.
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
    const before = seen.get(key);
    if (before === undefined) seen.set(key, type);
    else if (before !== type) seen.set(key, null);
  });
  const out: Record<string, string> = {};
  for (const [key, type] of [...seen].sort(([a], [b]) => (a < b ? -1 : 1))) {
    if (type !== null) out[key] = type;
  }
  return out;
}
