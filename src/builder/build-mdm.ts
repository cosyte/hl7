/**
 * `buildMdm`: author a spec-clean HL7 v2 **MDM** (medical document management)
 * message from typed inputs. The conservative-emit mirror of the read helper
 * `msg.documents()`: a caller supplies a typed patient and one typed document
 * header, and `buildMdm` assembles `MSH + EVN + PID + PV1 + TXA + [OBX…]` with
 * correct `^`/`&`/`~` structure via the encode-safe path: never
 * hand-assembling delimiters, never injecting one.
 *
 * **Two document families, and the difference is enforced.** The notification
 * events (`T01`, `T03`, `T05`, `T07`, `T09`, `T11`) carry the document header
 * alone; the content events (`T02`, `T04`, `T06`, `T08`, `T10`) additionally
 * require the transcribed body. Asking for a content event with no `body` is a
 * typed `TypeError`, not a message that arrives without its content.
 *
 * **Completion status and availability status are never conflated.** TXA-17
 * (completion) and TXA-19 (availability) are separate typed members and are
 * emitted to separate positions: a document can be available before it is
 * authenticated, and emitting a preliminary document as final is the harm this
 * split prevents. Both travel verbatim; neither is defaulted.
 *
 * **Never fabricate.** Only values the caller supplies are emitted.
 * `patient` and `document` are **required**.
 *
 * Spec traceability: HL7 v2 Ch. 9 (medical records: TXA), Ch. 2 datatypes.
 * Zero runtime deps.
 */

import { Hl7Message } from "../model/message.js";
import { DEFAULT_ENCODING_CHARACTERS } from "../parser/delimiters.js";
import type { RawField, RawSegment } from "../parser/types.js";
import type { TS } from "../model/types/ts.js";

import type { AdtEvent, AdtPatient, AdtVisit } from "./build-adt.js";
import type { OruObservation } from "./build-oru.js";
import { encodeComposite } from "./encode-composite.js";
import { evnSegment, obxSegment, pidSegment, pv1Segment } from "./segment-bodies.js";
import {
  assembleSegment,
  buildMshSegment,
  scalarField,
  type MessageEnvelope,
} from "./segment-fields.js";
import {
  assertRequiredContent,
  assertTriggerEvent,
  assertTypedInit,
} from "./supported-messages.js";

/**
 * Typed PID content for {@link buildMdm}: the same shape every family shares.
 *
 * @example
 * ```ts
 * import type { MdmPatient } from "@cosyte/hl7";
 * const patient: MdmPatient = {
 *   identifiers: { idNumber: "MRN001", identifierTypeCode: "MR" },
 *   name: { familyName: "Test", givenName: "Ann" },
 * };
 * ```
 */
export type MdmPatient = AdtPatient;

/**
 * Typed OBX content for {@link buildMdm}: one line of the transcribed body.
 *
 * @example
 * ```ts
 * import type { MdmObservation } from "@cosyte/hl7";
 * const line: MdmObservation = { setId: "1", valueType: "TX", value: "Discharge summary text." };
 * ```
 */
export type MdmObservation = OruObservation;

/**
 * Typed TXA (transcription document header) content for {@link buildMdm}.
 *
 * @example
 * ```ts
 * import type { MdmDocument } from "@cosyte/hl7";
 * const document: MdmDocument = {
 *   documentType: "DS",
 *   uniqueDocumentNumber: "DOC-1001",
 *   completionStatus: "AU",   // authenticated
 *   availabilityStatus: "AV", // a different axis: available
 *   body: [{ setId: "1", valueType: "TX", value: "Discharge summary text." }],
 * };
 * ```
 */
export interface MdmDocument {
  /** TXA-1 Set ID. */
  readonly setId?: string;
  /** TXA-2 Document Type (HL7 Table 0270), verbatim. */
  readonly documentType?: string;
  /** TXA-4 Activity Date/Time. */
  readonly activityDateTime?: TS | string;
  /** TXA-12 Unique Document Number. */
  readonly uniqueDocumentNumber?: string;
  /** TXA-13 Parent Document Number: the addendum or replacement link. */
  readonly parentDocumentNumber?: string;
  /**
   * TXA-17 Document **Completion** Status (HL7 Table 0271: `DO`, `IP`, `AU`,
   * `LA`, `IN`). A different axis from {@link availabilityStatus}: never
   * merged, never defaulted.
   */
  readonly completionStatus?: string;
  /**
   * TXA-19 Document **Availability** Status (HL7 Table 0273: `AV`, `CA`, `OB`,
   * `UN`). A different axis from {@link completionStatus}: never merged, never
   * defaulted.
   */
  readonly availabilityStatus?: string;
  /**
   * The transcribed narrative body, one OBX per entry. **Required for the
   * content events** (`T02`, `T04`, `T06`, `T08`, `T10`), whose published
   * structure gives OBX a minimum of one.
   */
  readonly body?: readonly MdmObservation[];
}

