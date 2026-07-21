/**
 * `buildAdt` — author a spec-clean HL7 v2 **ADT** (admit/discharge/transfer)
 * message from typed inputs (roadmap Phase T). The conservative-emit mirror of
 * the read helpers (`msg.patient`, `msg.visit`): a caller supplies structured
 * values (an {@link XPN} name, {@link CX} identifiers, a {@link TS} birth date,
 * a {@link PL} location, …) and `buildAdt` assembles `MSH + EVN + PID + PV1`
 * with correct `^`/`&`/`~` structure via the HL7-R encode-safe path — never
 * hand-assembling delimiters, never injecting one.
 *
 * **Structurally complete + zero-warning.** The emitted message carries the
 * segment groups the parser's own structure net marks Required for the ADT
 * events it recognises (patient = PID, visit = PV1), so it re-parses with
 * **zero warnings** and `msg.structure.missingGroups` empty.
 *
 * **Never fabricate.** Only values the caller supplies are emitted; an omitted
 * optional field becomes an empty/absent field, never a defaulted clinical
 * value. `patient` is **required** — an ADT patient event with no patient is a
 * typed `TypeError`, not a guessed PID.
 *
 * Spec traceability: HL7 v2 Ch. 3 (ADT — MSH/EVN/PID/PV1), Ch. 2 datatypes.
 * Zero runtime deps.
 */

import { Hl7Message } from "../model/message.js";
import { DEFAULT_ENCODING_CHARACTERS } from "../parser/delimiters.js";
import type { RawField, RawSegment } from "../parser/types.js";
import type { CX } from "../model/types/cx.js";
import type { PL } from "../model/types/pl.js";
import type { TS } from "../model/types/ts.js";
import type { XAD } from "../model/types/xad.js";
import type { XCN } from "../model/types/xcn.js";
import type { XPN } from "../model/types/xpn.js";
import type { XTN } from "../model/types/xtn.js";

import {
  encodeComposite,
  encodeCompositeReps,
  type CompositeKind,
  type CompositeValueByKind,
} from "./encode-composite.js";
import {
  assembleSegment,
  buildMshSegment,
  scalarField,
  type MessageEnvelope,
} from "./segment-fields.js";

/** Typed PID (patient identification) content for {@link buildAdt}. */
export interface AdtPatient {
  /** PID-1 Set ID. */
  readonly setId?: string;
  /** PID-3 Patient Identifier List — one or more CX identifiers (MRN, SSN, …). */
  readonly identifiers?: CX | readonly CX[];
  /** PID-5 Patient Name. */
  readonly name?: XPN | readonly XPN[];
  /** PID-6 Mother's Maiden Name. */
  readonly mothersMaidenName?: XPN;
  /** PID-7 Date/Time of Birth. */
  readonly birthDateTime?: TS | string;
  /** PID-8 Administrative Sex (e.g. `"F"`, `"M"`, `"U"`). */
  readonly administrativeSex?: string;
  /** PID-11 Patient Address — one or more XAD addresses. */
  readonly address?: XAD | readonly XAD[];
  /** PID-13 Phone Number - Home — one or more XTN telecoms. */
  readonly phoneHome?: XTN | readonly XTN[];
  /** PID-18 Patient Account Number. */
  readonly accountNumber?: CX;
}

/** Typed PV1 (patient visit) content for {@link buildAdt}. */
export interface AdtVisit {
  /** PV1-1 Set ID. */
  readonly setId?: string;
  /** PV1-2 Patient Class (e.g. `"I"` inpatient, `"O"` outpatient, `"E"` emergency). */
  readonly patientClass?: string;
  /** PV1-3 Assigned Patient Location. */
  readonly assignedLocation?: PL;
  /** PV1-7 Attending Doctor. */
  readonly attendingDoctor?: XCN | readonly XCN[];
  /** PV1-8 Referring Doctor. */
  readonly referringDoctor?: XCN | readonly XCN[];
  /** PV1-19 Visit Number. */
  readonly visitNumber?: CX;
  /** PV1-44 Admit Date/Time. */
  readonly admitDateTime?: TS | string;
}

/** Typed EVN (event type) content for {@link buildAdt}. */
export interface AdtEvent {
  /** EVN-2 Recorded Date/Time. */
  readonly recordedDateTime?: TS | string;
  /** EVN-6 Event Occurred. */
  readonly eventOccurred?: TS | string;
}

/** Input for {@link buildAdt}: the MSH envelope plus the typed segment bodies. */
export interface BuildAdtInit extends MessageEnvelope {
  /** PID content. **Required** — never fabricated. */
  readonly patient: AdtPatient;
  /** PV1 content. Optional; an (empty) PV1 is emitted regardless so the visit group is present. */
  readonly visit?: AdtVisit;
  /** EVN content (EVN-1 is the trigger event; EVN-2/6 optional). */
  readonly event?: AdtEvent;
}

/**
 * Encode a single composite or an array of them into a (possibly repeating)
 * field. `undefined` → absent field.
 * @internal
 */
function repField<K extends CompositeKind>(
  kind: K,
  value: CompositeValueByKind[K] | readonly CompositeValueByKind[K][] | undefined,
): RawField {
  if (value === undefined) return { repetitions: [], isNull: false };
  if (Array.isArray(value)) {
    return encodeCompositeReps(kind, value as readonly CompositeValueByKind[K][]);
  }
  return encodeComposite(kind, value as CompositeValueByKind[K]);
}

