/**
 * Frozen HL7 control-vocabulary tables for ACK generation (Phase C). These
 * are read-only enums sourced from the HL7 v2 standard — `@cosyte/hl7` is the
 * single owner of this vocabulary; siblings (notably `@cosyte/mllp`) consume
 * `buildAck` rather than re-declaring these codes.
 *
 * Provenance (re-verify before editing — HL7 tables move):
 * - **Table 0008** Acknowledgment code — https://terminology.hl7.org/CodeSystem-v2-0008.html
 * - **Table 0357** Message error condition codes — https://terminology.hl7.org/CodeSystem-v2-0357.html
 * - **Table 0516** Error severity — HL7 v2 Chapter 2 §2.14.5 (ERR-4)
 * - **Table 0155** Accept/application acknowledgment conditions (MSH-15/16) —
 *   HL7 v2 Chapter 2 §2.14.9.15–16
 *
 * Zero runtime deps.
 */

/**
 * HL7 Table 0008 — Acknowledgment code (MSA-1). The two acknowledgment
 * **vocabularies**:
 * - **original** mode: `AA` Application Accept · `AE` Application Error ·
 *   `AR` Application Reject.
 * - **enhanced** mode accept-level: `CA` Commit Accept · `CE` Commit Error ·
 *   `CR` Commit Reject (the application-level response in enhanced mode reuses
 *   `AA`/`AE`/`AR`).
 *
 * @example
 * ```ts
 * import { ACK_CODES } from "@cosyte/hl7";
 * ACK_CODES.AA; // "AA"
 * ```
 */
export const ACK_CODES = {
  AA: "AA",
  AE: "AE",
  AR: "AR",
  CA: "CA",
  CE: "CE",
  CR: "CR",
} as const;

/**
 * Acknowledgment code union (HL7 Table 0008). Narrow on this to know whether a
 * disposition is accept (`AA`/`CA`), error (`AE`/`CE`), or reject (`AR`/`CR`).
 */
export type AckCode = (typeof ACK_CODES)[keyof typeof ACK_CODES];

/** The positive-accept codes — the ones the fail-safe refuses to fabricate. */
const POSITIVE_ACK_CODES: ReadonlySet<string> = new Set([ACK_CODES.AA, ACK_CODES.CA]);
/** The error codes (message received, processing problem). */
const ERROR_ACK_CODES: ReadonlySet<string> = new Set([ACK_CODES.AE, ACK_CODES.CE]);
/** The reject codes (message refused). */
const REJECT_ACK_CODES: ReadonlySet<string> = new Set([ACK_CODES.AR, ACK_CODES.CR]);

/**
 * True iff `code` is a positive accept (`AA`/`CA`). Unknown/absent → false.
 *
 * @example
 * ```ts
 * isPositiveAck("AA"); // true
 * isPositiveAck("AE"); // false
 * ```
 */
export function isPositiveAck(code: string | undefined): boolean {
  return code !== undefined && POSITIVE_ACK_CODES.has(code);
}

/**
 * True iff `code` is an error acknowledgment (`AE`/`CE`). Unknown/absent → false.
 *
 * @example
 * ```ts
 * isErrorAck("CE"); // true
 * ```
 */
export function isErrorAck(code: string | undefined): boolean {
  return code !== undefined && ERROR_ACK_CODES.has(code);
}

/**
 * True iff `code` is a reject acknowledgment (`AR`/`CR`). Unknown/absent → false.
 *
 * @example
 * ```ts
 * isRejectAck("AR"); // true
 * ```
 */
export function isRejectAck(code: string | undefined): boolean {
  return code !== undefined && REJECT_ACK_CODES.has(code);
}

/**
 * True iff `code` is one of the six known Table 0008 codes.
 *
 * @example
 * ```ts
 * isKnownAckCode("AA"); // true
 * isKnownAckCode("ZZ"); // false
 * ```
 */
export function isKnownAckCode(code: string): code is AckCode {
  return code in ACK_CODES;
}

/**
 * HL7 Table 0516 — Error severity (ERR-4). A v2.5+ construct (ERR was
 * structured differently in v2.3.1).
 *
 * @example
 * ```ts
 * import { ERR_SEVERITIES } from "@cosyte/hl7";
 * ERR_SEVERITIES.E; // "E" (Error)
 * ```
 */
export const ERR_SEVERITIES = {
  /** Information. */
  I: "I",
  /** Warning. */
  W: "W",
  /** Error. */
  E: "E",
} as const;

/** Error-severity union (HL7 Table 0516, ERR-4). */
export type ErrSeverity = (typeof ERR_SEVERITIES)[keyof typeof ERR_SEVERITIES];

/**
 * HL7 Table 0357 — Message error condition codes (ERR-3.1 → ERR-3.2 text).
 * Frozen read-only map of `code → standard display text`. The code system
 * name emitted in ERR-3.3 is {@link ERR_CONDITION_CODE_SYSTEM}.
 *
 * Codes `104` (value too long) and `105` (table value not found) are v2.7+
 * additions; the rest are present from v2.5. `buildAck` emits whatever code it
 * is told — it never invents a condition — and looks up the display text here.
 *
 * @example
 * ```ts
 * import { ERR_CONDITION_CODES } from "@cosyte/hl7";
 * ERR_CONDITION_CODES["101"]; // "Required field missing"
 * ```
 */
export const ERR_CONDITION_CODES: Readonly<Record<string, string>> = Object.freeze({
  "0": "Message accepted",
  "100": "Segment sequence error",
  "101": "Required field missing",
  "102": "Data type error",
  "103": "Table value not found",
  "104": "Value too long",
  "105": "Table value not found",
  "200": "Unsupported message type",
  "201": "Unsupported event code",
  "202": "Unsupported processing id",
  "203": "Unsupported version id",
  "204": "Unknown key identifier",
  "205": "Duplicate key identifier",
  "206": "Application record locked",
  "207": "Application internal error",
});

/** Code-system name emitted in ERR-3.3 for Table 0357 condition codes. */
export const ERR_CONDITION_CODE_SYSTEM = "HL70357";

/**
 * HL7 Table 0155 — Accept/application acknowledgment conditions (MSH-15 /
 * MSH-16): `AL` Always · `NE` Never · `ER` Error/reject conditions only ·
 * `SU` Successful completion only. Exposed read-only for adapters that
 * surface the inbound sender's stated acknowledgment expectations.
 *
 * @example
 * ```ts
 * import { ACK_CONDITIONS } from "@cosyte/hl7";
 * ACK_CONDITIONS.AL; // "AL" (Always)
 * ```
 */
export const ACK_CONDITIONS = {
  AL: "AL",
  NE: "NE",
  ER: "ER",
  SU: "SU",
} as const;

/** Accept/application acknowledgment condition union (HL7 Table 0155). */
export type AckCondition = (typeof ACK_CONDITIONS)[keyof typeof ACK_CONDITIONS];

/**
 * The two HL7 acknowledgment modes. **original** = both MSH-15 and MSH-16 are
 * absent/null; **enhanced** = either is present (HL7 v2 Chapter 2 §2.9).
 */
export type AckMode = "original" | "enhanced";
