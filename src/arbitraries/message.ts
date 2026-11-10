import { parseHL7 } from "@cosyte/hl7";
import type { EncodingCharacters, Hl7Message } from "@cosyte/hl7";
import fc from "fast-check";
import type { Arbitrary } from "fast-check";

import { encodingCharacters, escapeSequence } from "./encoding.js";
import {
  endingNonEmpty,
  escapeValue,
  fieldShape,
  segmentName,
  value,
  writeField,
  type FieldShape,
} from "./tree.js";

/** A message type: the MSH-9 message code and trigger event. */
export interface MessageType {
  /** The message code, MSH-9.1, such as `ADT`. */
  readonly code: string;
  /** The trigger event, MSH-9.2, such as `A01`. */
  readonly trigger: string;
}

/**
 * The common message types, each with the segments that open its body in order.
 *
 * @internal
 */
const MESSAGE_TYPES: readonly (MessageType & { readonly body: readonly string[] })[] = [
  { code: "ADT", trigger: "A01", body: ["EVN", "PID", "PV1"] },
  { code: "ADT", trigger: "A03", body: ["EVN", "PID", "PV1"] },
  { code: "ADT", trigger: "A04", body: ["EVN", "PID", "PV1"] },
  { code: "ADT", trigger: "A08", body: ["EVN", "PID", "PV1"] },
  { code: "ORU", trigger: "R01", body: ["PID", "OBR", "OBX"] },
  { code: "ORM", trigger: "O01", body: ["PID", "ORC", "OBR"] },
  { code: "OML", trigger: "O21", body: ["PID", "ORC", "OBR"] },
  { code: "SIU", trigger: "S12", body: ["SCH", "PID", "RGS", "AIS"] },
  { code: "MDM", trigger: "T02", body: ["EVN", "PID", "PV1", "TXA", "OBX"] },
  { code: "DFT", trigger: "P03", body: ["EVN", "PID", "FT1"] },
  { code: "VXU", trigger: "V04", body: ["PID", "ORC", "RXA"] },
  { code: "RDE", trigger: "O11", body: ["PID", "ORC", "RXE"] },
  { code: "ACK", trigger: "A01", body: ["MSA"] },
];

/**
 * Generate a common message type: ADT (A01, A03, A04, A08), ORU^R01, ORM^O01, OML^O21,
 * SIU^S12, MDM^T02, DFT^P03, VXU^V04, RDE^O11 or ACK.
 *
 * @returns An arbitrary of a {@link MessageType}.
 * @example
 * ```ts
 * import fc from "fast-check";
 * import { messageType } from "@cosyte/hl7/arbitraries";
 *
 * const [type] = fc.sample(messageType(), 1);
 * // type is like { code: "ORU", trigger: "R01" }
 * ```
 */
export function messageType(): Arbitrary<MessageType> {
  return fc
    .constantFrom(...MESSAGE_TYPES)
    .map(({ code, trigger }): MessageType => ({ code, trigger }));
}

/** Options for {@link message} and {@link messageText}. */
export interface MessageOptions {
  /** The encoding characters to write with. Defaults to {@link encodingCharacters}. */
  readonly encodingCharacters?: Arbitrary<EncodingCharacters>;
  /** The most segments after the ones a message type opens with. Defaults to 4. */
  readonly maxExtraSegments?: number;
  /** The most fields in a body segment. Defaults to 8. */
  readonly maxFields?: number;
  /**
   * Whether values carry escape sequences beyond the ones their delimiters need: hex, highlight,
   * formatting, character set and local escapes. Defaults to `true`.
   */
  readonly escapes?: boolean;
}

/**
 * The parts of a generated message: its encoding characters and its segments, each a list of
 * fields in wire form (the name first).
 *
 * @internal
 */
interface MessageParts {
  readonly enc: EncodingCharacters;
  readonly segments: readonly (readonly string[])[];
}

/** The versions written with a four-character MSH-2. */
const VERSIONS_BEFORE_TRUNCATION = ["2.3", "2.3.1", "2.4", "2.5", "2.5.1", "2.6"] as const;
/** The versions written with a five-character MSH-2, which declares the truncation character. */
const VERSIONS_WITH_TRUNCATION = ["2.7", "2.7.1", "2.8", "2.8.1", "2.8.2", "2.9"] as const;

/** A string of `[A-Z0-9]`, for control ids and the like. */
function token(maxLength: number): Arbitrary<string> {
  return fc.string({
    unit: fc.constantFrom(..."ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789"),
    minLength: 1,
    maxLength,
  });
}

/** A whole number written with `width` digits, zero-padded. */
function digits(min: number, max: number, width: number): Arbitrary<string> {
  return fc.integer({ min, max }).map((n) => String(n).padStart(width, "0"));
}

