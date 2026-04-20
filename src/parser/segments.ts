/**
 * Segment-split stage for the `@cosyte/hl7` parser pipeline. After
 * input normalization (line endings unified to `\r`), this module turns the
 * single-string input into an ordered array of segment strings with stable
 * positions. Purely mechanical — no HL7 semantics are evaluated here. MSH
 * detection, delimiter discovery, and field tokenization all live in sibling
 * modules (`delimiters.ts`, `tokenize.ts`).
 *
 * The stage follows the Postel-Law "liberal parser" posture: preserves empty
 * middle segments (so that `segmentIndex` stays stable for later warnings)
 * and drops a single trailing `\r` (so that the universally-seen HL7 "end
 * with CR" convention does not produce a spurious empty final segment).
 */

/**
 * Splits a normalized (line-ending = `\r`) HL7 input string into an ordered
 * array of segment strings. Preserves original order including repeated,
 * empty, and Z-segments. A single trailing `\r` does NOT create a final
 * empty segment; a MIDDLE empty segment (two consecutive `\r`) IS preserved
 * so downstream `segmentIndex` positions stay stable against the original
 * input.
 *
 * @example
 * ```ts
 * import { splitSegments } from "@cosyte/hl7";
 * splitSegments("MSH|A\rPID|1\r"); // ["MSH|A", "PID|1"]
 * splitSegments("MSH|A\r\rPID|1"); // ["MSH|A", "", "PID|1"]
 * ```
 */
export function splitSegments(normalized: string): readonly string[] {
  // Strip a single trailing \r only (preserves middle empty segments).
  const trimmed = normalized.endsWith("\r") ? normalized.slice(0, -1) : normalized;
  if (trimmed.length === 0) return [];
  return trimmed.split("\r");
}

/**
 * Build a short, fixed-length snippet of a segment string for attaching to
 * fatal-error context. Truncates to 40 chars with a trailing ellipsis so the
 * thrown `Hl7ParseError.snippet` stays bounded regardless of input size.
 *
 * @example
 * ```ts
 * import { snippet } from "@cosyte/hl7";
 * snippet("MSH|^~\\&|APP|FAC"); // "MSH|^~\\&|APP|FAC"
 * ```
 *
 * @internal
 */
export function snippet(segment: string): string {
  return segment.length > 40 ? segment.slice(0, 40) + "\u2026" : segment;
}
