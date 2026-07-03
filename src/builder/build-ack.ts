/**
 * `buildAck` — generate a spec-clean HL7 v2 acknowledgment (ACK) message from
 * an inbound message (Phase C). The boundary with `@cosyte/mllp` is resolved
 * (hl7 roadmap §10.1): **hl7 owns ACK *content*** (this file + the control
 * tables); mllp owns *policy/timing* (the commit contract) and *framing*.
 *
 * `buildAck` is **mechanical** — it builds the disposition it is *told* via
 * `options.code`; it never decides accept-vs-reject. The one safety override is
 * the fail-safe below: it refuses to fabricate a positive `AA`/`CA` for an
 * inbound message that carries no MSH-10 correlation id.
 *
 * Spec traceability: HL7 v2 Chapter 2 §2.9 (ack model), §2.14.8 (MSA),
 * §2.14.5 (ERR), §2.14.9.15–16 (MSH-15/16). Tables 0008 / 0357 / 0516 / 0155
 * live in `ack-tables.ts`.
 *
 * Zero runtime deps.
 */

import { Hl7Message } from "../model/message.js";
import { DEFAULT_ENCODING_CHARACTERS } from "../parser/delimiters.js";
import type { RawField, RawSegment } from "../parser/types.js";
import { ackNoCorrelationId } from "../parser/warnings.js";

import {
  downgradePositiveAck,
  ERR_CONDITION_CODES,
  ERR_CONDITION_CODE_SYSTEM,
  ERR_SEVERITIES,
  isKnownAckCode,
  isPositiveAck,
  type AckCode,
  type AckMode,
  type ErrSeverity,
} from "./ack-tables.js";
import { generateControlId } from "./control-id.js";
import { formatHl7Timestamp } from "./format-timestamp.js";

/**
 * One ERR segment's worth of error detail for `buildAck`. Carries **codes and
 * locations only — never echoed PHI values** (the phi-redaction-review gate
 * binds this contract).
 *
 * @example
 * ```ts
 * import { buildAck } from "@cosyte/hl7";
 * const ack = buildAck(inbound, {
 *   code: "AE",
 *   error: { conditionCode: "101", severity: "E", location: "PID^1^5" },
 * });
 * ```
 */
export interface AckErrorDetail {
  /**
   * HL7 Table 0357 message error condition code (ERR-3.1). Defaults to `"207"`
   * (Application internal error). The standard display text is looked up from
   * Table 0357 and emitted in ERR-3.2; unknown codes emit with empty text
   * (the code is preserved verbatim — never dropped).
   */
  readonly conditionCode?: string;
  /** HL7 Table 0516 severity (ERR-4). Defaults to `"E"` (Error). */
  readonly severity?: ErrSeverity;
  /**
   * Error location (ERR-2, an HL7 ERL). A structural path such as `"PID^1^5"`
   * (segment id ^ segment sequence ^ field position). **Must not contain a
   * patient data value** — locations point at *where*, never *what*.
   */
  readonly location?: string;
}

/**
 * Options for {@link buildAck}.
 *
 * @example
 * ```ts
 * buildAck(inbound, { code: "AA" });                       // bare accept
 * buildAck(inbound, { code: "AR", error: { conditionCode: "200" } });
 * ```
 */
export interface BuildAckOptions {
  /**
   * The acknowledgment disposition to emit in MSA-1 (HL7 Table 0008). One of
   * `AA`/`AE`/`AR` (original) or `CA`/`CE`/`CR` (enhanced accept-level).
   * Required — `buildAck` builds the disposition it is told. An unknown code
   * is a programming error and throws `TypeError`.
   */
  readonly code: AckCode;
  /**
   * Optional error detail. A single {@link AckErrorDetail} or an array → one
   * ERR segment each. Typically supplied for `AE`/`AR`/`CE`/`CR`.
   */
  readonly error?: AckErrorDetail | readonly AckErrorDetail[];
  /**
   * Optional explicit acknowledgment mode. When omitted it is derived from the
   * inbound MSH-15/16 via {@link detectAckMode}. `buildAck` emits `code`
   * verbatim regardless of mode — this field is advisory metadata for adapters
   * (e.g. `@cosyte/mllp`'s commit-policy layer) that need the detected mode.
   */
  readonly mode?: AckMode;
}

/**
 * Detect the HL7 acknowledgment mode of an inbound message from MSH-15 (accept
 * acknowledgment type) and MSH-16 (application acknowledgment type), per HL7 v2
 * Chapter 2 §2.9: **original** when *both* are absent/empty; **enhanced** when
 * *either* is present. This split is spec-exact (unlike the disposition mapping,
 * which has no single correct model — see the package README).
 *
 * @example
 * ```ts
 * import { detectAckMode, parseHL7 } from "@cosyte/hl7";
 * detectAckMode(parseHL7(raw)); // "original" | "enhanced"
 * ```
 */
export function detectAckMode(inbound: Hl7Message): AckMode {
  const acceptType = inbound.get("MSH.15");
  const appType = inbound.get("MSH.16");
  const hasAccept = acceptType !== undefined && acceptType !== "";
  const hasApp = appType !== undefined && appType !== "";
  return hasAccept || hasApp ? "enhanced" : "original";
}