/** An MSH-7 timestamp, `YYYYMMDDHHMMSS`, from 2000 on. */
function timestamp(): Arbitrary<string> {
  return fc
    .tuple(
      digits(2000, 2039, 4),
      digits(1, 12, 2),
      digits(1, 28, 2),
      digits(0, 23, 2),
      digits(0, 59, 2),
      digits(0, 59, 2),
    )
    .map((parts) => parts.join(""));
}

/**
 * Generate a message's parts over one set of encoding characters.
 *
 * @internal
 */
function messageParts(options: MessageOptions): Arbitrary<MessageParts> {
  const encArb = options.encodingCharacters ?? encodingCharacters();
  return encArb.chain((enc) => {
    const plain = value().map((v) => escapeValue(v, enc));
    const leaf =
      options.escapes === false
        ? plain
        : fc
            .array(
              fc.oneof(
                { weight: 3, arbitrary: plain },
                { weight: 1, arbitrary: escapeSequence({ encodingCharacters: enc }) },
              ),
              { minLength: 1, maxLength: 3 },
            )
            .map((pieces) => pieces.join(""));
    const wireField = fieldShape(leaf, () => "", {}).map((shape) => writeField(shape, enc));
    const hd = fieldShape(leaf, () => "", {
      maxRepetitions: 1,
      maxComponents: 3,
      maxSubcomponents: 1,
      nullable: false,
    });
    const optionalHd = fc
      .option(hd, { nil: undefined, freq: 4 })
      .map((shape: FieldShape<string> | undefined) =>
        shape === undefined ? "" : writeField(shape, enc),
      );
    const bodyFields = endingNonEmpty(wireField, () => "", options.maxFields ?? 8);
    const bodySegment = (name: Arbitrary<string>): Arbitrary<string[]> =>
      fc.tuple(name, bodyFields).map(([n, fs]) => [n, ...fs]);
    const versions =
      enc.truncation === undefined ? VERSIONS_BEFORE_TRUNCATION : VERSIONS_WITH_TRUNCATION;
    return fc
      .record({
        type: fc.constantFrom(...MESSAGE_TYPES),
        apps: fc.tuple(optionalHd, optionalHd, optionalHd, optionalHd),
        time: timestamp(),
        controlId: token(20),
        processingId: fc.constantFrom("P", "T", "D"),
        version: fc.constantFrom(...versions),
        extra: fc.array(bodySegment(segmentName(undefined)), {
          maxLength: options.maxExtraSegments ?? 4,
        }),
      })
      .chain(({ type, apps, time, controlId, processingId, version, extra }) => {
        const msh2 =
          enc.component + enc.repetition + enc.escape + enc.subcomponent + (enc.truncation ?? "");
        const msh = [
          "MSH",
          msh2,
          ...apps,
          time,
          "",
          type.code + enc.component + type.trigger,
          controlId,
          processingId,
          version,
        ];
        return fc
          .tuple(...type.body.map((name) => bodySegment(fc.constant(name))))
          .map((opening): MessageParts => ({ enc, segments: [msh, ...opening, ...extra] }));
      });
  });
}

/**
 * Write a message's segments with one field separator. MSH's first field is the separator
 * itself, so MSH is the name, then MSH-2 onward.
 *
 * @internal
 */
function writeSegments(parts: MessageParts): string[] {
  return parts.segments.map((fields) => fields.join(parts.enc.field));
}

/**
 * Generate a spec-clean message, parsed: written over generated encoding characters with escape
 * sequences in its values, and never anything the parser would have to repair, so the message
 * serializes back to the text it was parsed from. Its MSH carries a common message type and the
 * body opens with that type's segments, then adds generated segments, `Z` segments included.
 * Every value is random: nothing in one looks like a name, a date of birth or an identifier.
 * Each case is a new message, so the code under test may change it.
 *
 * @param options The encoding characters, the size, and whether to add escape sequences.
 * @returns An arbitrary of an {@link Hl7Message}.
 * @example
 * ```ts
 * import fc from "fast-check";
 * import { parseHL7 } from "@cosyte/hl7";
 * import { message } from "@cosyte/hl7/arbitraries";
 *
 * fc.assert(
 *   fc.property(message(), (msg) => {
 *     return parseHL7(msg.toString()).toString() === msg.toString();
 *   }),
 * );
 * ```
 */
export function message(options: MessageOptions = {}): Arbitrary<Hl7Message> {
  return cleanMessageText(options).map(parsedMessage);
}

/**
 * Parse generated text into a message fast-check can print and clone. Printed, a failing message
 * reads as the call that rebuilds it, not as the message object's internals; cloned, it is parsed
 * again, so code under test that changes a message cannot change the case fast-check replays.
 *
 * @internal
 */
