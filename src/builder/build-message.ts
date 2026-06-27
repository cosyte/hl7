/**
 * `buildMessage` — top-level outbound factory for the `@cosyte/hl7`
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

import { Hl7Message } from "../model/message.js";
import { DEFAULT_ENCODING_CHARACTERS } from "../parser/delimiters.js";
import type { RawField, RawSegment } from "../parser/types.js";

import { generateControlId } from "./control-id.js";
import { formatHl7Timestamp } from "./format-timestamp.js";

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
 * import { buildMessage } from "@cosyte/hl7";
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
   *
   * The string is split on `^` into MSH-9 components; each component is
   * emitted verbatim. Literal `^` characters in a component are NOT
   * representable via this field — splitting is unconditional. Callers
   * needing that edge case should build the message and then use
   * `.setField("MSH.9.1", ...)` etc. after construction.
   *
   * Rejected at runtime (D-16 / WR-04):
   * - empty string `""` or whitespace-only `"   "`;
   * - strings whose every `^`-split component is empty/whitespace
   *   (e.g. `"^"`, `"^^"`, `"   ^   "`).
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
 * Construct an outbound `Hl7Message` from semantic MSH fields (SER-06).
 * Synthesises a complete MSH `RawSegment` per D-10/D-11 and hands to
 * `new Hl7Message({...})`. Callers chain `.addSegment(name, fields)`
 * (Phase 3 mutation method, unchanged) to append PID, OBX, etc.
 *
 * Defaults applied when fields are omitted (D-10):
 * - `controlId` → `generateControlId()` (D-12)
 * - `timestamp` → `formatHl7Timestamp(new Date())` (D-13)
 * - `version` → `"2.5"`
 * - `processingId` → `"P"`
 * - `sendingApp`/`sendingFacility`/`receivingApp`/`receivingFacility` → empty
 *
 * Encoding characters are always `DEFAULT_ENCODING_CHARACTERS` (D-14); no
 * option to customise in v1.
 *
 * **Empty string vs. omitted field (W1):** at the HL7 wire level, passing
 * `sendingApp: ""` and omitting `sendingApp` produce IDENTICAL output
 * (both emit as absent — `||` at the MSH-3 position). If you need to
 * emit an HL7 explicit null (`""`, the two-char literal) at a specific
 * position, build the message first, then use `setField`:
 *
 * ```ts
 * const msg = buildMessage({ type: "ADT^A01" });
 * msg.setField("MSH.3", '""');  // sets RawField.isNull = true
 * // msg.toString() now emits MSH-3 as `""` (2 chars), not as absent.
 * ```
 *
 * The `BuildMessageInit` interface JSDoc (Plan 01) has the same note on
 * the input shape; this function-level doc reinforces it for developers
 * who land on the impl.
 *
 * @example
 * ```ts
 * import { buildMessage, parseHL7 } from "@cosyte/hl7";
 * const msg = buildMessage({
 *   type: "ADT^A01",
 *   sendingApp: "CLINIC",
 *   sendingFacility: "MAIN",
 *   receivingApp: "LAB",
 *   receivingFacility: "REF",
 * }).addSegment("PID", ["", "", "MRN123", "", "Doe^John"]);
 *
 * // Spec-clean HL7 string round-trips through parseHL7:
 * const round = parseHL7(msg.toString());
 * console.log(round.meta.type); // "ADT^A01"
 * ```
 */
