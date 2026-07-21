/**
 * First-class HL7 v2 text codec for `@cosyte/hl7` — the ergonomic
 * decode / encode pair that sits on top of the parser-internal
 * `unescape` / `reescape` primitives.
 *
 * - {@link decodeText} turns a field's escape-bearing wire text into its
 *   decoded value (delimiter + hex + `\.br\` escapes resolved; presentational
 *   escapes preserved verbatim), with no warning plumbing to wire up.
 * - {@link encodeText} is the **encode-safe** direction: an arbitrary string in,
 *   a spec-clean field body out that can **never inject a delimiter or forge a
 *   component boundary**. This is the primitive Phase T (typed emit) builds on.
 *
 * For a human-readable rendering (formatting commands → whitespace, highlight
 * dropped), use {@link renderText} instead of {@link decodeText}.
 */

import { DEFAULT_ENCODING_CHARACTERS } from "../parser/delimiters.js";
import { reescape, unescape } from "../parser/escapes.js";
import type { EncodingCharacters } from "../parser/types.js";

/** No-op warning sink for the codec's decode direction. @internal */
function ignore(): void {
  /* decode warnings are informational; the decoded string preserves unknown
   * escapes verbatim regardless, so the ergonomic codec drops them. */
}

/**
 * Decode a field's escape-bearing HL7 text to its human value: the five
 * delimiter escapes (`\F\ \S\ \T\ \R\ \E\`), the truncation escape (`\P\`),
 * `\.br\` (→ newline), and hex (`\Xdddd…\`) are resolved; presentational
 * escapes (`\H\`/`\N\`, formatting, charset, vendor `\Z..\`) are **preserved
 * verbatim** so nothing is lost. Never throws.
 *
 * This is the one-call inverse of {@link encodeText} for delimiter-bearing
 * content. It does **not** interpret formatting/highlight — for a normalized
 * display string use {@link renderText}.
 *
 * @param input - the field's escape-bearing text.
 * @param enc - encoding characters; defaults to the HL7 standard `|^~\&`.
 * @returns the decoded value string.
 *
 * @example
 * ```ts
 * import { decodeText } from "@cosyte/hl7";
 * decodeText("Doe\\S\\John");   // "Doe^John"  — \S\ → component separator
 * decodeText("line1\\.br\\line2"); // "line1\nline2"
 * ```
 */
export function decodeText(
  input: string,
  enc: EncodingCharacters = DEFAULT_ENCODING_CHARACTERS,
): string {
  return unescape(input, enc, ignore, { segmentIndex: 0 });
}

/**
 * **Encode-safe** direction: escape an arbitrary string so it can be placed in
 * an HL7 field as data without ever breaking framing. Every reserved character
 * — the escape char (escaped **first**, so decoding is unambiguous), the field,
 * component, subcomponent, and repetition separators, the declared truncation
 * char, and the framing-critical `\n`/`\r` — is replaced by its escape
 * sequence, so the value **cannot inject a delimiter or forge a component /
 * subcomponent / repetition boundary**.
 *
 * The hard invariant, property-tested over arbitrary strings:
 * `decodeText(encodeText(s, enc), enc) === s`, and a message field carrying
 * `encodeText(s)` **cannot forge a component / subcomponent / repetition
 * boundary or break framing** — the value never escapes its field.
 *
 * Two caveats are inherent to HL7 field encoding, not to this codec, and apply
 * to *whole-field* re-parse (they do not weaken the no-injection guarantee):
 * the two-character string `""` is HL7's explicit-null token, so a field whose
 * entire value is `""` re-parses as null; and the default parser trims field
 * whitespace, so a value with leading/trailing spaces re-parses trimmed. Encode
 * such values into a component/subcomponent position, or parse with trimming
 * off, to preserve them exactly.
 *
 * @param input - the arbitrary string to encode.
 * @param enc - encoding characters; defaults to the HL7 standard `|^~\&`.
 * @returns the spec-clean, delimiter-safe field body.
 *
 * @example
 * ```ts
 * import { encodeText, parseHL7 } from "@cosyte/hl7";
 * // A value full of delimiters cannot break out of its field:
 * const hostile = "a|b^c~d\\e&f";
 * const body = encodeText(hostile); // "a\\F\\b\\S\\c\\R\\d\\E\\e\\T\\f"
 * const msg = parseHL7(`MSH|^~\\&|A|B|C|D|20260101||ADT^A01|1|P|2.5\rNTE|1||${body}`);
 * msg.segments("NTE")[0]?.field(3).value === hostile; // true — round-trips exactly
 * ```
 */
export function encodeText(
  input: string,
  enc: EncodingCharacters = DEFAULT_ENCODING_CHARACTERS,
): string {
  return reescape(input, enc);
}
