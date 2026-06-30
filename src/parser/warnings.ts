/**
 * Tier-2 warning registry and factories for the `@cosyte/hl7` parser
 * pipeline. Consumers compare `warning.code === WARNING_CODES.<CODE>` to
 * narrow and react; the parser uses the factories here to construct every
 * warning it emits so that messages, payload shape, and positional context
 * stay consistent across stages.
 */

import type { Hl7Position } from "./types.js";

/**
 * Stable string codes for every Tier-2 warning the parser may emit. The
 * registry is frozen via `as const` so TypeScript infers the exact string
 * literal union for `WarningCode` — there is zero runtime cost and no
 * magic-string comparisons for consumers.
 *
 * @example
 * ```ts
 * import { parseHL7, WARNING_CODES } from "@cosyte/hl7";
 * const msg = parseHL7(raw);
 * if (msg.warnings.some((w) => w.code === WARNING_CODES.MLLP_FRAMING_STRIPPED)) {
 *   // handle MLLP-wrapped input
 * }
 * ```
 */
export const WARNING_CODES = {
  MLLP_FRAMING_STRIPPED: "MLLP_FRAMING_STRIPPED",
  FIELD_WHITESPACE_TRIMMED: "FIELD_WHITESPACE_TRIMMED",
  UNKNOWN_ESCAPE_SEQUENCE: "UNKNOWN_ESCAPE_SEQUENCE",
  TIMESTAMP_FALLBACK_FORMAT: "TIMESTAMP_FALLBACK_FORMAT",
  SEGMENT_CASE: "SEGMENT_CASE",
  EXTRA_FIELDS: "EXTRA_FIELDS",
  UNKNOWN_SEGMENT: "UNKNOWN_SEGMENT",
  DUPLICATE_REQUIRED_SEGMENT: "DUPLICATE_REQUIRED_SEGMENT",
  ENCODING_MISMATCH: "ENCODING_MISMATCH",
  MISSING_REQUIRED_FIELD: "MISSING_REQUIRED_FIELD",
  MISSING_EXPECTED_GROUP: "MISSING_EXPECTED_GROUP",
  OUT_OF_ORDER_SEGMENT: "OUT_OF_ORDER_SEGMENT",
  VERSION_MISMATCH: "VERSION_MISMATCH",
  UNKNOWN_CHARSET: "UNKNOWN_CHARSET",
  ACK_NO_CORRELATION_ID: "ACK_NO_CORRELATION_ID",
} as const;

/**
 * Discriminant type for `Hl7ParseWarning.code`. Narrowing a warning by this
 * code lets consumers write exhaustive `switch` blocks (enabled by the
 * `switch-exhaustiveness-check` lint rule) and guarantees a typo-free
 * comparison against the `WARNING_CODES` registry.
 *
 * @example
 * ```ts
 * import type { Hl7ParseWarning, WarningCode } from "@cosyte/hl7";
 * function describe(w: Hl7ParseWarning): string {
 *   const code: WarningCode = w.code;
 *   switch (code) {
 *     case "MLLP_FRAMING_STRIPPED":
 *       return "stripped MLLP framing";
 *     default:
 *       return `warning: ${code}`;
 *   }
 * }
 * ```
 */
export type WarningCode = (typeof WARNING_CODES)[keyof typeof WARNING_CODES];

/**
 * Data shape for every Tier-2 warning emitted by the parser. Warnings are
 * plain data (distinct from `Hl7ParseError`, which is a thrown `Error`
 * subclass) so they can be safely accumulated into
 * `Hl7Message.warnings` and passed to `onWarning` callbacks.
 *
 * @example
 * ```ts
 * import type { Hl7ParseWarning } from "@cosyte/hl7";
 * const w: Hl7ParseWarning = {
 *   code: "UNKNOWN_SEGMENT",
 *   message: "Unknown segment: ZZZ",
 *   position: { segmentIndex: 4 },
 * };
 * ```
 */
export interface Hl7ParseWarning {
  readonly code: WarningCode;
  readonly message: string;
  readonly position: Hl7Position;
}

