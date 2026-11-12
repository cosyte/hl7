/**
 * The refusals of the HL7 v2 XML encoding reader and writer: one coded error class with its own
 * code registry, kept apart from the pipe parser's four fatal codes.
 */

/**
 * Every code an {@link Hl7XmlError} carries. The XML reader and writer refuse with one of these
 * rather than guess: a hostile document (a DTD, an entity, too large, too deep, too many
 * elements), a document that is not the HL7 v2 XML shape, and the cases whose encoding rule we
 * have not confirmed (an `escape` element, the escape character in text, a composite whose data
 * type the writer was not told).
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
  /** The document is not well-formed XML. */
  NOT_WELL_FORMED: "NOT_WELL_FORMED",
  /** The document or a value holds a character XML 1.0 does not allow. */
  FORBIDDEN_CHARACTER: "FORBIDDEN_CHARACTER",
  /** An element carries a namespace prefix, or a default namespace other than `urn:hl7-org:v2xml`. */
  NAMESPACE_NOT_SUPPORTED: "NAMESPACE_NOT_SUPPORTED",
  /**
   * An element is not a segment, group, field, component or subcomponent where it stands: a
   * second MSH, a component named for its segment, or the components of one value named for two
   * data types among them.
   */
  UNEXPECTED_ELEMENT: "UNEXPECTED_ELEMENT",
  /** An element holds both text and child elements. */
  MIXED_CONTENT: "MIXED_CONTENT",
  /** A field, component or subcomponent comes before one it should follow, or repeats where it cannot. */
  OUT_OF_ORDER: "OUT_OF_ORDER",
  /** The first segment is not an `MSH` that opens with `MSH.1` and `MSH.2`, or they are malformed. */
  INVALID_ENCODING_CHARACTERS: "INVALID_ENCODING_CHARACTERS",
  /**
   * An `escape` element, the message's escape character in text, or a value whose escape
   * sequence the writer cannot express: rules we have not confirmed, so we refuse them.
   */
  ESCAPE_NOT_SUPPORTED: "ESCAPE_NOT_SUPPORTED",
  /** The writer needs the data type of a composite to name its elements and was not given it. */
  DATA_TYPE_UNKNOWN: "DATA_TYPE_UNKNOWN",
  /** The writer cannot name the root element: no `structure` option and no MSH-9 to derive it from. */
  STRUCTURE_UNKNOWN: "STRUCTURE_UNKNOWN",
  /**
   * An option is malformed: a reader limit that is not a number (NaN included), or a writer's
   * data type or structure name that is not an XML name, or a data type named for its segment.
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
