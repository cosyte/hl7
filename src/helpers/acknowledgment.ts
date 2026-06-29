/**
 * `interpretAck` — read-side helper that interprets an inbound HL7 v2
 * acknowledgment (ACK) message into a typed {@link Acknowledgment} view
 * (Phase C). The mechanical inverse of `buildAck`: it reads MSA-1 (code),
 * MSA-2 (the correlated control id), and every ERR segment.
 *
 * Fail-safe: an absent or unrecognized MSA-1 yields `accepted: false` — the
 * interpreter NEVER reports an acknowledgment as accepted on ambiguous input.
 *
 * Spec traceability: HL7 v2 Chapter 2 §2.14.8 (MSA), §2.14.5 (ERR). Codes are
 * surfaced verbatim (Table 0008 / 0357 / 0516) — no validation or lookup.
 *
 * Zero runtime deps.
 */

import { isErrorAck, isPositiveAck, isRejectAck } from "../builder/ack-tables.js";
import type { Hl7Message } from "../model/message.js";
import type { Segment } from "../model/segment.js";

/**
 * One ERR segment interpreted from an ACK. All fields are surfaced verbatim
 * (no table lookup) and OMITTED when the underlying component is absent
 * (exactOptionalPropertyTypes). Codes/locations only — never PHI.
 */
export interface AckErrorEntry {
  /** ERR-3.1 — HL7 Table 0357 condition code. */
  readonly conditionCode?: string;
  /** ERR-3.2 — condition code display text. */
  readonly conditionText?: string;
  /** ERR-3.3 — condition code system name (e.g. `HL70357`). */
  readonly conditionCodeSystem?: string;
  /** ERR-4 — HL7 Table 0516 severity (`I`/`W`/`E`). */
  readonly severity?: string;
  /** ERR-2 — error location (an HL7 ERL), surfaced verbatim. */
  readonly location?: string;
}

/**
 * Typed view of an inbound ACK. `accepted` / `error` / `rejected` are derived
 * from MSA-1 against HL7 Table 0008 and are **mutually exclusive**; all three
 * are `false` when MSA-1 is absent or not a recognized code (fail-safe).
 *
 * @example
 * ```ts
 * import { interpretAck, parseHL7 } from "@cosyte/hl7";
 * const ack = interpretAck(parseHL7(rawAck));
 * if (ack.accepted) {
 *   // safe to consider the message acknowledged
 * } else if (ack.rejected) {
 *   for (const e of ack.errors) console.error(e.conditionCode, e.severity);
 * }
 * ```
 */
export interface Acknowledgment {
  /** MSA-1 acknowledgment code (HL7 Table 0008), verbatim. Omitted when absent. */
  readonly code?: string;
  /** MSA-2 message control id (the correlated inbound MSH-10). Omitted when absent. */
  readonly controlId?: string;
  /** True iff MSA-1 is a positive accept (`AA`/`CA`). */
  readonly accepted: boolean;
  /** True iff MSA-1 is an error acknowledgment (`AE`/`CE`). */
  readonly error: boolean;
  /** True iff MSA-1 is a reject acknowledgment (`AR`/`CR`). */
  readonly rejected: boolean;
  /** Every ERR segment in document order ( `[]` when none ). */
  readonly errors: readonly AckErrorEntry[];
}

/**
 * Interpret an `Hl7Message` as an acknowledgment. Never throws; a message with
 * no MSA segment yields an all-`false`, empty-`errors` view. The result is
 * deeply frozen.
 *
 * @example
 * ```ts
 * import { interpretAck, parseHL7 } from "@cosyte/hl7";
 * const view = interpretAck(parseHL7("MSH|^~\\&|...\rMSA|AA|MSG001"));
 * view.accepted;  // true
 * view.controlId; // "MSG001"
 * ```
 */
export function interpretAck(msg: Hl7Message): Acknowledgment {
  const msa = msg.segments("MSA")[0];
  let code: string | undefined;
  let controlId: string | undefined;
  if (msa !== undefined) {
    const codeValue = msa.field(1).value;
    if (codeValue !== "") code = codeValue;
    const controlIdValue = msa.field(2).value;
    if (controlIdValue !== "") controlId = controlIdValue;
  }

  const errors: AckErrorEntry[] = [];
  for (const err of msg.segments("ERR")) {
    errors.push(interpretErr(err));
  }

  const out: Acknowledgment = {
    ...(code !== undefined ? { code } : {}),
    ...(controlId !== undefined ? { controlId } : {}),
    accepted: isPositiveAck(code),
    error: isErrorAck(code),
    rejected: isRejectAck(code),
    errors: Object.freeze(errors),
  };
  return Object.freeze(out);
}

/** Interpret one ERR segment into an {@link AckErrorEntry}. @internal */
function interpretErr(err: Segment): AckErrorEntry {
  type Mutable<T> = { -readonly [K in keyof T]?: T[K] };
  const out: Mutable<AckErrorEntry> = {};

  // ERR-2 is an ERL (Error Location) composite — `segment ^ sequence ^ field
  // position ^ …`. Surface it verbatim by re-joining its components with the
  // component separator (`.value` would yield only the first component). ERL
  // components are delimiter-free structural tokens, so no unescaping is owed.
  const location = readErl(err);
  if (location !== undefined) out.location = location;

  const condition = err.field(3).asCwe();
  if (condition.identifier !== undefined) out.conditionCode = condition.identifier;
  if (condition.text !== undefined) out.conditionText = condition.text;
  if (condition.nameOfCodingSystem !== undefined) {
    out.conditionCodeSystem = condition.nameOfCodingSystem;
  }

  const severity = err.field(4).value;
  if (severity !== "") out.severity = severity;

  return Object.freeze(out);
}

/**
 * Re-join an ERR-2 ERL composite (`PID^1^5`) from its components. Returns
 * `undefined` when the field is absent or carries no content. @internal
 */
function readErl(err: Segment): string | undefined {
  const rep = err.field(2).repetitions[0];
  if (rep === undefined) return undefined;
  const joined = rep.components.map((c) => c.subcomponents[0] ?? "").join("^");
  return joined === "" ? undefined : joined;
}