export function buildMessage(init: BuildMessageInit): Hl7Message {
  // D-16 validation: type must be a non-empty, non-whitespace string.
  // `init` may be `null`/`undefined` at runtime if a JS caller bypasses the
  // type — guard defensively.
  if (
    init === null ||
    init === undefined ||
    typeof init.type !== "string" ||
    init.type.trim().length === 0
  ) {
    throw new TypeError(
      "buildMessage: `type` is required and must be a non-empty string " +
        '(e.g. "ADT^A01" or "ORU^R01^ORU_R01"). ' +
        `Received: ${JSON.stringify(init === null || init === undefined ? init : init.type)}.`,
    );
  }

  // WR-04: tighten D-16 — split on `^` and reject a string whose every
  // component is empty/whitespace (e.g. `"^"`, `"   ^   "`, `"^^"`). The
  // outer `.trim().length === 0` check above catches `""` and `"   "`, but
  // passes `"^"` (split → `["",""]` → MSH-9 emits as `^` which round-trips
  // but is malformed). Reject at the factory instead of letting garbage
  // through.
  const typeParts = init.type.split("^");
  if (typeParts.every((p) => p.trim().length === 0)) {
    throw new TypeError(
      "buildMessage: `type` must contain at least one non-empty component " +
        '(e.g. "ADT^A01", not "^" or "^^"). ' +
        `Received: ${JSON.stringify(init.type)}.`,
    );
  }

  const enc = DEFAULT_ENCODING_CHARACTERS; // D-14

  // Resolve timestamp per D-13.
  const tsString: string = resolveTimestamp(init.timestamp);

  // Resolve controlId per D-12.
  const controlId = init.controlId ?? generateControlId();

  // Resolve version + processingId defaults.
  const version = init.version ?? "2.5";
  const processingId = init.processingId ?? "P";

  // Build MSH fields[0..11] per the positional mapping documented in
  // `RawSegment.fields` JSDoc + CONTEXT.md D-11.
  //
  //   fields[0]  = field-separator placeholder  (content: "|")
  //   fields[1]  = MSH-2 encoding chars          (content: "^~\\&")
  //   fields[2]  = MSH-3 sendingApp
  //   fields[3]  = MSH-4 sendingFacility
  //   fields[4]  = MSH-5 receivingApp
  //   fields[5]  = MSH-6 receivingFacility
  //   fields[6]  = MSH-7 timestamp
  //   fields[7]  = MSH-8 (unused) empty
  //   fields[8]  = MSH-9 = message type (possibly composite).
  //   fields[9]  = MSH-10 controlId
  //   fields[10] = MSH-11 processingId
  //   fields[11] = MSH-12 version
  //
  // W1: `scalarField("")` produces an absent RawField (zero repetitions,
  // isNull:false) — identical to omitting the field. That's the correct
  // wire semantic; callers who want explicit null use `.setField("MSH.N",
  // '""')` after construction.
  const mshFields: RawField[] = [
    scalarField(enc.field), // fields[0]
    scalarField(
      enc.component + enc.repetition + enc.escape + enc.subcomponent + (enc.truncation ?? ""),
    ), // fields[1] MSH-2 (5th char only when truncation is set, v2.7+)
    scalarField(init.sendingApp ?? ""), // MSH-3
    scalarField(init.sendingFacility ?? ""), // MSH-4
    scalarField(init.receivingApp ?? ""), // MSH-5
    scalarField(init.receivingFacility ?? ""), // MSH-6
    scalarField(tsString), // MSH-7
    absentField(), // MSH-8
    compositeField(init.type), // MSH-9 (split on ^)
    scalarField(controlId), // MSH-10
    scalarField(processingId), // MSH-11
    scalarField(version), // MSH-12
  ];

  const mshSegment: RawSegment = {
    name: "MSH",
    fields: mshFields,
  };

  // D-11: construct the Hl7Message with the synthesised MSH as the sole
  // initial segment. Subsequent .addSegment() calls append PID/OBX/etc.
  return new Hl7Message({
    segments: [mshSegment],
    encodingCharacters: enc,
    version,
    warnings: [],
  });
}

/**
 * D-13: `Date` formats to HL7 `YYYYMMDDHHmmss` UTC; string passes through
 * verbatim; omitted defaults to `formatHl7Timestamp(new Date())`.
 * @internal
 */
function resolveTimestamp(ts: Date | string | undefined): string {
  if (ts === undefined) return formatHl7Timestamp(new Date());
  if (typeof ts === "string") return ts;
  return formatHl7Timestamp(ts);
}

/**
 * Build a RawField carrying a single plain-string value (one repetition,
 * one component, one subcomponent). Empty string → absent field (W1 wire
 * semantic: empty and omitted are indistinguishable on the wire).
 * @internal
 */
function scalarField(value: string): RawField {
  if (value === "") return { repetitions: [], isNull: false };
  return {
    repetitions: [
      {
        components: [{ subcomponents: [value] }],
      },
    ],
    isNull: false,
  };
}

/**
 * Build an absent RawField (no content, not null).
 * @internal
 */
function absentField(): RawField {
  return { repetitions: [], isNull: false };
}

/**
 * Build MSH-9 from a `^`-delimited type string per the Claude's Discretion
 * resolution (accept a single string, split on `^` for component
 * decomposition). Empty parts suppressed via D-02 trailing-empty strip at
 * emit time.
 * @internal
 */
function compositeField(typeString: string): RawField {
  const parts = typeString.split("^");
  const components = parts.map((p) => ({ subcomponents: [p] }));
  return {
    repetitions: [{ components }],
    isNull: false,
  };
}
