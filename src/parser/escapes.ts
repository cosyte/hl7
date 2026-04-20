/**
 * HL7 escape-sequence handling for the `@cosyte/hl7` parser pipeline
 * — expands reserved-delimiter escapes on parse (`unescape`) and re-escapes
 * them back when emitting spec-clean HL7 on serialize (`reescape`).
 *
 * The HL7 v2 spec reserves five delimiter characters (field, component,
 * repetition, escape, subcomponent) plus the optional newline shorthand
 * `\.br\`. Whenever a sender needs one of those characters to appear inside
 * user data, it must escape it using the active escape character (default
 * `\`). This module handles the round-trip for every known form and
 * preserves unknown sequences verbatim with an `UNKNOWN_ESCAPE_SEQUENCE`
 * warning (TOL-10 semantics).
 *
 * Known sequences (consumed by `expandSequence`):
 *   \F\    → enc.field         (field separator)
 *   \S\    → enc.component     (component separator)
 *   \T\    → enc.subcomponent  (subcomponent separator)
 *   \R\    → enc.repetition    (repetition separator)
 *   \E\    → enc.escape        (escape character itself)
 *   \.br\  → "\n"              (newline shorthand)
 *   \X..\  → hex decode (2 hex digits per byte; 0x00..0xFF code points)
 *   \Z..\  → vendor-specific; Phase 2 keeps an empty allow-list, so every
 *             \Z..\ currently warns and is preserved verbatim. Phase 6
 *             profiles may register vendor handlers.
 */

import type { EncodingCharacters, Hl7Position } from "./types.js";
import { unknownEscapeSequence, type Hl7ParseWarning } from "./warnings.js";

/**
 * Expand HL7 escape sequences (`\F\`, `\S\`, `\T\`, `\R\`, `\E\`, `\.br\`,
 * `\X..\`, vendor-specific `\Z..\`) inside a field, component, or
 * subcomponent string. The escape delimiter comes from `enc.escape` (default
 * `\`), so senders using a non-default escape character are handled
 * transparently.
 *
 * Unknown or malformed sequences are preserved VERBATIM in the output and
 * emit an `UNKNOWN_ESCAPE_SEQUENCE` warning via `emit`. Unterminated escapes
 * (an escape character with no closing partner before end-of-input) are also
 * preserved in full and warn once — the scan is strictly O(n) and cannot
 * infinite-loop on malformed input.
 *
 * @example
 * ```ts
 * import { unescape, DEFAULT_ENCODING_CHARACTERS } from "@cosyte/hl7";
 * const warnings: Array<unknown> = [];
 * const out = unescape(
 *   "patient\\F\\name\\.br\\DOB",
 *   DEFAULT_ENCODING_CHARACTERS,
 *   (w) => warnings.push(w),
 *   { segmentIndex: 1, fieldIndex: 5 },
 * );
 * // out === "patient|name\nDOB"
 * ```
 */
export function unescape(
  input: string,
  enc: EncodingCharacters,
  emit: (w: Hl7ParseWarning) => void,
  position: Hl7Position,
): string {
  const esc = enc.escape;
  if (!input.includes(esc)) return input;

  let out = "";
  let i = 0;
  while (i < input.length) {
    const ch = input.charAt(i);
    if (ch !== esc) {
      out += ch;
      i++;
      continue;
    }
    const close = input.indexOf(esc, i + 1);
    if (close === -1) {
      // Unterminated escape — preserve the rest verbatim, warn once, stop.
      emit(unknownEscapeSequence(position, input.slice(i)));
      out += input.slice(i);
      break;
    }
    const seq = input.slice(i + 1, close);
    const expanded = expandSequence(seq, enc);
    if (expanded !== null) {
      out += expanded;
    } else {
      emit(unknownEscapeSequence(position, seq));
      out += esc + seq + esc;
    }
    i = close + 1;
  }
  return out;
}

/**
 * Expand a known HL7 escape body (the characters between the two escape
 * delimiters). Returns `null` when the body is unknown, malformed, or a
 * vendor `\Z..\` sequence — the caller is responsible for preserving the
 * verbatim form and emitting a warning.
 *
 * @internal
 */
function expandSequence(seq: string, enc: EncodingCharacters): string | null {
  if (seq === "F") return enc.field;
  if (seq === "S") return enc.component;
  if (seq === "T") return enc.subcomponent;
  if (seq === "R") return enc.repetition;
  if (seq === "E") return enc.escape;
  if (seq === ".br") return "\n";
  if (seq.startsWith("X")) {
    const hex = seq.slice(1);
    if (hex.length === 0 || hex.length % 2 !== 0 || !/^[0-9A-Fa-f]+$/u.test(hex)) {
      return null;
    }
    let decoded = "";
    for (let j = 0; j < hex.length; j += 2) {
      const byte = parseInt(hex.slice(j, j + 2), 16);
      decoded += String.fromCharCode(byte);
    }
    return decoded;
  }
  // \Z..\ is vendor-specific; Phase 2 maintains no allow-list, so callers
  // receive `null` and emit the UNKNOWN_ESCAPE_SEQUENCE warning. Future
  // Phase 6 profiles can register their own vendor handlers.
  return null;
}

/**
 * Re-escape the five HL7 delimiter characters and the newline shorthand back
 * into their `\X\` forms so the serializer can emit spec-clean HL7. This is
 * the inverse of `unescape` for every delimiter-bearing character; round-trip
 * cleanliness (`unescape(reescape(x, enc), enc, emit, pos) === x`) is a
 * documented property covered by tests.
 *
 * Iteration uses `for..of`, which walks Unicode code points (not UTF-16 code
 * units), so user-supplied content containing non-BMP characters round-trips
 * correctly without special surrogate-pair handling.
 *
 * @example
 * ```ts
 * import { reescape, DEFAULT_ENCODING_CHARACTERS } from "@cosyte/hl7";
 * reescape("Smith|John", DEFAULT_ENCODING_CHARACTERS); // "Smith\\F\\John"
 * reescape("line1\nline2", DEFAULT_ENCODING_CHARACTERS); // "line1\\.br\\line2"
 * ```
 */
export function reescape(input: string, enc: EncodingCharacters): string {
  if (input.length === 0) return input;
  let out = "";
  for (const ch of input) {
    if (ch === enc.escape) out += enc.escape + "E" + enc.escape;
    else if (ch === enc.field) out += enc.escape + "F" + enc.escape;
    else if (ch === enc.component) out += enc.escape + "S" + enc.escape;
    else if (ch === enc.subcomponent) out += enc.escape + "T" + enc.escape;
    else if (ch === enc.repetition) out += enc.escape + "R" + enc.escape;
    else if (ch === "\n") out += enc.escape + ".br" + enc.escape;
    else out += ch;
  }
  return out;
}
