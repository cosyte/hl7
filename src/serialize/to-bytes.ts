/**
 * `emitBytes`: a message written as bytes in the character set it declares in MSH-18, the inverse
 * of how `parseHL7` decodes a `Buffer`. The text is the same `toString()` writes; only its encoding
 * differs, so a message read from bytes and not changed is written back as the bytes it arrived as.
 *
 * Every set is written the way the reader reads it:
 *
 * - blank or absent MSH-18 and `UTF-8`: UTF-8 (the reader decodes the ASCII default as its UTF-8
 *   superset); a declared `ASCII`: 7-bit ASCII;
 * - `8859/1`: one byte per character, U+0000 to U+00FF;
 * - `WINDOWS-1252`: the WHATWG table the reader decodes with;
 * - the other ISO 8859 sets the reader decodes: the bytes `TextDecoder` maps to each character;
 * - a set the reader does not decode: ASCII only, since there is no table to write the rest with;
 *   UTF-16 and UTF-32 not at all.
 *
 * A message the reader kept as a latin1 byte reading (a set it does not decode, an unrecognized
 * label, or a decode that failed and warned) holds bytes rather than text in the segments it read,
 * so those segments are written back one byte per character, the bytes that were read, while the
 * set they were read in is the one being written. A segment an edit added or replaced holds text,
 * and is held to ASCII.
 *
 * A character the set cannot hold is refused with an {@link Hl7EncodeError}, never replaced.
 *
 * @internal
 */

import { Buffer } from "node:buffer";

import type { Hl7Message } from "../model/message.js";
import { decodeWindows1252, resolveCharset } from "../parser/charset.js";
import { resolveSegment } from "../parser/segment-source.js";
import type { Hl7Position, RawSegment } from "../parser/types.js";
import { WARNING_CODES, safeCharsetLabel, type Hl7ParseWarning } from "../parser/warnings.js";
import { emitField } from "./emit-field.js";
import { emitMessage } from "./to-string.js";

/**
 * Options for `Hl7Message.toBytes`.
 *
 * @example
 * ```ts
 * import { parseHL7, type ToBytesOptions } from "@cosyte/hl7";
 * const options: ToBytesOptions = { charset: "8859/1" };
 * parseHL7(bytes, options).toBytes(options);
 * ```
 */
export interface ToBytesOptions {
  /**
   * The character set to write in, in place of the one MSH-18 declares, with the labels
   * `parseHL7`'s `charset` option takes. Pass the same value given to `parseHL7` to write a
   * message back as the bytes it was read from. MSH-18 itself is written as it is.
   *
   * A message the parser kept as a latin1 byte reading cannot be moved to another set: its
   * segments are bytes in the set they were read in. Under an option naming another set, or when
   * that set is not known (the read followed a `charset` option that disagreed with MSH-18, or
   * MSH-18 was blank), a non-ASCII byte is refused with `UNENCODABLE_CHARACTER`; call `toBytes()`
   * with no option to get the bytes back as they were read.
   */
  readonly charset?: string;
}

/**
 * Why `toBytes` refused: `UNENCODABLE_CHARACTER` for a character the set cannot hold,
 * `UNSUPPORTED_CHARSET` for a set the writer has no encoder for (a table this runtime lacks, or
 * UTF-16 and UTF-32, which it writes only as the bytes a message was read from).
 */
export type Hl7EncodeErrorCode = "UNENCODABLE_CHARACTER" | "UNSUPPORTED_CHARSET";

/**
 * Thrown by `Hl7Message.toBytes` when the message cannot be written in its character set: a
 * character the set has no byte for (`UNENCODABLE_CHARACTER`), or a set the writer has no
 * encoder for (`UNSUPPORTED_CHARSET`): a table this Node.js build lacks, or UTF-16 and UTF-32. The writer refuses rather than write a substitute byte.
 *
 * The error names where the character is (segment and field) and the set, never the character or
 * any field text. A label outside the registry `resolveCharset` reads is shown as `<withheld>`,
 * since MSH-18 on a malformed message can be a data field.
 *
 * @example
 * ```ts
 * import { Hl7EncodeError, parseHL7 } from "@cosyte/hl7";
 * try {
 *   msg.toBytes();
 * } catch (err) {
 *   if (err instanceof Hl7EncodeError && err.code === "UNENCODABLE_CHARACTER") {
 *     console.warn(err.charset, err.position.segmentIndex, err.position.fieldIndex);
 *   }
 * }
 * ```
 */
export class Hl7EncodeError extends Error {
  /** Why the message could not be written. */
  public readonly code: Hl7EncodeErrorCode;
  /** The segment (0 is MSH) and field the refused character is in; MSH-18 for a missing table. */
  public readonly position: Hl7Position;
  /** The canonical label of the set, or `<withheld>` for a label outside the registry. */
  public readonly charset: string;

