/**
 * `emitBytes`: a message written as bytes in the character set it declares in MSH-18, the inverse
 * of how `parseHL7` decodes a `Buffer`. The text is the same `toString()` writes; only its encoding
 * differs, so a message read from bytes and not changed is written back as the bytes it arrived as.
 *
 * Every set is written the way the reader reads it:
 *
 * - blank MSH-18, `ASCII` and `UTF-8`: UTF-8 (the reader decodes the ASCII default as its UTF-8
 *   superset);
 * - `8859/1`: one byte per character, U+0000 to U+00FF;
 * - `WINDOWS-1252`: the WHATWG table the reader decodes with;
 * - the other ISO 8859 sets the reader decodes: the bytes `TextDecoder` maps to each character;
 * - a set the reader keeps as a latin1 byte reading (a recognized set it does not decode, an
 *   unrecognized label, or a decode that failed and warned): one byte per character again, which
 *   gives back the bytes that were read.
 *
 * A character the set cannot hold is refused with an {@link Hl7EncodeError}, never replaced.
 *
 * @internal
 */

import { Buffer } from "node:buffer";

import type { Hl7Message } from "../model/message.js";
import { decodeWindows1252, resolveCharset } from "../parser/charset.js";
import type { Hl7Position } from "../parser/types.js";
import { WARNING_CODES, safeCharsetLabel } from "../parser/warnings.js";
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
   */
  readonly charset?: string;
}

/**
 * Why `toBytes` refused: `UNENCODABLE_CHARACTER` for a character the set cannot hold,
 * `UNSUPPORTED_CHARSET` for a set this runtime has no table for.
 */
export type Hl7EncodeErrorCode = "UNENCODABLE_CHARACTER" | "UNSUPPORTED_CHARSET";

/**
 * Thrown by `Hl7Message.toBytes` when the message cannot be written in its character set: a
 * character the set has no byte for (`UNENCODABLE_CHARACTER`), or a set whose table this Node.js
 * build lacks (`UNSUPPORTED_CHARSET`). The writer refuses rather than write a substitute byte.
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
        : `Cannot write character set "${charset}": this runtime has no table for it.`,
    );
    this.name = "Hl7EncodeError";
    this.code = code;
    this.position = position;
    this.charset = charset;
  }
}

/** How a resolved set is written. @internal */
type Writer =
  | { readonly kind: "utf-8" }
  | { readonly kind: "bytes" }
  | { readonly kind: "table"; readonly table: ReadonlyMap<number, number> };

/** Tables built so far, by decoder label: each is built once, on first use. @internal */
const tables = new Map<string, ReadonlyMap<number, number>>();

/**
 * The character-to-byte table for a single-byte set, from the reader's own decode of each byte
 * 0x80 to 0xFF: a byte the decode refuses has no character. Bytes below 0x80 are ASCII in every
 * set this serves and are written directly, so they are not in the table. `undefined` when this
 * runtime cannot decode the set.
 *
 * @internal
 */
function tableFor(decoder: string): ReadonlyMap<number, number> | undefined {
  const cached = tables.get(decoder);
  if (cached !== undefined) return cached;
  let decodeByte: (byte: number) => string;
  if (decoder === "windows-1252") {
    decodeByte = (byte) => decodeWindows1252(Uint8Array.of(byte));
  } else {
    let strict: InstanceType<typeof TextDecoder>;
    try {
      strict = new TextDecoder(decoder, { fatal: true });
    } catch {
      return undefined;
    }
    decodeByte = (byte) => strict.decode(Uint8Array.of(byte));
  }
  const table = new Map<number, number>();
  for (let byte = 0x80; byte <= 0xff; byte++) {
    let text: string;
    try {
      text = decodeByte(byte);
    } catch {
      continue;
    }
    table.set(text.charCodeAt(0), byte);
  }
  tables.set(decoder, table);
  return table;
}

/**
 * The first repetition of MSH-18 in the emitted text, trimmed, read as the reader reads it off the
 * wire; `undefined` when blank.
 *
 * @internal
 */
function declaredCharset(text: string, msg: Hl7Message): string | undefined {
  const enc = msg.encodingCharacters;
  const msh = text.slice(0, text.indexOf("\r"));
  const field = msh.split(enc.field)[17];
  if (field === undefined) return undefined;
  const repetition = field.indexOf(enc.repetition);
  const first = (repetition === -1 ? field : field.slice(0, repetition)).trim();
  return first === "" ? undefined : first;
}

/** Whether the reader kept this message's bytes as a latin1 reading and said so. @internal */
function readAsBytes(msg: Hl7Message): boolean {
  return msg.warnings.some(
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
 *
 * @internal
 */
function loneSurrogate(text: string): number {
  for (let i = 0; i < text.length; i++) {
    const unit = text.charCodeAt(i);
    if (unit < 0xd800 || unit > 0xdfff) continue;
    const next = text.charCodeAt(i + 1);
    if (unit <= 0xdbff && next >= 0xdc00 && next <= 0xdfff) {
      i++;
      continue;
    }
    return i;
  }
  return -1;
}

/**
 * Write `msg` as bytes in its declared character set, or in `options.charset`. See the module
 * header for how each set is written; throws {@link Hl7EncodeError} rather than substitute a byte.
 *
 * @internal
 */
export function emitBytes(msg: Hl7Message, options: ToBytesOptions = {}): Buffer {
  const text = emitMessage(msg);
  const label = options.charset ?? declaredCharset(text, msg);
  const resolution = resolveCharset(label);
  const shown = safeCharsetLabel(resolution.canonical);
  let writer: Writer;
  if (resolution.treatment === "verbatim" || readAsBytes(msg)) {
    writer = { kind: "bytes" };
  } else if (resolution.decoder === "utf-8") {
    writer = { kind: "utf-8" };
  } else if (resolution.decoder === "latin1") {
    writer = { kind: "bytes" };
  } else {
    const table = tableFor(resolution.decoder);
    if (table === undefined) {
      throw new Hl7EncodeError("UNSUPPORTED_CHARSET", { segmentIndex: 0, fieldIndex: 18 }, shown);
    }
    writer = { kind: "table", table };
  }

  if (writer.kind === "utf-8") {
    const bad = loneSurrogate(text);
    if (bad !== -1) {
      throw new Hl7EncodeError("UNENCODABLE_CHARACTER", positionOf(text, bad, msg), shown);
    }
    return Buffer.from(text, "utf8");
  }

  const out = Buffer.allocUnsafe(text.length);
  for (let i = 0; i < text.length; i++) {
    const unit = text.charCodeAt(i);
    let byte: number | undefined;
    if (unit < 0x80) byte = unit;
    else if (writer.kind === "bytes") byte = unit <= 0xff ? unit : undefined;
    else byte = writer.table.get(unit);
    if (byte === undefined) {
      throw new Hl7EncodeError("UNENCODABLE_CHARACTER", positionOf(text, i, msg), shown);
    }
    out[i] = byte;
  }
  return out;
}