function parsedMessage(text: string): Hl7Message {
  const msg = parseHL7(text);
  Object.defineProperty(msg, fc.toStringMethod, {
    value: () => `parseHL7(${JSON.stringify(text)})`,
  });
  Object.defineProperty(msg, fc.cloneMethod, { value: () => parsedMessage(text) });
  return msg;
}

/**
 * The spec-clean text {@link message} parses, written apart from the library's serializer.
 *
 * @internal
 */
export function cleanMessageText(options: MessageOptions = {}): Arbitrary<string> {
  return messageParts(options).map((parts) => writeSegments(parts).join("\r") + "\r");
}

/** The line endings a sender may use. */
const LINE_ENDINGS = ["\r", "\n", "\r\n"] as const;

/**
 * One repair the parser makes, applied to one body segment of a generated message.
 *
 * @internal
 */
export type SegmentQuirk =
  | { readonly kind: "none" }
  | { readonly kind: "pad"; readonly field: number }
  | { readonly kind: "trailing"; readonly delimiters: number }
  | { readonly kind: "lowercase" }
  | { readonly kind: "unknownEscape"; readonly field: number }
  | { readonly kind: "unterminatedEscape" }
  | { readonly kind: "hollowField"; readonly alone: boolean; readonly separators: number };

/** The character set labels a messy MSH-18 may carry, recognized and not. */
const CHARSETS = ["UNICODE UTF-8", "8859/1", "ASCII", "unicode utf-8", "LATIN-9-X"] as const;

/**
 * Generate raw message text the parser accepts, messy on purpose: line endings of any kind,
 * MLLP framing, a byte order mark, padded fields, trailing delimiters, fields of separators only,
 * lower-case segment names, unknown and unterminated escapes, unknown segments and a character
 * set in MSH-18. The parser reads past each one, repairing what it must, and never refuses it,
 * so this text always parses.
 *
 * @param options The encoding characters, the size, and whether to add escape sequences.
 * @returns An arbitrary of the message text.
 * @example
 * ```ts
 * import fc from "fast-check";
 * import { parseHL7 } from "@cosyte/hl7";
 * import { messageText } from "@cosyte/hl7/arbitraries";
 *
 * fc.assert(
 *   fc.property(messageText(), (raw) => {
 *     parseHL7(raw); // never throws for this text
 *   }),
 * );
 * ```
 */
export function messageText(options: MessageOptions = {}): Arbitrary<string> {
  const quirk: Arbitrary<SegmentQuirk> = fc.oneof(
    { weight: 6, arbitrary: fc.constant({ kind: "none" as const }) },
    { weight: 1, arbitrary: fc.nat(9).map((f) => ({ kind: "pad" as const, field: f })) },
    {
      weight: 1,
      arbitrary: fc
        .integer({ min: 1, max: 3 })
        .map((d) => ({ kind: "trailing" as const, delimiters: d })),
    },
    { weight: 1, arbitrary: fc.constant({ kind: "lowercase" as const }) },
    { weight: 1, arbitrary: fc.nat(9).map((f) => ({ kind: "unknownEscape" as const, field: f })) },
    { weight: 1, arbitrary: fc.constant({ kind: "unterminatedEscape" as const }) },
    {
      weight: 1,
      arbitrary: fc
        .tuple(fc.boolean(), fc.integer({ min: 1, max: 3 }))
        .map(([alone, separators]) => ({ kind: "hollowField" as const, alone, separators })),
    },
  );
  return messageParts(options).chain((parts) => {
    const { enc } = parts;
    const [msh, ...body] = parts.segments as [readonly string[], ...(readonly string[])[]];
    return fc
      .record({
        body: fc.tuple(...body.map((fields) => quirk.map((q) => applyQuirk(fields, q, enc)))),
        unknownSegment: fc.option(fc.nat(body.length), { nil: undefined }),
        charset: fc.option(fc.constantFrom(...CHARSETS), { nil: undefined }),
        eol: fc.constantFrom(...LINE_ENDINGS),
        trailingEol: fc.boolean(),
        bom: fc.boolean(),
        mllp: fc.boolean(),
      })
      .map(({ body: quirky, unknownSegment, charset, eol, trailingEol, bom, mllp }) => {
        const head = charset === undefined ? msh : [...msh, "", "", "", "", "", charset];
        const lines = [head, ...quirky].map((fields) => fields.join(enc.field));
        if (unknownSegment !== undefined) lines.splice(unknownSegment + 1, 0, `QQQ${enc.field}1`);
        const text = lines.join(eol) + (trailingEol ? eol : "");
        const framed = mllp ? `\x0b${text}\x1c\r` : text;
        return bom ? `\uFEFF${framed}` : framed;
      });
  });
}

