/**
 * HL7 escape-sequence handling for the `@cosyte/hl7` parser pipeline
 * — expands reserved-delimiter escapes on parse (`unescape`) and re-escapes
 * them back when emitting spec-clean HL7 on serialize (`reescape`).
 *
 * The HL7 v2 spec reserves the delimiter characters (field, component,
 * repetition, escape, subcomponent, and the v2.7+ truncation char) plus the
 * newline shorthand `\.br\`. Whenever a sender needs one of those characters
 * to appear inside user data, it must escape it using the active escape
 * character (default `\`).
 *
 * **Recognition vs decoding.** The HL7 spec defines four families of escape
 * sequences. We **decode** sequences whose meaning is byte-exact (delimiter
 * back-substitution, hex, newline, truncation char). We **recognize and
 * preserve verbatim** sequences whose intent is presentational or sender-
 * specific — decoding them would either lose information (formatting/charset)
 * or invent a rendering policy the spec leaves to the consumer. Either way,
 * a recognized standard sequence never emits `UNKNOWN_ESCAPE_SEQUENCE`;
 * that warning is reserved for genuinely-unknown bodies (`\Z..\`, garbage).
 *
 * Decoded sequences (consumed by `expandSequence`):
 *   \F\    → enc.field         (field separator)
 *   \S\    → enc.component     (component separator)
 *   \T\    → enc.subcomponent  (subcomponent separator)
 *   \R\    → enc.repetition    (repetition separator)
 *   \E\    → enc.escape        (escape character itself)
 *   \P\    → enc.truncation ?? "#"  (truncation char, HL7 v2.7+ §2.5.5.2)
 *   \.br\  → "\n"              (newline shorthand)
 *   \X..\  → hex decode (2 hex digits per byte; 0x00..0xFF code points)
 *
 * Recognized but preserved verbatim (no decoding, no warning):
 *   \H\, \N\                          highlight start / normal text (§2.7.1)
 *   \.sp\, \.in\, \.ti\, \.fi\,       formatting commands (§2.7.6, kept as
 *   \.nf\, \.ce\                       semantic sentinels for a renderer)
 *   \Cxxyy\, \Mxxyyzz\                single- / multi-byte charset switch
 *                                       (§2.7.4 — sender-local byte sequences;
 *                                       decoding requires charset context
 *                                       this module does not have)
 *
 * Genuinely unknown (still warns + preserve verbatim):
 *   \Z..\  → vendor-specific. Profiles may register vendor handlers later.
 *   anything else (garbage, unterminated)
 */

import type { EncodingCharacters, Hl7Position } from "./types.js";
import {
  unknownEscapeSequence,
  unterminatedEscapeSequence,
  type Hl7ParseWarning,
} from "./warnings.js";

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
      // The warning carries NEITHER the tail content NOR its length (the
      // remainder is arbitrary field text, potentially PHI) — only the fact
      // and position.
      emit(unterminatedEscapeSequence(position));
      out += input.slice(i);
      break;
    }
    const seq = input.slice(i + 1, close);
    const expanded = expandSequence(seq, enc);
    if (expanded !== null) {
      out += expanded;
    } else if (isRecognizedPreservedEscape(seq)) {
      // Standard sequence we deliberately do not decode (formatting / highlight
      // / charset). Preserve verbatim so round-trip is exact; no warning.
      out += esc + seq + esc;
    } else {
      emit(unknownEscapeSequence(position, seq));
      out += esc + seq + esc;
    }
    i = close + 1;
  }
  return out;
}

/** Spec default truncation char per HL7 v2.7+ §2.5.5.2. */
const DEFAULT_TRUNCATION_CHAR = "#";

/** Highlight and formatting escapes that we recognize-but-preserve. */
const RECOGNIZED_PRESERVED_SET: ReadonlySet<string> = new Set([
  "H", // begin highlighting (§2.7.1)
  "N", // normal text — end highlighting (§2.7.1)
  ".sp", // vertical skip (§2.7.6)
  ".in", // indent
  ".ti", // temporary indent
  ".fi", // begin word wrap
  ".nf", // end word wrap
  ".ce", // center next line
]);

/**
 * Returns true for a spec-defined escape body the parser recognizes but
 * deliberately does not decode — recognizing it suppresses the
 * `UNKNOWN_ESCAPE_SEQUENCE` warning while preserving the sequence verbatim
 * so the serializer round-trips it byte-for-byte. Covers HL7 v2 §2.7.1
 * highlight, §2.7.6 formatting commands, and §2.7.4 charset switches
 * (`\Cxxyy\` single-byte, `\Mxxyyzz\` multi-byte; xx/yy/zz are hex digit
 * pairs).
 *
 * @internal
 */
function isRecognizedPreservedEscape(seq: string): boolean {
  if (RECOGNIZED_PRESERVED_SET.has(seq)) return true;
  // \Cxxyy\ — single-byte char set switch (2 hex byte pairs = 4 hex digits).
  if (seq.length === 5 && seq.charAt(0) === "C" && /^[0-9A-Fa-f]{4}$/u.test(seq.slice(1))) {
    return true;
  }
  // \Mxxyyzz\ — multi-byte char set switch (2 or 3 hex byte pairs = 4 or 6 digits).
  if (
    seq.charAt(0) === "M" &&
    (seq.length === 5 || seq.length === 7) &&
    /^[0-9A-Fa-f]+$/u.test(seq.slice(1))
  ) {
    return true;
  }
  return false;
}