  /**
   * Construct a new `Hl7EncodeError`.
   *
   * @internal
   */
  public constructor(
    code: Hl7EncodeErrorCode,
    position: { readonly segmentIndex: number; readonly fieldIndex: number },
    charset: string,
  ) {
    super(
      code === "UNENCODABLE_CHARACTER"
        ? `Cannot write segment ${String(position.segmentIndex)} field ${String(position.fieldIndex)} in character set "${charset}": it holds a character the set has no byte for.`
        : `Cannot write character set "${charset}": the writer has no encoder for it.`,
    );
    this.name = "Hl7EncodeError";
    this.code = code;
    this.position = position;
    this.charset = charset;
  }
}

/**
 * The character-to-byte table for a single-byte set, from the reader's own decode of bytes 0x80 to
 * 0xFF. A byte the reader's strict decode refuses decodes here, without `fatal`, as U+FFFD (no
 * ISO 8859 set defines that character), so it gets no entry. Bytes below 0x80 are ASCII in every
 * set this serves and are written directly. `undefined` when this runtime cannot decode the set.
 * Built on each call rather than kept: it is one decode of 128 bytes.
 *
 * @internal
 */
function tableFor(decoder: string): ReadonlyMap<number, number> | undefined {
  const high = Uint8Array.from({ length: 0x80 }, (_, i) => 0x80 + i);
  let chars: string;
  if (decoder === "windows-1252") {
    chars = decodeWindows1252(high);
  } else {
    try {
      chars = new TextDecoder(decoder).decode(high);
    } catch {
      return undefined;
    }
  }
  const table = new Map<number, number>();
  high.forEach((byte, i) => {
    const unit = chars.charCodeAt(i);
    if (unit !== 0xfffd) table.set(unit, byte);
  });
  return table;
}

/**
 * The first repetition of MSH-18 in the first of `segments`, as the reader reads it off the wire
 * (components left whole); `undefined` when MSH stops before MSH-18. `resolveCharset` trims it and reads a blank one
 * as the ASCII default. `fields[17]` is MSH-18, since `fields[1]` holds MSH-2.
 *
 * @internal
 */
function declaredCharset(segments: readonly RawSegment[], msg: Hl7Message): string | undefined {
  const [msh] = segments;
  /* v8 ignore next -- the parser and buildMessage put MSH first, and emitMessage refuses a message with no segments before this runs */
  if (msh === undefined) return undefined;
  const field = resolveSegment(msh).fields[17];
  if (field === undefined) return undefined;
  return emitField(
    { repetitions: field.repetitions.slice(0, 1), isNull: field.isNull },
    msg.encodingCharacters,
  );
}

/**
 * Whether the reader kept a message's bytes as a latin1 reading and said so: it raised
 * `UNSUPPORTED_CHARSET` or `UNKNOWN_CHARSET`.
 *
 * @internal
 */
export function readAsBytes(warnings: readonly Hl7ParseWarning[]): boolean {
  return warnings.some(
    (w) => w.code === WARNING_CODES.UNSUPPORTED_CHARSET || w.code === WARNING_CODES.UNKNOWN_CHARSET,
  );
}

/**
 * Where the character at `index` of the emitted text is: its segment, and its field counted as
 * the reader counts it (MSH-1 is the field separator, so an MSH field is one past its separator
 * count).
 *
 * @internal
 */
function positionOf(
  text: string,
  index: number,
  msg: Hl7Message,
): { segmentIndex: number; fieldIndex: number } {
  const before = text.slice(0, index);
  const segmentStart = before.lastIndexOf("\r") + 1;
  const segmentIndex = before.split("\r").length - 1;
  const separators = before.slice(segmentStart).split(msg.encodingCharacters.field).length - 1;
  return { segmentIndex, fieldIndex: segmentIndex === 0 ? separators + 1 : separators };
}

/**
 * The index of the first lone surrogate in `text`, which UTF-8 cannot hold; -1 when there is none.
 * Iterating a string by code point yields a lone surrogate as a one-unit string.
 *
 * @internal
 */
function loneSurrogate(text: string): number {
  let index = 0;
  for (const char of text) {
    const unit = char.charCodeAt(0);
    if (char.length === 1 && unit >= 0xd800 && unit <= 0xdfff) return index;
    index += char.length;
  }
  return -1;
}

/**
 * How `writeSingleByte` writes a character from U+0080 up: through a set's table, as the byte of
 * the same value up to 0xFF (8859/1, and a byte reading's own characters), or not at all.
 *
 * @internal
 */
type HighCharacters = ReadonlyMap<number, number> | "latin1" | "refuse";

/**
 * `text` one byte per character: ASCII as itself, any other character as `high` says. `highAt`
 * picks it per segment. Throws for a character with no byte.
 *
 * @internal
 */
