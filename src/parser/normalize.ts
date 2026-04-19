/**
 * Input normalization stage for the `@cosyte/hl7-parser` parser pipeline.
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

import { unknownCharset } from "./warnings.js";
import type { Hl7ParseWarning } from "./warnings.js";

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
 * import { normalize } from "@cosyte/hl7-parser";
 * const clean = normalize("MSH|^~\\&|APP\r\nPID|1\nEVN|A");
 * // clean === "MSH|^~\\&|APP\rPID|1\rEVN|A"
 * ```
 */
export function normalize(input: string): string {
  return input.replace(/\r\n/g, "\r").replace(/\n/g, "\r");
}

/**
 * Decode a `Buffer` of raw HL7 bytes into a string, then apply line-ending
 * normalization. Charset resolution uses a short whitelist of common HL7
 * MSH-18 aliases (UTF-8, ASCII, ISO-8859-1/15) and delegates anything else to
 * `TextDecoder`. Unknown labels emit a single `UNKNOWN_CHARSET` warning and
 * fall back to UTF-8.
 *
 * Callers (Plan 06) remain responsible for the `EMPTY_INPUT` fatal check,
 * BOM stripping, and MLLP framing removal on the returned text.
 *
 * @example
 * ```ts
 * import { normalizeBuffer } from "@cosyte/hl7-parser";
 * const text = normalizeBuffer(
 *   Buffer.from("MSH|^~\\&|APP\rPID|1", "utf-8"),
 *   "UTF-8",
 *   (w) => console.warn(w.code),
 * );
 * ```
 */
export function normalizeBuffer(
  input: Buffer,
  charset: string | undefined,
  emit: EmitFn,
): string {
  const requested = charset ?? "utf-8";
  let decoder: InstanceType<typeof TextDecoder>;
  try {
    decoder = new TextDecoder(mapHl7Charset(requested));
  } catch {
    emit(unknownCharset({ segmentIndex: 0 }, requested));
    decoder = new TextDecoder("utf-8");
  }
  const decoded = decoder.decode(input);
  return normalize(decoded);
}

/**
 * Map common HL7 MSH-18 charset aliases (e.g. `UNICODE UTF-8`, `8859/1`) to
 * labels that Node's `TextDecoder` recognizes. Unknown labels are passed
 * through uppercased so the caller's `try/catch` can trip `UNKNOWN_CHARSET`.
 *
 * Exported for the `parseHL7` Buffer-path's override-vs-declared charset
 * comparison — normalising both strings through this shared table is the
 * only way to avoid false-positive `ENCODING_MISMATCH` warnings on synonym
 * pairs (e.g. `UNICODE UTF-8` vs `UTF-8`, or `8859/1` vs `ISO-8859-1`).
 *
 * @internal
 */
export function mapHl7Charset(raw: string): string {
  const trimmed = raw.trim().toUpperCase();
  switch (trimmed) {
    case "":
    case "UNICODE":
    case "UNICODE UTF-8":
    case "UTF-8":
    case "UTF8":
      return "utf-8";
    case "ASCII":
    case "US-ASCII":
      return "ascii";
    case "8859/1":
    case "ISO-8859-1":
      return "iso-8859-1";
    case "8859/15":
    case "ISO-8859-15":
      return "iso-8859-15";
    default:
      return trimmed;
  }
}