/**
 * Build a spec-clean ACK (`MSH` + `MSA` [+ `ERR`…]) responding to `inbound`.
 *
 * Behavior:
 * - **MSH** — sender/receiver are swapped (inbound MSH-5/6 → ACK MSH-3/4;
 *   inbound MSH-3/4 → ACK MSH-5/6); MSH-7 is the current UTC time; MSH-9 is
 *   `ACK` (with the inbound trigger event echoed as `ACK^<trigger>^ACK` when
 *   present); MSH-10 is a freshly generated control id; MSH-11 (processing id)
 *   and MSH-12 (version) echo the inbound values.
 * - **MSA** — MSA-1 = `code`; **MSA-2 echoes the full inbound MSH-10 field**
 *   (the raw field structure is carried over whole — a vendor-quirk id like
 *   `ID^X` is never truncated to its first component). The echo is the
 *   field's *canonical re-serialization*, not its original bytes: the ACK
 *   emits with the default encoding characters (a custom-delimiter sender is
 *   re-delimited spec-cleanly), hex escapes decode (`\X41\` → `A`),
 *   preserved formatting/vendor escapes re-emit as escaped literal text, and
 *   trailing insignificant empties canonicalize (D-02). Plain and
 *   delimiter-bearing ids — the overwhelmingly common case — echo byte-exact.
 * - **ERR** — one segment per supplied {@link AckErrorDetail}: ERR-2 location
 *   (when given), ERR-3 the Table 0357 condition code as a CWE
 *   (`code^text^HL70357`), ERR-4 the Table 0516 severity.
 *
 * **Fail-safe (roadmap §Phase C).** If the inbound message has no MSH-10, the
 * ACK cannot be correlated. `buildAck` then leaves MSA-2 empty and, if a
 * positive accept (`AA`/`CA`) was requested, **downgrades it** to the matching
 * error code (`AE`/`CE`) — it never fabricates an unverifiable positive ACK.
 * The returned message carries an `ACK_NO_CORRELATION_ID` warning. (This is the
 * inbound-side complement to `@cosyte/mllp`'s "no commit ⇒ never AA".)
 *
 * Pure aside from the generated control id + timestamp; never throws except on
 * a programming error (`inbound` not an `Hl7Message`, or an unknown `code`).
 *
 * @example
 * ```ts
 * import { buildAck, parseHL7 } from "@cosyte/hl7";
 * const inbound = parseHL7(raw);
 * const ack = buildAck(inbound, { code: "AA" });
 * console.log(ack.toString());            // MSH|...\rMSA|AA|<inbound MSH-10>
 * parseHL7(ack.toString()).meta.type;     // "ACK" (round-trips clean)
 * ```
 */
export function buildAck(inbound: Hl7Message, options: BuildAckOptions): Hl7Message {
  if (!(inbound instanceof Hl7Message)) {
    throw new TypeError("buildAck: `inbound` must be an Hl7Message (from parseHL7).");
  }
  if (typeof options.code !== "string" || !isKnownAckCode(options.code)) {
    throw new TypeError(
      `buildAck: \`code\` must be a known HL7 Table 0008 acknowledgment code ` +
        `(AA/AE/AR/CA/CE/CR). Received: ${JSON.stringify(options.code)}.`,
    );
  }

  const enc = DEFAULT_ENCODING_CHARACTERS;
  const meta = inbound.meta;

  // Swap the addressing HDs by ALIASING the inbound RAW field objects (not
  // the component-1-only `meta` scalars), so multi-component HDs like
  // `APP^DNS^ISO` survive into the reply intact rather than being truncated.
  // Sharing by reference is safe because every Hl7Message mutation method
  // (setField et al.) is copy-on-write leaf-to-root — neither message can
  // corrupt the other through the shared subtree.
  const msh = inbound.segments("MSH")[0];
  const inboundMsh = (n: number): RawField => msh?.field(n).raw ?? absentField();

  // Correlation: MSA-2 echoes the inbound RAW MSH-10 field **verbatim** —
  // not the component-1-only `meta.controlId` scalar. A vendor-quirk control
  // id carrying an unescaped delimiter (`ID^X`) must survive into MSA-2
  // byte-for-byte, or a sender correlating on the raw MSH-10 bytes will
  // never match the ACK (HL7 v2 §2.9.2.2: a mismatch is a correlation
  // failure). Absent/empty → fail-safe path.
  const rawControlId = inboundMsh(10);
  const hasCorrelation = rawFieldHasContent(rawControlId);

  // Resolve the emitted disposition, applying the no-correlation fail-safe.
  const emittedCode: string = hasCorrelation
    ? options.code
    : isPositiveAck(options.code)
      ? downgradePositiveAck(options.code)
      : options.code;

  // ── MSH ────────────────────────────────────────────────────────────────
  const ackType = meta.triggerEvent !== undefined ? `ACK^${meta.triggerEvent}^ACK` : "ACK";
  const version = meta.version ?? "2.5";
  const processingId = meta.processingId ?? "P";

  const mshFields: RawField[] = [
    scalarField(enc.field),
    scalarField(
      enc.component + enc.repetition + enc.escape + enc.subcomponent + (enc.truncation ?? ""),
    ),
    inboundMsh(5), // MSH-3 sendingApp = inbound MSH-5 (receivingApp)
    inboundMsh(6), // MSH-4 sendingFacility = inbound MSH-6 (receivingFacility)
    inboundMsh(3), // MSH-5 receivingApp = inbound MSH-3 (sendingApp)
    inboundMsh(4), // MSH-6 receivingFacility = inbound MSH-4 (sendingFacility)
    scalarField(formatHl7Timestamp(new Date())), // MSH-7
    absentField(), // MSH-8
    compositeField(ackType), // MSH-9
    scalarField(generateControlId()), // MSH-10
    scalarField(processingId), // MSH-11
    scalarField(version), // MSH-12
  ];

  const segments: RawSegment[] = [{ name: "MSH", fields: mshFields }];

  // ── MSA ────────────────────────────────────────────────────────────────
  // MSA-1 = disposition, MSA-2 = the raw inbound MSH-10 field copied
  // verbatim (empty under the fail-safe).
  segments.push({
    name: "MSA",
    fields: [
      absentField(),
      scalarField(emittedCode),
      hasCorrelation ? rawControlId : absentField(),
    ],
  });

  // ── ERR (one per supplied detail) ────────────────────────────────────────
  for (const detail of normalizeErrors(options.error)) {
    segments.push(buildErrSegment(detail));
  }

  const warnings = hasCorrelation ? [] : [ackNoCorrelationId({ segmentIndex: 0 })];

  return new Hl7Message({
    segments,
    encodingCharacters: enc,
    version,
    warnings,
  });
}