/**
 * Build a spec-clean ADT message for `event` (the MSH-9.2 trigger, e.g.
 * `"A01"`, `"A04"`, `"A08"`) from typed inputs.
 *
 * The result is a real {@link Hl7Message}: `msg.toString()` serialises it,
 * `parseHL7(msg.toString())` round-trips with zero warnings, and
 * `msg.patient` / `msg.visit` read back the values supplied.
 *
 * @param event - the ADT trigger event (MSH-9.2). Required, non-empty.
 * @param init - the MSH envelope + typed PID/PV1/EVN content (`patient` required).
 * @throws TypeError when `event` is empty or `init.patient` is absent.
 *
 * @example
 * ```ts
 * import { buildAdt, parseHL7 } from "@cosyte/hl7";
 * const msg = buildAdt("A01", {
 *   sendingApp: "CLINIC",
 *   receivingApp: "LAB",
 *   patient: {
 *     identifiers: { idNumber: "MRN001", identifierTypeCode: "MR" },
 *     name: { familyName: "Test", givenName: "Ann" },
 *     birthDateTime: "19880705",
 *     administrativeSex: "F",
 *   },
 *   visit: { patientClass: "I", assignedLocation: { pointOfCare: "ICU", room: "1", bed: "A" } },
 * });
 * const round = parseHL7(msg.toString());
 * round.warnings.length;          // 0
 * round.patient?.familyName;      // "Test"
 * round.structure.missingGroups;  // []
 * ```
 */
export function buildAdt(event: string, init: BuildAdtInit): Hl7Message {
  if (typeof event !== "string" || event.trim().length === 0) {
    throw new TypeError(
      `buildAdt: \`event\` (the ADT trigger, e.g. "A01") is required and must be a ` +
        `non-empty string. Received: ${JSON.stringify(event)}.`,
    );
  }
  if (
    init === null ||
    (init as BuildAdtInit | undefined) === undefined ||
    init.patient === undefined
  ) {
    throw new TypeError(
      "buildAdt: `patient` is required — an ADT patient event is never emitted with a " +
        "fabricated patient. Supply at least one identifier or a name.",
    );
  }

  const enc = DEFAULT_ENCODING_CHARACTERS;
  const version = init.version ?? "2.5";

  const segments: RawSegment[] = [buildMshSegment(`ADT^${event}`, init)];

  // ── EVN ──────────────────────────────────────────────────────────────────
  // EVN-1 is the (caller-supplied) trigger event — not a fabricated value.
  const evn = init.event;
  segments.push(
    assembleSegment(
      "EVN",
      new Map<number, RawField | undefined>([
        [1, scalarField(event)],
        [
          2,
          evn?.recordedDateTime !== undefined
            ? encodeComposite("TS", evn.recordedDateTime)
            : undefined,
        ],
        [
          6,
          evn?.eventOccurred !== undefined ? encodeComposite("TS", evn.eventOccurred) : undefined,
        ],
      ]),
    ),
  );

  // ── PID ──────────────────────────────────────────────────────────────────
  const p = init.patient;
  segments.push(
    assembleSegment(
      "PID",
      new Map<number, RawField | undefined>([
        [1, p.setId !== undefined ? scalarField(p.setId) : undefined],
        [3, p.identifiers !== undefined ? repField("CX", p.identifiers) : undefined],
        [5, p.name !== undefined ? repField("XPN", p.name) : undefined],
        [
          6,
          p.mothersMaidenName !== undefined
            ? encodeComposite("XPN", p.mothersMaidenName)
            : undefined,
        ],
        [7, p.birthDateTime !== undefined ? encodeComposite("TS", p.birthDateTime) : undefined],
        [8, p.administrativeSex !== undefined ? scalarField(p.administrativeSex) : undefined],
        [11, p.address !== undefined ? repField("XAD", p.address) : undefined],
        [13, p.phoneHome !== undefined ? repField("XTN", p.phoneHome) : undefined],
        [18, p.accountNumber !== undefined ? encodeComposite("CX", p.accountNumber) : undefined],
      ]),
    ),
  );

  // ── PV1 ──────────────────────────────────────────────────────────────────
  // Always emitted so the ADT "visit" group is present (structure-complete),
  // even when the caller supplies no visit — an empty PV1 is the fail-safe,
  // never fabricated content.
  const v = init.visit;
  segments.push(
    assembleSegment(
      "PV1",
      new Map<number, RawField | undefined>([
        [1, v?.setId !== undefined ? scalarField(v.setId) : undefined],
        [2, v?.patientClass !== undefined ? scalarField(v.patientClass) : undefined],
        [
          3,
          v?.assignedLocation !== undefined ? encodeComposite("PL", v.assignedLocation) : undefined,
        ],
        [7, v?.attendingDoctor !== undefined ? repField("XCN", v.attendingDoctor) : undefined],
        [8, v?.referringDoctor !== undefined ? repField("XCN", v.referringDoctor) : undefined],
        [19, v?.visitNumber !== undefined ? encodeComposite("CX", v.visitNumber) : undefined],
        [44, v?.admitDateTime !== undefined ? encodeComposite("TS", v.admitDateTime) : undefined],
      ]),
    ),
  );

  return new Hl7Message({
    segments,
    encodingCharacters: enc,
    version,
    warnings: [],
  });
}
