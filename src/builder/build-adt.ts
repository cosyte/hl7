/**
 * `buildAdt`: author a spec-clean HL7 v2 **ADT** (admit/discharge/transfer)
 * message from typed inputs. The conservative-emit mirror of
 * the read helpers (`msg.patient`, `msg.visit`): a caller supplies structured
 * values (an {@link XPN} name, {@link CX} identifiers, a {@link TS} birth date,
 * a {@link PL} location, …) and `buildAdt` assembles `MSH + EVN + PID + PV1`
 * with correct `^`/`&`/`~` structure via the encode-safe path: never
 * hand-assembling delimiters, never injecting one.
 *
 * **Structurally complete + zero-warning.** The emitted message carries the
 * segment groups the parser's own structure net marks Required for the ADT
 * events it recognises (patient = PID, visit = PV1), so it re-parses with
 * **zero warnings** and `msg.structure.missingGroups` empty.
 *
 * **Merge and move events.** Supplying `priorIdentity` adds the `MRG` segment
 * the published structure requires for the identity-management events (merge,
 * move and their account and visit variants), so those events can be authored
 * spec-clean rather than arriving without the identity they retire. The
 * direction is the spec's and is never inverted: `MRG` carries the PRIOR,
 * non-surviving identity and `PID` the SURVIVING one.
 *
 * **Never fabricate.** Only values the caller supplies are emitted; an omitted
 * optional field becomes an empty/absent field, never a defaulted clinical
 * value. `patient` is **required**: an ADT patient event with no patient is a
 * typed `TypeError`, not a guessed PID.
 *
 * Spec traceability: HL7 v2 Ch. 3 (ADT: MSH/EVN/PID/MRG/PV1), Ch. 2 datatypes.
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

import { encodeComposite } from "./encode-composite.js";
import { evnSegment, pidSegment, pv1Segment } from "./segment-bodies.js";
import {
  assembleSegment,
  buildMshSegment,
  repField,
  type MessageEnvelope,
} from "./segment-fields.js";
import { assertRequiredContent } from "./supported-messages.js";

/** Typed PID (patient identification) content for {@link buildAdt}. */
export interface AdtPatient {
  /** PID-1 Set ID. */
  readonly setId?: string;
  /** PID-3 Patient Identifier List: one or more CX identifiers (MRN, SSN, …). */
  readonly identifiers?: CX | readonly CX[];
  /** PID-5 Patient Name. */
  readonly name?: XPN | readonly XPN[];
  /** PID-6 Mother's Maiden Name. */
  readonly mothersMaidenName?: XPN;
  /** PID-7 Date/Time of Birth. */
  readonly birthDateTime?: TS | string;
  /** PID-8 Administrative Sex (e.g. `"F"`, `"M"`, `"U"`). */
  readonly administrativeSex?: string;
  /** PID-11 Patient Address: one or more XAD addresses. */
  readonly address?: XAD | readonly XAD[];
  /** PID-13 Phone Number - Home: one or more XTN telecoms. */
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

/**
 * Typed MRG (merge patient information) content for {@link buildAdt}: the
 * **prior**, non-surviving identity that a merge or move event retires in
 * favour of the `patient` identity. The direction is HL7's and is constant:
 * the identifiers here merge INTO the ones on PID, never the reverse.
 *
 * @example
 * ```ts
 * import type { AdtPriorIdentity } from "@cosyte/hl7";
 * const prior: AdtPriorIdentity = {
 *   identifiers: { idNumber: "MRN-OLD", identifierTypeCode: "MR" },
 *   accountNumber: { idNumber: "ACCT-OLD" },
 * };
 * ```
 */
export interface AdtPriorIdentity {
  /** MRG-1 Prior Patient Identifier List: one or more CX identifiers. */
  readonly identifiers?: CX | readonly CX[];
  /** MRG-3 Prior Patient Account Number: the merge key of an account merge. */
  readonly accountNumber?: CX;
  /**
   * MRG-4 Prior Patient ID. Backward compatibility only: withdrawn as of HL7
   * v2.7 in favour of MRG-1, and the read side stops reading it on a message
   * whose MSH-12 declares v2.7 or later.
   */
  readonly legacyPatientId?: CX;
  /** MRG-5 Prior Visit Number: the merge key of a visit merge. */
  readonly visitNumber?: CX;
  /** MRG-7 Prior Patient Name. */
  readonly name?: XPN;
}

/** Input for {@link buildAdt}: the MSH envelope plus the typed segment bodies. */
export interface BuildAdtInit extends MessageEnvelope {
  /** PID content. **Required**: never fabricated. */
  readonly patient: AdtPatient;
  /** PV1 content. Optional; an (empty) PV1 is emitted regardless so the visit group is present. */
  readonly visit?: AdtVisit;
  /** EVN content (EVN-1 is the trigger event; EVN-2/6 optional). */
  readonly event?: AdtEvent;
  /**
   * MRG content: the prior identity a merge or move event retires. Optional,
   * and emitted only when supplied. **Required for a trigger event whose
   * published structure requires MRG**, where an init without it is a typed
   * error rather than a message missing the identity it retires.
   */
  readonly priorIdentity?: AdtPriorIdentity;
}

/** Does a CX carry a usable identifier (Ch. 2A: CX.1 is the identifier)? @internal */
function hasUsableId(cx: CX | undefined): boolean {
  return cx !== undefined && cx.idNumber !== undefined && cx.idNumber !== "";
}

/**
 * Does the prior identity carry at least one usable merge key? A name alone
 * never does: the read side would surface a prior party with nothing to
 * retire, which is exactly the message this builder refuses to emit for an
 * event whose structure requires MRG. @internal
 */
function hasPriorIdentityKey(prior: AdtPriorIdentity): boolean {
  const ids = prior.identifiers;
  const idList = ids === undefined ? [] : Array.isArray(ids) ? ids : [ids as CX];
  return (
    (idList as readonly CX[]).some(hasUsableId) ||
    hasUsableId(prior.accountNumber) ||
    hasUsableId(prior.legacyPatientId) ||
    hasUsableId(prior.visitNumber)
  );
}

/** The MRG segment carrying the prior, non-surviving identity. @internal */
function mrgSegment(prior: AdtPriorIdentity): RawSegment {
  return assembleSegment(
    "MRG",
    new Map<number, RawField | undefined>([
      [1, prior.identifiers !== undefined ? repField("CX", prior.identifiers) : undefined],
      [
        3,
        prior.accountNumber !== undefined ? encodeComposite("CX", prior.accountNumber) : undefined,
      ],
      [
        4,
        prior.legacyPatientId !== undefined
          ? encodeComposite("CX", prior.legacyPatientId)
          : undefined,
      ],
      [5, prior.visitNumber !== undefined ? encodeComposite("CX", prior.visitNumber) : undefined],
      [7, prior.name !== undefined ? encodeComposite("XPN", prior.name) : undefined],
    ]),
  );
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
 * @param init - the MSH envelope + typed PID/PV1/EVN content (`patient`
 *   required), plus `priorIdentity` for a merge or move event.
 * @throws TypeError when `event` is empty, when `init.patient` is absent, or
 *   when the requested trigger event's published structure requires MRG and no
 *   prior identity carrying a merge key was supplied.
 *
 * @example
 * ```ts
 * import { buildAdt, parseHL7 } from "@cosyte/hl7";
 * // A merge: the prior identifiers are retired in favour of the surviving ones.
 * const merge = buildAdt("A40", {
 *   patient: { identifiers: { idNumber: "MRN-NEW", identifierTypeCode: "MR" } },
 *   priorIdentity: { identifiers: { idNumber: "MRN-OLD", identifierTypeCode: "MR" } },
 * });
 * const ev = parseHL7(merge.toString()).identityEvents()[0];
 * ev?.prior?.identifiers[0]?.idNumber;     // "MRN-OLD"
 * ev?.surviving?.identifiers[0]?.idNumber; // "MRN-NEW"
 * ```
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
      `buildAdt: ADT^${event} requires \`patient\` (PID). An ADT patient event is never emitted ` +
        "with a fabricated patient. Supply at least one identifier or a name.",
    );
  }

  const enc = DEFAULT_ENCODING_CHARACTERS;
  const version = init.version ?? "2.5";

  // Segment order follows the published ADT shape: PID [PD1] MRG [PV1], so the
  // prior identity sits between the surviving PID and its visit.
  const segments: RawSegment[] = [
    buildMshSegment(`ADT^${event}`, init),
    // EVN-1 is the (caller-supplied) trigger event: not a fabricated value.
    evnSegment(event, init.event),
    pidSegment(init.patient),
  ];

  const prior = init.priorIdentity;
  if (prior !== undefined) segments.push(mrgSegment(prior));

  // PV1 is always emitted so the ADT visit group is present
  // (structure-complete), even when the caller supplies no visit: an empty PV1
  // is the fail-safe, never fabricated content.
  segments.push(pv1Segment(init.visit));

  // A merge or move event whose structure requires MRG needs a prior identity
  // that actually carries a merge key: a name alone leaves the read side with
  // nothing to retire, so it is refused rather than emitted.
  const emitted = new Set(segments.map((s) => s.name));
  if (prior === undefined || !hasPriorIdentityKey(prior)) emitted.delete("MRG");
  assertRequiredContent(
    "buildAdt",
    "ADT",
    event,
    emitted,
    new Map([
      ["PID", "patient"],
      [
        "MRG",
        "priorIdentity, carrying at least one prior identifier, account number or visit number",
      ],
    ]),
  );

  return new Hl7Message({
    segments,
    encodingCharacters: enc,
    version,
    warnings: [],
  });
}
