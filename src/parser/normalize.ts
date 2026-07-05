/**
 * Input normalization stage for the `@cosyte/hl7` parser pipeline.
 * Normalizes mixed line endings (`\r\n`, `\n`, `\r`) to a single `\r` terminator
 * and — for `Buffer` input — decodes bytes into a string using MSH-18 charset
 * resolution with a UTF-8 fallback.
 *
 * Per CONTEXT.md D-03 the canonical preprocessing order is:
 *   1. EMPTY_INPUT check (fatal)
 *   2. BOM strip (silent)
 *   3. MLLP strip
 *   4. Line-ending normalization (this module)
 *
 * Plan 06's `parseHL7` composition owns steps 1–3 explicitly so the ordering is
 * inspectable at the pipeline site. This module is a pure string/Buffer
 * transform that does NOT throw and does NOT strip BOM.
 */

import { resolveCharset } from "./charset.js";
import { unknownCharset, unsupportedCharset } from "./warnings.js";
import type { Hl7ParseWarning } from "./warnings.js";

/**
 * Position attached to every charset warning: MSH (segment 0), field 18. The
 * message carries the charset code only — never a field value — so no PHI is
 * exposed.
 *
 * @internal
 */
const CHARSET_POSITION = { segmentIndex: 0, fieldIndex: 18 } as const;

/**
 * Preserve a byte stream as a 1:1 `latin1` reading (every byte 0x00..0xFF →
 * U+0000..U+00FF) and normalize line endings for segment splitting. The
 * fail-safe for any charset the parser does not decode.
 *
 * Recoverability is exact for **single-byte** content: the HL7 structural bytes
 * (CR/LF terminators, `|^~\&`) are unambiguous, so a field's content bytes
 * survive and re-encode via `Buffer.from(value, "latin1")`. For **multibyte**
 * content a code-unit byte can equal a structural byte (e.g. a UTF-16 `0x0D`);
 * line-ending normalization and segment splitting then act on it, so framing is
 * best-effort — the documented reason multibyte decode is deferred, not claimed.
 *
 * @internal
 */
function preserveVerbatim(input: Buffer): string {
  return normalize(input.toString("latin1"));
}

/**
 * Callback shape for warning emission during `normalizeBuffer`. Plan 06 wires
 * the real chokepoint (push onto `Hl7Message.warnings`, invoke `onWarning`,
 * escalate in strict mode). This type is internal to the parser modules.
 *
 * @internal
 */
type EmitFn = (warning: Hl7ParseWarning) => void;

/**
 * Normalize line endings in an HL7 message string to a single `\r` terminator.
 *
 * Converts `\r\n` and standalone `\n` characters to `\r`; existing `\r`
 * characters are preserved. The replacement order matters: `\r\n` is handled
 * first so the sequence is not counted twice. Empty and whitespace-only input
 * is returned unchanged — the `EMPTY_INPUT` fatal is Plan 06's responsibility.
 * A leading UTF-8 BOM is preserved; BOM stripping is also Plan 06's job.
 *
 * @example
 * ```ts
 * import { normalize } from "@cosyte/hl7";
 * const clean = normalize("MSH|^~\\&|APP\r\nPID|1\nEVN|A");
 * // clean === "MSH|^~\\&|APP\rPID|1\rEVN|A"
 * ```
 */
export function normalize(input: string): string {
  return input.replace(/\r\n/g, "\r").replace(/\n/g, "\r");
}

/**
 * Decode a `Buffer` of raw HL7 bytes into a string, then apply line-ending
 * normalization. Charset resolution runs through the frozen HL7 Table-0211
 * registry ({@link resolveCharset}):
 *
 *  - `8859/1` (Latin-1) is decoded via `latin1` — byte-exact, never fails;
 *  - the other faithfully-decodable sets (ASCII, `8859/2`–`8859/8`/`10`/`13`–`16`,
 *    UTF-8) are decoded **strictly** (`fatal: true`); a byte invalid / undefined
 *    for the declared set (or an ICU build lacking the label) falls through to
 *    the verbatim fail-safe rather than emitting a silent `U+FFFD`. (`8859/9` and
 *    `8859/11` are NOT decoded — Node's ICU aliases them to windows-1254/874,
 *    which remap the C1 range — so they take the verbatim path below);
 *  - a **recognized-but-not-decoded** set (the multibyte / ISO-2022 East-Asian
 *    sets, UTF-16/32) preserves the bytes verbatim and emits `UNSUPPORTED_CHARSET`;
 *  - an **unrecognized** label preserves the bytes verbatim and emits
 *    `UNKNOWN_CHARSET`.
 *
 * The fail-safe never guesses an encoding and never silently corrupts: an
 * undecoded / un-decodable set is preserved as a `latin1` byte reading, not
 * replacement characters, so single-byte content stays byte-recoverable. A blank
 * / `undefined` charset is the ASCII default, decoded strictly as UTF-8 (a
 * superset that renders 7-bit content identically and handles the common
 * undeclared-UTF-8 feed); non-UTF-8 bytes under that default preserve verbatim +
 * warn rather than corrupt.
 *
 * Callers (Plan 06) remain responsible for the `EMPTY_INPUT` fatal check,
 * BOM stripping, and MLLP framing removal on the returned text.
 *
 * @example
 * ```ts
 * import { normalizeBuffer } from "@cosyte/hl7";
 * const text = normalizeBuffer(
 *   Buffer.from("MSH|^~\\&|APP\rPID|1", "utf-8"),
 *   "UTF-8",
 *   (w) => console.warn(w.code),
 * );
 * ```
 */
export function normalizeBuffer(input: Buffer, charset: string | undefined, emit: EmitFn): string {
  const resolution = resolveCharset(charset);
  if (resolution.treatment === "decode") {
    if (resolution.decoder === "latin1") {
      // True ISO-8859-1: latin1 maps every byte losslessly and cannot fail.
      // (Node's `TextDecoder("iso-8859-1")` is windows-1252 — wrong for the C1
      // range — so it is intentionally not used here.)
      return normalize(input.toString("latin1"));
    }
    try {
      // STRICT decode (fatal: true): a byte that is invalid / undefined for the
      // declared set throws rather than silently becoming U+FFFD (irreversible
      // loss). On failure — malformed content, or an ICU build lacking the
      // label — we preserve the bytes verbatim + warn instead of emitting
      // replacement-char-corrupted text. Valid content still decodes; this is
      // NOT a wholesale wrong-encoding guess.
      const decoder = new TextDecoder(resolution.decoder, { fatal: true });
      return normalize(decoder.decode(input));
    } catch {
      emit(unsupportedCharset(CHARSET_POSITION, resolution.canonical));
      return preserveVerbatim(input);
    }
  }
  // Verbatim path: recognized-but-not-decoded → UNSUPPORTED_CHARSET;
  // unrecognized label → UNKNOWN_CHARSET.
  if (resolution.recognized) {
    emit(unsupportedCharset(CHARSET_POSITION, resolution.canonical));
  } else {
    emit(unknownCharset(CHARSET_POSITION, charset ?? ""));
  }
  return preserveVerbatim(input);
}