/**
 * Expand a known HL7 escape body (the characters between the two escape
 * delimiters) to its decoded value. Returns `null` for any body this
 * function does not decode — `unescape` then routes the body through
 * `isRecognizedPreservedEscape` to decide warn-or-preserve.
 *
 * @internal
 */
function expandSequence(seq: string, enc: EncodingCharacters): string | null {
  if (seq === "F") return enc.field;
  if (seq === "S") return enc.component;
  if (seq === "T") return enc.subcomponent;
  if (seq === "R") return enc.repetition;
  if (seq === "E") return enc.escape;
  // \P\ — truncation character (HL7 v2.7+ §2.5.5.2). Decodes to enc.truncation
  // when MSH-2 declared one (5-char form), otherwise the spec default `#`.
  if (seq === "P") return enc.truncation ?? DEFAULT_TRUNCATION_CHAR;
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
 * Re-escape reserved characters back into their `\X\` forms so the serializer
 * can emit spec-clean HL7. This is the inverse of `unescape` for every
 * delimiter-bearing character; round-trip cleanliness
 * (`unescape(reescape(x, enc), enc, emit, pos) === x`) is a documented
 * property covered by tests.
 *
 * The characters re-escaped:
 *   enc.escape        → \E\
 *   enc.field         → \F\
 *   enc.component     → \S\
 *   enc.subcomponent  → \T\
 *   enc.repetition    → \R\
 *   enc.truncation    → \P\   (only when MSH-2 declared one, v2.7+)
 *   "\n" (LF)         → \.br\
 *   "\r" (CR)         → \X0D\  (a decoded CR is the HL7 segment separator;
 *                               emitting it raw would corrupt wire framing, so
 *                               it re-encodes to its hex escape — see below)
 *
 * **Lossy by construction for the non-delimiter escape families.** `reescape`
 * only knows about the reserved characters above — it cannot reconstruct a
 * recognize-and-preserve escape (`\H\`, formatting, charset, `\Z..\`) or the
 * original bytes of a hex escape (`\X41\` decoded to `A`; casing of `\X0d\`),
 * because those decode to ordinary characters that carry no "I was an escape"
 * marker. Byte-verbatim emit for those families is the serializer's job via
 * the `RawComponent.rawSubcomponents` overlay (see {@link escapeFidelityRaw});
 * `reescape` is the fallback for content that has no overlay (constructed
 * values, `Field`-level re-escapes).
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
  const trunc = enc.truncation;
  let out = "";
  for (const ch of input) {
    if (ch === enc.escape) out += enc.escape + "E" + enc.escape;
    else if (ch === enc.field) out += enc.escape + "F" + enc.escape;
    else if (ch === enc.component) out += enc.escape + "S" + enc.escape;
    else if (ch === enc.subcomponent) out += enc.escape + "T" + enc.escape;
    else if (ch === enc.repetition) out += enc.escape + "R" + enc.escape;
    // \P\ — only emitted when MSH-2 declared a truncation character (v2.7+);
    // for pre-v2.7 encodings the character has no reserved meaning and
    // round-trips as a literal.
    else if (trunc !== undefined && ch === trunc) out += enc.escape + "P" + enc.escape;
    else if (ch === "\n") out += enc.escape + ".br" + enc.escape;
    // A literal CR in decoded content (reachable via a spec-legal \X0D\ hex
    // escape on parse) is the HL7 segment separator — emitting it raw would
    // CORRUPT the wire framing (a phantom segment split mid-field, silently).
    // Re-emit it as its hex escape so the round-trip is stable and the
    // emitted message always stays structurally intact.
    else if (ch === "\r") out += enc.escape + "X0D" + enc.escape;
    else out += ch;
  }
  return out;
}

/**
 * Decide the **escape-fidelity overlay** entry for one subcomponent: the
 * original wire bytes (`rawSub`) to emit verbatim, or `undefined` when the
 * decoded form already re-escapes back to those exact bytes.
 *
 * The rule is a single equality check — `reescape(decoded) === rawSub` — which
 * captures every family correctly by construction:
 * - **Delimiter escapes** (`\F\`→`|`, `\E\`→`\`, `\.br\`→`\n`, `\X0D\`→CR) all
 *   re-escape back to their exact wire bytes, so they get **no overlay** and
 *   ride the `reescape` fast path — no per-subcomponent memory cost.
 * - **Recognize-and-preserve escapes** (`\H\`, `\N\`, formatting, charset,
 *   `\Z..\`) decode to a literal backslash-bearing string that `reescape`
 *   would double-escape (`\H\` → `\E\H\E\`), so `reescape(decoded) !== rawSub`
 *   and the overlay pins the original bytes.
 * - **Hex escapes** (`\X41\`→`A`, non-canonical casing `\X0d\`) decode away
 *   their `\X..\` shape, so the overlay preserves the sender's exact bytes
 *   (value/casing) rather than canonicalizing.
 *
 * Called once per escape-bearing subcomponent during tokenization; the
 * `rawSub.includes(enc.escape)` guard in the caller skips it entirely for the
 * common no-escape subcomponent, so this never runs on plain content.
 *
 * @internal
 */
export function escapeFidelityRaw(
  rawSub: string,
  decoded: string,
  enc: EncodingCharacters,
): string | undefined {
  return reescape(decoded, enc) === rawSub ? undefined : rawSub;
}