/**
 * Apply one quirk to a body segment's wire fields (the name first, then at least one field).
 *
 * @internal
 */
export function applyQuirk(
  fields: readonly string[],
  quirk: SegmentQuirk,
  enc: EncodingCharacters,
): readonly string[] {
  const target = quirk.kind === "pad" || quirk.kind === "unknownEscape" ? quirk.field : 0;
  const at = 1 + (target % (fields.length - 1));
  const last = fields.length - 1;
  switch (quirk.kind) {
    case "none":
      return fields;
    case "pad":
      return fields.map((f, i) => (i === at ? ` ${f} ` : f));
    case "trailing":
      return [...fields, ...Array.from({ length: quirk.delimiters }, () => "")];
    case "lowercase":
      return fields.map((f, i) => (i === 0 ? f.toLowerCase() : f));
    case "unknownEscape":
      return fields.map((f, i) => (i === at ? `${f}${enc.escape}Q1${enc.escape}` : f));
    case "unterminatedEscape":
      return fields.map((f, i) => (i === last ? `${f}${enc.escape}F` : f));
    case "hollowField": {
      // A field of separators only, such as `^&^`: present on the wire, empty in content.
      const hollow = [enc.component, enc.subcomponent, enc.component]
        .slice(0, quirk.separators)
        .join("");
      return quirk.alone ? [fields[0] as string, hollow] : [...fields, hollow];
    }
  }
}

/** Options for {@link hostileInput}. */
export interface HostileInputOptions {
  /** The longest random string or byte run. Defaults to 200. */
  readonly maxLength?: number;
}

/**
 * One edit to a message's text: cut it short, delete a run, or insert random text.
 *
 * @internal
 */
export type Edit =
  | { readonly kind: "cut"; readonly at: number }
  | { readonly kind: "delete"; readonly at: number; readonly length: number }
  | { readonly kind: "insert"; readonly at: number; readonly text: string };

/**
 * Apply edits to text, each position taken modulo the text's length at that point.
 *
 * @internal
 */
export function applyEdits(text: string, edits: readonly Edit[]): string {
  let out = text;
  for (const edit of edits) {
    const at = edit.at % (out.length + 1);
    if (edit.kind === "cut") out = out.slice(0, at);
    else if (edit.kind === "delete") out = out.slice(0, at) + out.slice(at + edit.length);
    else out = out.slice(0, at) + edit.text + out.slice(at);
  }
  return out;
}

/**
 * Generate hostile input for a lenient parser: random strings, random bytes, messages with
 * random cuts, deletions and insertions, text that opens like an MSH and then falls apart, and
 * messages as bytes in UTF-8 or Latin-1. The parser must turn each into a message with warnings,
 * or refuse it with one of its documented fatal errors, and never throw anything else.
 *
 * @param options The longest random run.
 * @returns An arbitrary of a string or a `Buffer`.
 * @example
 * ```ts
 * import fc from "fast-check";
 * import { Hl7ParseError, parseHL7 } from "@cosyte/hl7";
 * import { hostileInput } from "@cosyte/hl7/arbitraries";
 *
 * fc.assert(
 *   fc.property(hostileInput(), (raw) => {
 *     try {
 *       parseHL7(raw);
 *     } catch (err) {
 *       return err instanceof Hl7ParseError;
 *     }
 *     return true;
 *   }),
 * );
 * ```
 */
export function hostileInput(options: HostileInputOptions = {}): Arbitrary<string | Buffer> {
  const maxLength = options.maxLength ?? 200;
  const randomText = fc.string({ unit: "binary", maxLength });
  const edit: Arbitrary<Edit> = fc.oneof(
    fc.nat().map((at) => ({ kind: "cut" as const, at })),
    fc.tuple(fc.nat(), fc.integer({ min: 1, max: 20 })).map(([at, length]) => ({
      kind: "delete" as const,
      at,
      length,
    })),
    fc
      .tuple(fc.nat(), fc.string({ unit: "binary", minLength: 1, maxLength: 8 }))
      .map(([at, text]) => ({ kind: "insert" as const, at, text })),
  );
  return fc.oneof(
    randomText,
    fc.uint8Array({ maxLength }).map((bytes) => Buffer.from(bytes)),
    fc
      .tuple(messageText(), fc.array(edit, { minLength: 1, maxLength: 4 }))
      .map(([text, edits]) => applyEdits(text, edits)),
    fc
      .tuple(fc.constantFrom("MSH", "MSH|", "MSH|^~\\&", "msh|^~\\&|"), randomText)
      .map(([head, tail]) => head + tail),
    fc
      .tuple(messageText(), fc.constantFrom("utf8" as const, "latin1" as const))
      .map(([text, encoding]) => Buffer.from(text, encoding)),
  );
}
