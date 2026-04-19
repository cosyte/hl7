/**
 * `buildMessage` — top-level outbound factory for the `@cosyte/hl7-parser`
 * package. Synthesizes a complete MSH `RawSegment` from `BuildMessageInit`
 * and returns a real `Hl7Message` (not a builder subtype). Callers chain
 * `.addSegment(...)` (Phase 3 mutation method, unchanged) to append PID,
 * OBX, etc. Symmetric with `parseHL7` (D-09).
 *
 * The `BuildMessageInit` interface is exported in Plan 01 (this file) so
 * consumers + `src/index.ts` can reference the type immediately. The
 * `buildMessage` function body is filled in Phase 5 Plan 05 (build-message).
 *
 * Decisions:
 * - D-09: top-level named export from `src/index.ts`.
 * - D-10: `BuildMessageInit` shape below.
 * - D-11: internally synthesises a complete MSH `RawSegment` and hands to
 *   `new Hl7Message({...})`.
 * - D-12: controlId auto-gen — YYYYMMDDHHmmssSSS + 6 alnum = 23 chars.
 * - D-13: `timestamp` accepts `Date | string`; `Date` formats to
 *   `YYYYMMDDHHmmss` UTC.
 * - D-14: encoding chars always `DEFAULT_ENCODING_CHARACTERS`.
 * - D-15: subsequent `.addSegment(name, fields)` uses Phase 3 unchanged
 *   (`readonly string[]` field input).
 * - D-16: missing/empty `type` throws `TypeError`.
 *
 * **Absent vs. explicit null at the wire level:** at the HL7 wire level,
 * an empty-string field and an omitted field produce IDENTICAL output
 * (both emit as absent — `||` in the line). If you need to distinguish
 * "explicitly null" (HL7 `""`) from "absent" in an outbound message, use
 * `buildMessage({...}).setField(path, '""')` after construction — the
 * Phase 3 `setField` mutation method sets `RawField.isNull = true`, which
 * the emitter preserves as the literal two-char string `""` per D-02.
 */

import type { Hl7Message } from "../model/message.js";

/**
 * Input shape for `buildMessage` (SER-06). Mirrors `msg.meta` 1-for-1 so
 * read and write surfaces share field names (`sendingApp`, `sendingFacility`,
 * `receivingApp`, `receivingFacility`, `controlId`, `timestamp`, `version`,
 * `processingId`). `type` is the only required field.
 *
 * **Empty string vs. undefined semantics:** omitting a field and passing an
 * empty string produce IDENTICAL wire output (both emit as an absent
 * positional field). To emit an HL7 explicit null (`""`) at a specific
 * position in an outbound message, build the message first and then call
 * `.setField(path, '""')` — the Phase 3 mutation method sets `isNull=true`
 * on the underlying `RawField`, and the emitter preserves that as the
 * literal two-char output per D-02.
 *
 * @example
 * ```ts
 * import { buildMessage } from "@cosyte/hl7-parser";
 * const msg = buildMessage({
 *   type: "ADT^A01",
 *   sendingApp: "CLINIC",
 *   sendingFacility: "MAIN",
 *   receivingApp: "LAB",
 *   receivingFacility: "REF",
 *   timestamp: new Date("2026-04-19T10:15:00Z"),
 * })
 *   .addSegment("PID", ["", "", "MRN123", "", "Doe^John"]);
 * console.log(msg.toString());
 *
 * // To emit HL7 explicit null ("") instead of absent:
 * //   msg.setField("PID.2", '""');   // distinct from empty/omitted
 * ```
 */
export interface BuildMessageInit {
  /**
   * HL7 message type, e.g. `"ADT^A01"` (code + trigger) or
   * `"ORU^R01^ORU_R01"` (code + trigger + structure). Required (D-16).
   */
  readonly type: string;
  readonly sendingApp?: string;
  readonly sendingFacility?: string;
  readonly receivingApp?: string;
  readonly receivingFacility?: string;
  /** Auto-generated via `generateControlId()` when omitted (D-12). */
  readonly controlId?: string;
  /**
   * `Date` formatted to HL7 `YYYYMMDDHHmmss` (UTC, seconds) when supplied;
   * pre-formatted HL7 TS string passed through verbatim (D-13). Defaults to
   * `new Date()`.
   */
  readonly timestamp?: Date | string;
  /** Defaults to `"2.5"`. */
  readonly version?: string;
  /** Defaults to `"P"` (production). */
  readonly processingId?: string;
}

/**
 * Construct an outbound `Hl7Message` from semantic MSH fields.
 * Implementation lives in Phase 5 Plan 05 (build-message). Stub throws.
 *
 * @example
 * ```ts
 * import { buildMessage } from "@cosyte/hl7-parser";
 * const msg = buildMessage({ type: "ADT^A01" });
 * console.log(msg.toString());
 * ```
 */
export function buildMessage(_init: BuildMessageInit): Hl7Message {
  throw new Error(
    "buildMessage: NOT IMPLEMENTED — Phase 5 Plan 05 (build-message) will fill this. " +
      "If you see this error, builder plans are running out of order.",
  );
}
