/**
 * The refusals of the HL7 v2 XML encoding reader and writer: one coded error class with its own
 * code registry, kept apart from the pipe parser's four fatal codes.
 */

/**
 * Every code an {@link Hl7XmlError} carries. The XML reader and writer refuse with one of these
 * rather than guess: a hostile document (a DTD, an entity, too large, too deep, too many
 * elements), a document that is not the HL7 v2 XML shape, and the cases the published rules
 * leave open (the escape character in text, a composite whose data type the writer was not told,
 * a message structure whose groups it does not know).
 *
 * @example
 * ```ts
 * import { parseHL7Xml, Hl7XmlError, XML_ERROR_CODES } from "@cosyte/hl7";
 * try {
 *   parseHL7Xml("<!DOCTYPE x><x/>");
 * } catch (err) {
 *   if (err instanceof Hl7XmlError && err.code === XML_ERROR_CODES.DTD_NOT_ALLOWED) {
 *     // refuse the document
 *   }
 * }
 * ```
 */
export const XML_ERROR_CODES = {
  /** The document is larger than `limits.maxInputBytes`. */
  INPUT_TOO_LARGE: "INPUT_TOO_LARGE",
  /** Elements are nested deeper than `limits.maxDepth`. */
  DEPTH_LIMIT_EXCEEDED: "DEPTH_LIMIT_EXCEEDED",
  /** The document has more elements, empty positions counted, than `limits.maxElements`. */
  ELEMENT_LIMIT_EXCEEDED: "ELEMENT_LIMIT_EXCEEDED",
  /** The document declares a DTD or an entity (`<!DOCTYPE`, `<!ENTITY`). */
  DTD_NOT_ALLOWED: "DTD_NOT_ALLOWED",
  /** The document references an entity other than the five XML predefines. */
  ENTITY_NOT_ALLOWED: "ENTITY_NOT_ALLOWED",
  /** The document is not well-formed XML, an element that repeats an attribute among them. */
  NOT_WELL_FORMED: "NOT_WELL_FORMED",
  /** The document or a value holds a character XML 1.0 does not allow. */
  FORBIDDEN_CHARACTER: "FORBIDDEN_CHARACTER",
  /**
   * An element is in a namespace other than `urn:hl7-org:v2xml` or none: a default namespace
   * declared as another, or a prefix bound to another or to none.
   */
  NAMESPACE_NOT_SUPPORTED: "NAMESPACE_NOT_SUPPORTED",
  /**
   * An element is not a segment, group, field, component or subcomponent where it stands: a
   * second MSH, a component named for a segment rather than a data type, or the components of
   * one value named for two data types among them.
   */
  UNEXPECTED_ELEMENT: "UNEXPECTED_ELEMENT",
  /** An element holds both text and child elements. */
  MIXED_CONTENT: "MIXED_CONTENT",
  /** A field, component or subcomponent comes before one it should follow, or repeats where it cannot. */
  OUT_OF_ORDER: "OUT_OF_ORDER",
  /** The first segment is not an `MSH` that opens with `MSH.1` and `MSH.2`, or they are malformed. */
  INVALID_ENCODING_CHARACTERS: "INVALID_ENCODING_CHARACTERS",
  /**
   * The message's escape character in text, for which no published rule exists; an `escape`
   * element whose `V` is not a formatting escape, or that holds text or elements; or a value
   * whose escape sequence the writer cannot express: a formatting escape in a value whose data
   * type is not TX or FT, a hex escape the message's character set cannot decode (a byte
   * Windows-1252 assigns no character among them), or a character set or vendor escape.
   */
  ESCAPE_NOT_SUPPORTED: "ESCAPE_NOT_SUPPORTED",
  /** The writer needs the data type of a composite to name its elements and was not given it. */
  DATA_TYPE_UNKNOWN: "DATA_TYPE_UNKNOWN",
  /**
   * The writer cannot name the root element: no `structure` option, no MSH-9.3, and no message
   * structure our registry maps MSH-9.1 and MSH-9.2 to.
   */
  STRUCTURE_UNKNOWN: "STRUCTURE_UNKNOWN",
  /**
   * The writer was not given the message structure's groups in `groups`. We ship no group table,
   * so it takes every structure's groups from its caller.
   */
  GROUPS_UNKNOWN: "GROUPS_UNKNOWN",
  /**
   * The message's segments do not fit the message structure the writer places them in: a
   * required segment or group is missing, or a segment has no place in it.
   */
  STRUCTURE_MISMATCH: "STRUCTURE_MISMATCH",
  /**
   * An option is malformed: a reader limit that is not a number (NaN included), a writer's data
   * type or structure name that is not an XML name, a data type named for a segment, or a
   * `groups` structure that is malformed or names another root than `structure`.
   */
  INVALID_OPTIONS: "INVALID_OPTIONS",
} as const;

/**
 * One code of {@link XML_ERROR_CODES}.
 *
 * @example
 * ```ts
 * import type { XmlErrorCode } from "@cosyte/hl7";
 * const code: XmlErrorCode = "DTD_NOT_ALLOWED";
 * ```
 */
export type XmlErrorCode = (typeof XML_ERROR_CODES)[keyof typeof XML_ERROR_CODES];

/**
 * Thrown by `parseHL7Xml`, `xmlDataTypes` and `toHl7Xml` when they refuse a document or a
 * message. `code` says why. `offset` is the character offset in the document where the reader
 * stopped (the writer gives none), and `path` names the place in HL7 terms (`PID.5`, `XPN.1`)
 * when the name has that shape. Neither the message nor any field carries text from the document:
 * an element name is echoed only when it is a segment id or a data type name followed by a
 * position, never a value.
 *
 * @example
 * ```ts
 * import { parseHL7Xml, Hl7XmlError } from "@cosyte/hl7";
 * try {
 *   parseHL7Xml("<ORU_R01><MSH><MSH.1>|</MSH.1></MSH>");
 * } catch (err) {
 *   if (err instanceof Hl7XmlError) console.log(err.code, err.offset);
 * }
 * ```
 */
export class Hl7XmlError extends Error {
  /** Why the document or message was refused. */
  public readonly code: XmlErrorCode;
  /** The character offset in the document where the reader stopped; absent from the writer. */
  public readonly offset: number | undefined;
  /** The place in HL7 terms, such as `PID.5`, when one is known and has a safe shape. */
  public readonly path: string | undefined;

  /**
   * Construct a new `Hl7XmlError`.
   *
   * @internal
   */
  public constructor(code: XmlErrorCode, message: string, offset?: number, path?: string) {
    super(path === undefined ? message : `${message} (${path})`);
    this.name = "Hl7XmlError";
    this.code = code;
    this.offset = offset;
    this.path = path;
  }
}

/**
 * The path to echo, or `undefined` when `path` does not have the safe shape: a segment id or data
 * type name of two to six capitals and digits, a dot, and a position from 1 to 999.
 *
 * @internal
 */
export function safePath(path: string | undefined): string | undefined {
  return path?.match(/^[A-Z][A-Z0-9]{1,5}\.[1-9][0-9]{0,2}$/u)?.[0];
}