/**
 * Build a `MLLP_FRAMING_STRIPPED` warning. Emitted once per parse when the
 * preprocessor detects and removes MLLP framing bytes (`0x0B` / `0x1C` /
 * trailing `0x0D`) from the input.
 *
 * @example
 * ```ts
 * import { mllpFramingStripped } from "@cosyte/hl7";
 * const w = mllpFramingStripped({ segmentIndex: 0 });
 * ```
 */
export function mllpFramingStripped(position: Hl7Position): Hl7ParseWarning {
  return {
    code: WARNING_CODES.MLLP_FRAMING_STRIPPED,
    message: "MLLP framing bytes (VT/FS/CR) were stripped from the input.",
    position,
  };
}

/**
 * Build a `FIELD_WHITESPACE_TRIMMED` warning. Emitted when the parser trims
 * leading or trailing whitespace from a field value (the `trimFields`
 * option, on by default).
 *
 * @example
 * ```ts
 * import { fieldWhitespaceTrimmed } from "@cosyte/hl7";
 * const w = fieldWhitespaceTrimmed(
 *   { segmentIndex: 1, fieldIndex: 5 },
 *   "  SMITH ",
 *   "SMITH",
 * );
 * ```
 */
export function fieldWhitespaceTrimmed(
  position: Hl7Position,
  original: string,
  trimmed: string,
): Hl7ParseWarning {
  return {
    code: WARNING_CODES.FIELD_WHITESPACE_TRIMMED,
    message: `Field had leading/trailing whitespace trimmed: "${original}" -> "${trimmed}".`,
    position,
  };
}

/**
 * Build an `UNKNOWN_ESCAPE_SEQUENCE` warning. Emitted when the tokenizer
 * encounters an escape sequence (e.g. `\Z99\`) that is not in the standard
 * HL7 set and not claimed by a loaded profile's vendor allow-list.
 *
 * @example
 * ```ts
 * import { unknownEscapeSequence } from "@cosyte/hl7";
 * const w = unknownEscapeSequence({ segmentIndex: 2, fieldIndex: 3 }, "Z99");
 * ```
 */
export function unknownEscapeSequence(position: Hl7Position, sequence: string): Hl7ParseWarning {
  return {
    code: WARNING_CODES.UNKNOWN_ESCAPE_SEQUENCE,
    message: `Unknown HL7 escape sequence \\${sequence}\\ preserved verbatim.`,
    position,
  };
}

/**
 * Build a `TIMESTAMP_FALLBACK_FORMAT` warning. Emitted when a date/time
 * field could not be parsed with its primary (strict HL7) format but a
 * fallback format from `ParseOptions.dateFormats` or built-in fallbacks
 * succeeded.
 *
 * @example
 * ```ts
 * import { timestampFallbackFormat } from "@cosyte/hl7";
 * const w = timestampFallbackFormat(
 *   { segmentIndex: 1, fieldIndex: 7 },
 *   "YYYY-MM-DD",
 * );
 * ```
 */
export function timestampFallbackFormat(
  position: Hl7Position,
  matchedFormat: string,
): Hl7ParseWarning {
  return {
    code: WARNING_CODES.TIMESTAMP_FALLBACK_FORMAT,
    message: `Timestamp parsed with fallback format "${matchedFormat}" (not the strict HL7 format).`,
    position,
  };
}

/**
 * Build a `SEGMENT_CASE` warning. Emitted when a segment identifier is not
 * all-uppercase (e.g. `pid` instead of `PID`). The parser accepts the
 * segment; the warning alerts consumers to non-conforming senders.
 *
 * @example
 * ```ts
 * import { segmentCase } from "@cosyte/hl7";
 * const w = segmentCase({ segmentIndex: 3 }, "pid");
 * ```
 */
export function segmentCase(position: Hl7Position, observed: string): Hl7ParseWarning {
  return {
    code: WARNING_CODES.SEGMENT_CASE,
    message: `Segment identifier "${observed}" is not uppercase; normalized to "${observed.toUpperCase()}".`,
    position,
  };
}

/**
 * Build an `EXTRA_FIELDS` warning. Emitted when a segment contains more
 * fields than the profile definition (or HL7 spec) declares — the extras
 * are preserved on `RawSegment.fields` but flagged for consumers.
 *
 * @example
 * ```ts
 * import { extraFields } from "@cosyte/hl7";
 * const w = extraFields({ segmentIndex: 4 }, "PID", 3);
 * ```
 */