/** Normalize the `error` option to a (possibly empty) array. @internal */
function normalizeErrors(
  error: AckErrorDetail | readonly AckErrorDetail[] | undefined,
): readonly AckErrorDetail[] {
  if (error === undefined) return [];
  return isErrorArray(error) ? error : [error];
}

/**
 * Type guard narrowing the `error` union to the array branch. A user-defined
 * guard is needed because `Array.isArray` does not subtract `readonly T[]`
 * from a union on its own.
 * @internal
 */
function isErrorArray(
  error: AckErrorDetail | readonly AckErrorDetail[],
): error is readonly AckErrorDetail[] {
  return Array.isArray(error);
}

/**
 * Build one ERR `RawSegment` from an {@link AckErrorDetail}. ERR-3 is the
 * Table 0357 condition code as a CWE (`code^text^HL70357`); ERR-4 is the
 * Table 0516 severity. ERR-1 is left absent (deprecated v2.4 / withdrawn v2.7);
 * ERR-2 carries the optional location.
 * @internal
 */
function buildErrSegment(detail: AckErrorDetail): RawSegment {
  const conditionCode = detail.conditionCode ?? "207";
  const severity: string = detail.severity ?? ERR_SEVERITIES.E;
  const text = ERR_CONDITION_CODES[conditionCode] ?? "";

  // ERR-3 CWE: identifier ^ text ^ name-of-coding-system.
  const err3: RawField = {
    repetitions: [
      {
        components: [
          { subcomponents: [conditionCode] },
          { subcomponents: [text] },
          { subcomponents: [ERR_CONDITION_CODE_SYSTEM] },
        ],
      },
    ],
    isNull: false,
  };

  return {
    name: "ERR",
    fields: [
      absentField(), // fields[0] — segment-name/separator placeholder slot
      absentField(), // ERR-1 (deprecated v2.4 / withdrawn v2.7)
      detail.location !== undefined ? compositeField(detail.location) : absentField(), // ERR-2 (ERL)
      err3, // ERR-3
      scalarField(severity), // ERR-4
    ],
  };
}

/**
 * Single plain-string field (empty → absent, matching wire semantics).
 * @internal
 */
function scalarField(value: string): RawField {
  if (value === "") return { repetitions: [], isNull: false };
  return { repetitions: [{ components: [{ subcomponents: [value] }] }], isNull: false };
}

/** Absent field (no content, not null). @internal */
function absentField(): RawField {
  return { repetitions: [], isNull: false };
}

/**
 * True iff the raw field carries any content at all — at least one non-empty
 * subcomponent in any component of any repetition. Drives the correlation
 * check on the raw MSH-10: a quirky `^X` still correlates (the verbatim echo
 * preserves it), while a genuinely empty/absent field triggers the fail-safe.
 * @internal
 */
function rawFieldHasContent(field: RawField): boolean {
  return field.repetitions.some((rep) =>
    rep.components.some((comp) => comp.subcomponents.some((sub) => sub !== "")),
  );
}

/**
 * MSH-9 composite from a `^`-delimited type string (`ACK^A01^ACK`).
 * @internal
 */
function compositeField(typeString: string): RawField {
  const components = typeString.split("^").map((p) => ({ subcomponents: [p] }));
  return { repetitions: [{ components }], isNull: false };
}