/**
 * Input for {@link buildMdm}: the MSH envelope plus the typed segment bodies.
 *
 * @example
 * ```ts
 * import type { BuildMdmInit } from "@cosyte/hl7";
 * const init: BuildMdmInit = {
 *   sendingApp: "TRANSCRIPTION",
 *   receivingApp: "EHR",
 *   patient: { identifiers: { idNumber: "MRN001", identifierTypeCode: "MR" } },
 *   document: { documentType: "DS", body: [{ valueType: "TX", value: "Report text." }] },
 * };
 * ```
 */
export interface BuildMdmInit extends MessageEnvelope {
  /** PID content. **Required**: never fabricated. */
  readonly patient: MdmPatient;
  /** TXA content. **Required**: a document notification with no document is a typed error. */
  readonly document: MdmDocument;
  /** PV1 content. Optional; an (empty) PV1 is emitted regardless so the visit group is present. */
  readonly visit?: AdtVisit;
  /** EVN content (EVN-1 is the trigger event; EVN-2/6 optional). */
  readonly event?: AdtEvent;
}

/** One TXA segment from typed document content. @internal */
function txaSegment(doc: MdmDocument): RawSegment {
  return assembleSegment(
    "TXA",
    new Map<number, RawField | undefined>([
      [1, doc.setId !== undefined ? scalarField(doc.setId) : undefined],
      [2, doc.documentType !== undefined ? scalarField(doc.documentType) : undefined],
      [
        4,
        doc.activityDateTime !== undefined
          ? encodeComposite("TS", doc.activityDateTime)
          : undefined,
      ],
      [
        12,
        doc.uniqueDocumentNumber !== undefined ? scalarField(doc.uniqueDocumentNumber) : undefined,
      ],
      [
        13,
        doc.parentDocumentNumber !== undefined ? scalarField(doc.parentDocumentNumber) : undefined,
      ],
      [17, doc.completionStatus !== undefined ? scalarField(doc.completionStatus) : undefined],
      [19, doc.availabilityStatus !== undefined ? scalarField(doc.availabilityStatus) : undefined],
    ]),
  );
}

/**
 * Build a spec-clean MDM message for `event` (the MSH-9.2 trigger, e.g.
 * `"T02"` original document notification and content, `"T06"` document addendum
 * notification and content) from typed inputs.
 *
 * The result is a real {@link Hl7Message}: `msg.toString()` serialises it,
 * `parseHL7(msg.toString())` round-trips with zero warnings, and
 * `msg.documents()` reads back the document header and body supplied.
 *
 * @param event - the MDM trigger event (MSH-9.2). Required, non-empty.
 * @param init - the MSH envelope + typed PID/PV1/TXA content. `patient` and
 *   `document` are required; `document.body` is required for the content events.
 * @throws TypeError when `event` is empty, when `init` is not an object, when
 *   `patient` or `document` is absent, or when a content event is asked for
 *   with no body.
 *
 * @example
 * ```ts
 * import { buildMdm, parseHL7 } from "@cosyte/hl7";
 * const msg = buildMdm("T02", {
 *   sendingApp: "TRANSCRIPTION",
 *   receivingApp: "EHR",
 *   patient: { identifiers: { idNumber: "MRN001", identifierTypeCode: "MR" } },
 *   document: {
 *     documentType: "DS",
 *     uniqueDocumentNumber: "DOC-1001",
 *     completionStatus: "AU",
 *     availabilityStatus: "AV",
 *     body: [{ setId: "1", valueType: "TX", value: "Discharge summary text." }],
 *   },
 * });
 * const round = parseHL7(msg.toString());
 * round.warnings.length;                       // 0
 * round.documents()[0]?.completionStatus;      // "AU"
 * round.documents()[0]?.observations[0]?.value; // "Discharge summary text."
 * ```
 */
export function buildMdm(event: string, init: BuildMdmInit): Hl7Message {
  assertTriggerEvent("buildMdm", "T02", event);
  assertTypedInit("buildMdm", init);
  if (init.patient === undefined) {
    throw new TypeError(
      `buildMdm: MDM^${event} requires \`patient\` (PID). A document notification is never ` +
        "emitted with a fabricated subject.",
    );
  }
  if (init.document === undefined) {
    throw new TypeError(
      `buildMdm: MDM^${event} requires \`document\` (TXA). A document notification with no ` +
        "document header is a typed error, never a fabricated document.",
    );
  }

  const segments: RawSegment[] = [
    buildMshSegment(`MDM^${event}`, init),
    evnSegment(event, init.event),
    pidSegment(init.patient),
    // Every MDM structure the registry recognises requires the visit group, so
    // an (empty) PV1 is emitted regardless: the structural fail-safe, never
    // fabricated content.
    pv1Segment(init.visit),
    txaSegment(init.document),
  ];
  for (const obs of init.document.body ?? []) segments.push(obxSegment(obs));

  assertRequiredContent(
    "buildMdm",
    "MDM",
    event,
    new Set(segments.map((s) => s.name)),
    new Map([
      ["PID", "patient"],
      ["TXA", "document"],
      ["OBX", "document.body"],
    ]),
  );

  return new Hl7Message({
    segments,
    encodingCharacters: DEFAULT_ENCODING_CHARACTERS,
    version: init.version ?? "2.5",
    warnings: [],
  });
}