export function extraFields(
  position: Hl7Position,
  segmentName: string,
  extraCount: number,
): Hl7ParseWarning {
  return {
    code: WARNING_CODES.EXTRA_FIELDS,
    message: `Segment "${segmentName}" has ${String(extraCount)} more field(s) than the profile declares.`,
    position,
  };
}

/**
 * Build an `UNKNOWN_SEGMENT` warning. Emitted when a segment identifier is
 * not in the HL7 spec's standard set and not registered in the active
 * profile's `customSegments`.
 *
 * @example
 * ```ts
 * import { unknownSegment } from "@cosyte/hl7";
 * const w = unknownSegment({ segmentIndex: 7 }, "ZZZ");
 * ```
 */
export function unknownSegment(position: Hl7Position, segmentName: string): Hl7ParseWarning {
  return {
    code: WARNING_CODES.UNKNOWN_SEGMENT,
    message: `Unknown segment "${segmentName}" — not in HL7 spec and no profile claim.`,
    position,
  };
}

/**
 * Build a `DUPLICATE_REQUIRED_SEGMENT` warning. Emitted when a segment the
 * profile marks as singleton appears more than once (e.g. two `MSH`
 * segments). The parser keeps both; the warning alerts the consumer to
 * potential sender bugs.
 *
 * @example
 * ```ts
 * import { duplicateRequiredSegment } from "@cosyte/hl7";
 * const w = duplicateRequiredSegment({ segmentIndex: 1 }, "MSH");
 * ```
 */
export function duplicateRequiredSegment(
  position: Hl7Position,
  segmentName: string,
): Hl7ParseWarning {
  return {
    code: WARNING_CODES.DUPLICATE_REQUIRED_SEGMENT,
    message: `Required singleton segment "${segmentName}" appears more than once.`,
    position,
  };
}

/**
 * Build an `ENCODING_MISMATCH` warning. Emitted when the MSH-2 encoding
 * characters declared by the sender do not match what the parser observed
 * downstream (e.g. the sender declares `^~\&` but uses `!@#$` as actual
 * separators in later segments).
 *
 * @example
 * ```ts
 * import { encodingMismatch } from "@cosyte/hl7";
 * const w = encodingMismatch({ segmentIndex: 0 }, "MSH-2 declares ^~\\& but segment used !@#$");
 * ```
 */
export function encodingMismatch(position: Hl7Position, detail: string): Hl7ParseWarning {
  return {
    code: WARNING_CODES.ENCODING_MISMATCH,
    message: `Encoding mismatch: ${detail}`,
    position,
  };
}

/**
 * Build a `MISSING_REQUIRED_FIELD` warning. Emitted when a field the active
 * profile marks as required is empty or missing. Distinct from the
 * `NO_MSH_SEGMENT` fatal, which escalates a missing MSH altogether.
 *
 * @example
 * ```ts
 * import { missingRequiredField } from "@cosyte/hl7";
 * const w = missingRequiredField({ segmentIndex: 0, fieldIndex: 3 }, "MSH", 3);
 * ```
 */
export function missingRequiredField(
  position: Hl7Position,
  segmentName: string,
  fieldIndex: number,
): Hl7ParseWarning {
  return {
    code: WARNING_CODES.MISSING_REQUIRED_FIELD,
    message: `Required field ${segmentName}-${String(fieldIndex)} is missing or empty.`,
    position,
  };
}

/**
 * Build a `MISSING_EXPECTED_GROUP` warning (roadmap Phase G). Emitted once per
 * absent Required segment group when the message's (MSH-9.1, MSH-9.2) type is
 * one the structure safety net recognizes and an expected group is entirely
 * missing — e.g. an `ORU^R01` carrying no `OBR`/`OBX` result group, the
 * signature of a truncated or misrouted feed. Tier-2 and additive: lenient
 * parse never throws on it, `strict` mode may promote it. The message carries
 * only the structural fact (message type, group name, anchor segment names) —
 * NEVER a field value, so no PHI is exposed. `position` references MSH-9.
 *
 * @example
 * ```ts
 * import { missingExpectedGroup } from "@cosyte/hl7";
 * const w = missingExpectedGroup(
 *   { segmentIndex: 0, fieldIndex: 9 },
 *   "ORU^R01",
 *   "result",
 *   ["OBR", "OBX"],
 * );
 * ```
 */