function writeSingleByte(
  text: string,
  msg: Hl7Message,
  shown: string,
  highAt: (segmentIndex: number) => HighCharacters,
): Buffer {
  const out = Buffer.allocUnsafe(text.length);
  let segment = 0;
  let high = highAt(0);
  for (let i = 0; i < text.length; i++) {
    const unit = text.charCodeAt(i);
    let byte: number | undefined;
    if (unit < 0x80) byte = unit;
    else if (high === "latin1") byte = unit <= 0xff ? unit : undefined;
    else if (high !== "refuse") byte = high.get(unit);
    if (byte === undefined) {
      throw new Hl7EncodeError("UNENCODABLE_CHARACTER", positionOf(text, i, msg), shown);
    }
    out[i] = byte;
    if (unit === 0x0d && i + 1 < text.length) high = highAt(++segment);
  }
  return out;
}

/** The sets one byte per character cannot write, not even ASCII. @internal */
const WIDE_SETS: ReadonlySet<string> = new Set(["UNICODE UTF-16", "UNICODE UTF-32"]);

/** The error for a set this writer has no encoder for. @internal */
function unsupported(shown: string): Hl7EncodeError {
  return new Hl7EncodeError("UNSUPPORTED_CHARSET", { segmentIndex: 0, fieldIndex: 18 }, shown);
}

/**
 * Write a message the reader kept as a latin1 byte reading. A segment as it was read holds bytes,
 * not text, in the set the reader read them in, so it is written back as those bytes only when
 * that set is known to be the one being written: with no option, MSH-18 still names the set it
 * named when read; with an option, it names that same set and MSH-18 governed the read (it was not
 * blank and no `options.charset` overrode it). Any other segment, one an edit added or replaced,
 * holds text the writer has no table for, so it must be ASCII; a wide set refuses it outright.
 *
 * @internal
 */
function writeByteReading(
  text: string,
  msg: Hl7Message,
  asRead: readonly RawSegment[],
  options: ToBytesOptions,
): Buffer {
  const current = msg.rawSegments;
  const label = options.charset ?? declaredCharset(current, msg);
  const target = resolveCharset(label);
  const shown = safeCharsetLabel(target.canonical);
  const readLabel = declaredCharset(asRead, msg);
  const readSet = resolveCharset(readLabel).canonical;
  const overridden = msg.warnings.some((w) => w.code === WARNING_CODES.ENCODING_MISMATCH);
  const sameSet =
    options.charset === undefined
      ? target.canonical === readSet
      : !overridden && (readLabel ?? "").trim() !== "" && target.canonical === readSet;
  const kept = new Set<RawSegment | undefined>(asRead.map(resolveSegment));
  return writeSingleByte(text, msg, shown, (segmentIndex) => {
    if (sameSet && kept.has(current[segmentIndex])) return "latin1";
    if (WIDE_SETS.has(target.canonical)) throw unsupported(shown);
    return "refuse";
  });
}

/**
 * Write `msg` as bytes in its declared character set, or in `options.charset`. See the module
 * header for how each set is written; throws {@link Hl7EncodeError} rather than substitute a byte.
 * `asRead` is the segment list the message was read with, given only for a byte reading.
 *
 * @internal
 */
export function emitBytes(
  msg: Hl7Message,
  options: ToBytesOptions = {},
  asRead?: readonly RawSegment[],
): Buffer {
  const text = emitMessage(msg);
  if (asRead !== undefined) return writeByteReading(text, msg, asRead, options);
  const label = options.charset ?? declaredCharset(msg.rawSegments, msg);
  const resolution = resolveCharset(label);
  const shown = safeCharsetLabel(resolution.canonical);
  if (resolution.treatment === "verbatim") {
    // A set the reader does not decode has no table here either: ASCII is the same byte in each of
    // them, and anything above it would be a guess.
    if (WIDE_SETS.has(resolution.canonical)) throw unsupported(shown);
    return writeSingleByte(text, msg, shown, () => "refuse");
  }
  if (resolution.decoder === "utf-8") {
    // A declared ASCII is 7-bit. Only a blank or absent MSH-18, the default, is written as the
    // UTF-8 superset the reader decodes it with.
    if (resolution.canonical === "ASCII" && (label ?? "").trim() !== "") {
      return writeSingleByte(text, msg, shown, () => "refuse");
    }
    const bad = loneSurrogate(text);
    if (bad !== -1) {
      throw new Hl7EncodeError("UNENCODABLE_CHARACTER", positionOf(text, bad, msg), shown);
    }
    return Buffer.from(text);
  }
  if (resolution.decoder === "latin1") return writeSingleByte(text, msg, shown, () => "latin1");
  const table = tableFor(resolution.decoder);
  if (table === undefined) throw unsupported(shown);
  return writeSingleByte(text, msg, shown, () => table);
}