export function missingExpectedGroup(
  position: Hl7Position,
  messageType: string,
  groupName: string,
  anchorSegments: readonly string[],
): Hl7ParseWarning {
  return {
    code: WARNING_CODES.MISSING_EXPECTED_GROUP,
    message:
      `Message type "${messageType}" is missing its expected "${groupName}" segment group ` +
      `(no ${anchorSegments.join("/")}); message may be truncated or misrouted.`,
    position,
  };
}

/**
 * Build an `OUT_OF_ORDER_SEGMENT` warning. Emitted when a segment appears
 * outside the order the active profile declares (e.g. `EVN` appearing
 * before `MSH` in a typical ADT message).
 *
 * @example
 * ```ts
 * import { outOfOrderSegment } from "@cosyte/hl7";
 * const w = outOfOrderSegment({ segmentIndex: 2 }, "EVN");
 * ```
 */
export function outOfOrderSegment(position: Hl7Position, segmentName: string): Hl7ParseWarning {
  return {
    code: WARNING_CODES.OUT_OF_ORDER_SEGMENT,
    message: `Segment "${segmentName}" appears out of the order declared by the active profile.`,
    position,
  };
}

/**
 * Build a `VERSION_MISMATCH` warning. Emitted when MSH-12 declares an HL7
 * version that does not match what the active profile or `ParseOptions`
 * expected.
 *
 * @example
 * ```ts
 * import { versionMismatch } from "@cosyte/hl7";
 * const w = versionMismatch({ segmentIndex: 0, fieldIndex: 12 }, "2.9", "2.5");
 * ```
 */
export function versionMismatch(
  position: Hl7Position,
  declared: string,
  expected: string,
): Hl7ParseWarning {
  return {
    code: WARNING_CODES.VERSION_MISMATCH,
    message: `HL7 version mismatch: message declares "${declared}", expected "${expected}".`,
    position,
  };
}

/**
 * Build an `UNKNOWN_CHARSET` warning. Emitted when MSH-18 declares a
 * character set that `TextDecoder` does not support on the current Node
 * runtime; the parser falls back to UTF-8 and flags the decision.
 *
 * @example
 * ```ts
 * import { unknownCharset } from "@cosyte/hl7";
 * const w = unknownCharset({ segmentIndex: 0, fieldIndex: 18 }, "ISO IR 999");
 * ```
 */
export function unknownCharset(position: Hl7Position, requested: string): Hl7ParseWarning {
  return {
    code: WARNING_CODES.UNKNOWN_CHARSET,
    message: `Unknown character set "${requested}"; falling back to UTF-8.`,
    position,
  };
}

/**
 * Build an `ACK_NO_CORRELATION_ID` warning. Emitted by `buildAck` (Phase C),
 * not by the parser: the inbound message carried no MSH-10 message control ID,
 * so the generated ACK leaves MSA-2 empty and, when a positive accept was
 * requested, downgrades it to an error code rather than fabricating an
 * unverifiable `AA`/`CA`. The `position` references the inbound MSH segment.
 * The message NEVER echoes a PHI value — only the structural fact.
 *
 * @example
 * ```ts
 * import { buildAck, WARNING_CODES } from "@cosyte/hl7";
 * const ack = buildAck(inbound, { code: "AA" }); // inbound has no MSH-10
 * ack.warnings.some((w) => w.code === WARNING_CODES.ACK_NO_CORRELATION_ID); // true
 * ```
 */
export function ackNoCorrelationId(position: Hl7Position): Hl7ParseWarning {
  return {
    code: WARNING_CODES.ACK_NO_CORRELATION_ID,
    message:
      "Inbound message has no MSH-10 control ID; ACK MSA-2 left empty and any " +
      "positive accept downgraded to an error code (no fabricated AA/CA).",
    position,
  };
}
